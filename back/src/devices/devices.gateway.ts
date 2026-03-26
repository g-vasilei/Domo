import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true },
})
export class DevicesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(DevicesGateway.name);

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ??
        client.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) throw new Error('No token');
      const payload = this.jwt.verify(token);
      client.data.userId = payload.sub;
      this.logger.log(`Client connected: ${client.id} (user ${payload.sub})`);
    } catch {
      this.logger.warn(`Unauthorized WebSocket connection — disconnecting ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /** Call this after a successful command to push the new status to all sessions */
  broadcastDeviceUpdate(userId: string, deviceId: string, commands: { code: string; value: unknown }[]) {
    this.server.sockets.sockets.forEach((socket) => {
      if (socket.data.userId === userId) {
        socket.emit('device:update', { deviceId, commands });
      }
    });
  }

  /** Broadcast alarm state change to all sessions of a user */
  broadcastAlarmState(userId: string, payload: object) {
    this.server.sockets.sockets.forEach((socket) => {
      if (socket.data.userId === userId) {
        socket.emit('alarm:state', payload);
      }
    });
  }

  /** Broadcast any event to all sessions of a set of users */
  broadcastToUsers(userIds: string[], event: string, payload: object) {
    this.server.sockets.sockets.forEach((socket) => {
      if (userIds.includes(socket.data.userId)) {
        socket.emit(event, payload);
      }
    });
  }
}
