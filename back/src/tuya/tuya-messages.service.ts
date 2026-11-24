import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import WebSocket from 'ws';

import { decodeTuyaMessage, messagePassword, TuyaReport } from './tuya-message-codec';

export interface TuyaCredentials {
  accessId: string;
  accessSecret: string;
  region: string;
}

const HOSTS: Record<string, string> = {
  eu: 'mqe.tuyaeu.com',
  us: 'mqe.tuyaus.com',
  cn: 'mqe.tuyacn.com',
};
interface Subscription {
  socket?: WebSocket;
  secret: string;
  connected: boolean;
  stopped: boolean;
  retries: number;
  retry?: NodeJS.Timeout;
  heartbeat?: NodeJS.Timeout;
  lastPong: number;
  received: number;
  lastMessageAt?: number;
  connectedAt?: number;
  queue: Promise<void>;
}

@Injectable()
export class TuyaMessagesService extends EventEmitter implements OnModuleDestroy {
  private readonly logger = new Logger(TuyaMessagesService.name);
  private readonly subscriptions = new Map<string, Subscription>();

  ensure(creds: TuyaCredentials) {
    if (process.env.TUYA_MESSAGES_ENABLED === 'false' || !HOSTS[creds.region]) return;
    const key = `${creds.region}:${creds.accessId}`;
    const previous = this.subscriptions.get(key);
    if (previous?.secret === creds.accessSecret) return;
    if (previous) this.stop(previous);
    const subscription: Subscription = {
      secret: creds.accessSecret,
      connected: false,
      stopped: false,
      retries: 0,
      lastPong: 0,
      received: 0,
      queue: Promise.resolve(),
    };
    this.subscriptions.set(key, subscription);
    this.connect(creds, subscription);
  }

  connected(creds: TuyaCredentials) {
    const subscription = this.subscriptions.get(`${creds.region}:${creds.accessId}`);
    return (
      subscription?.secret === creds.accessSecret &&
      subscription.connected &&
      Date.now() - subscription.lastPong <= 70_000
    );
  }

  diagnostics(creds: TuyaCredentials) {
    const subscription = this.subscriptions.get(`${creds.region}:${creds.accessId}`);
    return {
      received: subscription?.received ?? 0,
      lastMessageAt: subscription?.lastMessageAt ?? null,
      connectedAt: subscription?.connectedAt ?? null,
    };
  }

  private createSocket(url: string, options: WebSocket.ClientOptions) {
    return new WebSocket(url, options);
  }

  private connect(creds: TuyaCredentials, subscription: Subscription) {
    if (subscription.stopped) return;
    const project = encodeURIComponent(creds.accessId);
    const url = `wss://${HOSTS[creds.region]}:8285/ws/v2/consumer/persistent/${project}/out/event/${project}-sub?subscriptionType=Failover&ackTimeoutMillis=30000`;
    const socket = this.createSocket(url, {
      headers: {
        username: creds.accessId,
        password: messagePassword(creds.accessId, creds.accessSecret),
      },
      handshakeTimeout: 15_000,
      maxPayload: 1024 * 1024,
    });
    subscription.socket = socket;
    const current = () => !subscription.stopped && subscription.socket === socket;
    socket.on('open', () => {
      if (!current()) {
        socket.terminate();
        return;
      }
      subscription.connected = true;
      subscription.retries = 0;
      subscription.lastPong = Date.now();
      subscription.connectedAt = Date.now();
      this.emit('connected', creds);
      subscription.heartbeat = setInterval(() => {
        if (Date.now() - subscription.lastPong > 70_000) socket.terminate();
        else if (socket.readyState === WebSocket.OPEN) socket.ping();
      }, 30_000);
      subscription.heartbeat.unref?.();
      this.logger.log('Tuya device message subscription connected');
    });
    socket.on('pong', () => {
      subscription.lastPong = Date.now();
    });
    socket.on('ping', () => {
      subscription.lastPong = Date.now();
    });
    socket.on('message', (bytes) => {
      subscription.queue = subscription.queue
        .then(async () => {
          if (!current()) return;
          const { messageId, report } = decodeTuyaMessage(bytes.toString(), creds.accessSecret);
          subscription.received++;
          subscription.lastMessageAt = Date.now();
          if (report) {
            for (const listener of this.listeners('report'))
              await listener(creds, report as TuyaReport);
          }
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ messageId }));
        })
        .catch(() => {
          this.logger.warn('Could not authenticate or process a Tuya device message; reconnecting');
          socket.terminate();
        });
    });
    socket.on('error', () => {
      /* close schedules a bounded reconnect; never log auth headers. */
    });
    socket.on('close', () => {
      if (!current()) return;
      subscription.connected = false;
      if (subscription.heartbeat) clearInterval(subscription.heartbeat);
      this.emit('disconnected', creds);
      if (subscription.stopped) return;
      const delay = Math.min(600_000, 30_000 * 2 ** Math.min(subscription.retries++, 5));
      if (subscription.retries === 1)
        this.logger.warn(
          'Tuya Message Service unavailable; using periodic checks. Enable production messages in the Tuya project.',
        );
      subscription.retry = setTimeout(() => this.connect(creds, subscription), delay);
      subscription.retry.unref?.();
    });
  }

  private stop(subscription: Subscription) {
    subscription.stopped = true;
    subscription.connected = false;
    if (subscription.retry) clearTimeout(subscription.retry);
    if (subscription.heartbeat) clearInterval(subscription.heartbeat);
    subscription.socket?.terminate();
  }

  onModuleDestroy() {
    for (const subscription of this.subscriptions.values()) this.stop(subscription);
    this.subscriptions.clear();
    this.removeAllListeners();
  }
}
