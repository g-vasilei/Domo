import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { generateVAPIDKeys, sendNotification } from 'web-push';

import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';

const ALARM: Record<string, [string, string]> = {
  TRIGGERED: ['⚠️ Ενεργοποίηση συναγερμού!', 'Ο συναγερμός σας ενεργοποιήθηκε.'],
  ARMED_HOME: ['🔒 Οπλισμένος — Εντός', 'Το σύστημα οπλίστηκε σε λειτουργία εντός σπιτιού.'],
  ARMED_AWAY: ['🔒 Οπλισμένος — Εκτός', 'Το σύστημα οπλίστηκε σε λειτουργία εκτός σπιτιού.'],
  DISARMED: ['🔓 Αφοπλισμένος', 'Το σύστημα συναγερμού αφοπλίστηκε.'],
  ENTRY_DELAY: ['⏱ Καθυστέρηση εισόδου', 'Αφοπλίστε τώρα για να μην ενεργοποιηθεί ο συναγερμός.'],
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  sendPush = sendNotification;
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async getPushSettings(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true, pushContactEmail: true },
    });
    if (user?.role !== 'OWNER')
      throw new ForbiddenException('Only owners can manage push contact settings');
    return { contactEmail: user.pushContactEmail ?? '', defaultEmail: user.email };
  }

  async updatePushSettings(userId: string, contactEmail: string) {
    await this.getPushSettings(userId);
    const user = await this.prisma.user.update({
      where: { id: userId, role: 'OWNER' },
      data: { pushContactEmail: contactEmail || null },
      select: { email: true, pushContactEmail: true },
    });
    return { contactEmail: user.pushContactEmail ?? '', defaultEmail: user.email };
  }

  async keys() {
    const existing = await this.prisma.pushKey.findUnique({ where: { id: 'vapid' } });
    if (existing) return existing;
    const keys = generateVAPIDKeys();
    return this.prisma.pushKey.upsert({
      where: { id: 'vapid' },
      update: {},
      create: {
        id: 'vapid',
        publicKey: keys.publicKey,
        privateKey: this.encryption.encrypt(keys.privateKey),
      },
    });
  }

  async subscribe(
    userId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    // Push endpoints are contacted by the server. Accept only browser push services.
    let url: URL;
    try {
      url = new URL(subscription.endpoint);
    } catch {
      throw new BadRequestException('Invalid push endpoint');
    }
    if (
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      !/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(
        url.hostname,
      )
    ) {
      throw new BadRequestException('Unsupported push endpoint');
    }
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: { endpoint: subscription.endpoint, userId, ...subscription.keys },
      update: { userId, ...subscription.keys },
    });
  }

  unsubscribe(userId: string, endpoint: string) {
    return this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  list(userId: string) {
    return this.prisma.appNotification.findMany({
      where: { userId },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: 50,
    });
  }
  read(userId: string, ids: string[]) {
    return this.prisma.appNotification.updateMany({
      where: { userId, id: { in: ids } },
      data: { read: true },
    });
  }
  clear(userId: string, ids: string[]) {
    return this.prisma.appNotification.deleteMany({ where: { userId, id: { in: ids } } });
  }

  async deliver(
    userIds: string[],
    event: string,
    payload: any,
    emit: (id: string, item: any) => void,
  ) {
    let data: { kind: string; title: string; body: string; state?: string; deviceId?: string };
    if (event === 'alarm:state') {
      const message = ALARM[payload.state];
      if (!message) return;
      data = { kind: 'alarm', title: message[0], body: message[1], state: payload.state };
    } else if (event === 'automation:alert') {
      data = {
        kind: 'automation',
        title: payload.ruleName ? `🤖 ${payload.ruleName}` : '🤖 Αυτοματισμός',
        body: payload.message,
      };
    } else if (event === 'device:alert') {
      const battery = payload.type === 'battery_low';
      data = {
        kind: battery ? 'battery' : 'device',
        deviceId: payload.deviceId,
        title: battery
          ? `🔋 Χαμηλή μπαταρία — ${payload.deviceName}`
          : `📡 Άλλαξε η συσκευή ${payload.deviceName}`,
        body: battery
          ? `Η μπαταρία είναι στο ${payload.batteryLevel}%. Αντικαταστήστε την σύντομα.`
          : (payload.commands ?? []).map((c: any) => `${c.code}: ${c.value}`).join(', ') ||
            'Η κατάσταση συσκευής ενημερώθηκε',
      };
    } else return;

    await Promise.all(
      [...new Set(userIds)].map(async (userId) => {
        const item = await this.prisma.appNotification.create({ data: { userId, ...data } });
        emit(userId, item);
        const expired = await this.prisma.appNotification.findMany({
          where: { userId },
          orderBy: [{ at: 'desc' }, { id: 'desc' }],
          skip: 50,
          select: { id: true },
        });
        if (expired.length)
          await this.prisma.appNotification.deleteMany({
            where: { userId, id: { in: expired.map((n) => n.id) } },
          });
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            notificationsEnabled: true,
            role: true,
            email: true,
            pushContactEmail: true,
            createdBy: { select: { email: true, pushContactEmail: true } },
          },
        });
        if (!user?.notificationsEnabled) return;
        const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
        if (!subscriptions.length) return;
        const owner = user.role === 'MEMBER' ? user.createdBy : user;
        if (!owner) return;
        const subject = `mailto:${owner.pushContactEmail || owner.email}`;
        const keys = await this.keys();
        await Promise.all(
          subscriptions.map(async (subscription) => {
            try {
              await this.sendPush(
                {
                  endpoint: subscription.endpoint,
                  keys: { p256dh: subscription.p256dh, auth: subscription.auth },
                },
                JSON.stringify({
                  id: item.id,
                  title: item.title,
                  body: item.body,
                  url: item.deviceId ? `/devices/${encodeURIComponent(item.deviceId)}` : '/',
                }),
                {
                  vapidDetails: {
                    subject,
                    publicKey: keys.publicKey,
                    privateKey: this.encryption.decrypt(keys.privateKey),
                  },
                  TTL: 3600,
                  timeout: 10_000,
                },
              );
            } catch (error: any) {
              if (error.statusCode === 404 || error.statusCode === 410) {
                await this.prisma.pushSubscription.deleteMany({
                  where: { endpoint: subscription.endpoint, userId },
                });
              } else
                this.logger.error(
                  `Push delivery failed for user ${userId}: ${error.statusCode ?? error.message}`,
                );
            }
          }),
        );
      }),
    );
  }
}
