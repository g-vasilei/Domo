import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';

import { AutomationEvaluatorService } from '../automation/automation-evaluator.service';
import { PrismaService } from '../prisma/prisma.service';
import { TuyaService } from '../tuya/tuya.service';
import { UsersService } from '../users/users.service';
import { assertCanViewDevices, canAccessDevice, DeviceAction } from './device-permissions';
import { DevicesGateway } from './devices.gateway';

/** Battery codes Tuya devices report */
const BATTERY_PCT_CODES = ['battery_percentage', 'battery_value', 'residual_electricity'];
const BATTERY_STATE_CODE = 'battery_state';
const BATTERY_LOW_THRESHOLD = 20; // percent

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);
  constructor(
    private readonly usersService: UsersService,
    private readonly tuyaService: TuyaService,
    private readonly gateway: DevicesGateway,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AutomationEvaluatorService))
    private readonly automationEvaluator: AutomationEvaluatorService,
  ) {}

  /** deviceId → last-known battery percentage (in-memory dedup) */
  private readonly batteryStates = new Map<string, number>();

  private async getCreds(userId: string) {
    const creds = await this.usersService.getTuyaCredentials(userId);
    if (!creds) throw new BadRequestException('Tuya credentials not configured');
    return creds;
  }

  async getRooms(userId: string) {
    const viewer = await this.deviceViewer(userId);
    const creds = await this.getCreds(userId);
    try {
      const rooms = await this.tuyaService.getRooms(
        creds.accessId,
        creds.accessSecret,
        creds.region as any,
      );
      if (viewer.role === 'OWNER') return rooms;
      return rooms
        .map((room: any) => ({
          ...room,
          devices: room.devices.filter((device: any) => canAccessDevice(viewer, device.id, 'view')),
        }))
        .filter((room: any) => room.devices.length > 0);
    } catch (e: any) {
      throw new BadGatewayException(e?.message ?? 'Failed to retrieve rooms from Tuya');
    }
  }

  async getDevices(userId: string) {
    const viewer = await this.deviceViewer(userId);
    const creds = await this.getCreds(userId);
    try {
      const result = await this.tuyaService.getDevices(
        creds.accessId,
        creds.accessSecret,
        creds.region as any,
      );
      const devices = result?.devices ?? result ?? [];
      return devices.filter((device: any) => canAccessDevice(viewer, device.id, 'view'));
    } catch (e: any) {
      throw new BadGatewayException(e?.message ?? 'Failed to retrieve devices from Tuya');
    }
  }

  async getDevice(userId: string, deviceId: string) {
    await this.deviceAccess(userId, deviceId, 'view');
    const creds = await this.getCreds(userId);
    try {
      const device = await this.tuyaService.getDevice(
        creds.accessId,
        creds.accessSecret,
        creds.region as any,
        deviceId,
      );
      this.checkBatteryAlert(userId, device).catch(() => {});
      return device;
    } catch (e: any) {
      throw new BadGatewayException(e?.message ?? 'Failed to retrieve device from Tuya');
    }
  }

  async getDeviceSpecifications(userId: string, deviceId: string) {
    await this.deviceAccess(userId, deviceId, 'view');
    const creds = await this.getCreds(userId);
    try {
      return await this.tuyaService.getDeviceSpecifications(
        creds.accessId,
        creds.accessSecret,
        creds.region as any,
        deviceId,
      );
    } catch (e: any) {
      throw new BadGatewayException(e?.message ?? 'Failed to retrieve device capabilities');
    }
  }

  async getDeviceStatus(userId: string, deviceId: string) {
    await this.deviceAccess(userId, deviceId, 'view');
    const creds = await this.getCreds(userId);
    try {
      return await this.tuyaService.getDeviceStatus(
        creds.accessId,
        creds.accessSecret,
        creds.region as any,
        deviceId,
      );
    } catch (e: any) {
      throw new BadGatewayException(e?.message ?? 'Failed to retrieve device status from Tuya');
    }
  }

  async sendCommand(
    userId: string,
    deviceId: string,
    commands: { code: string; value: unknown }[],
  ) {
    const ownerId = await this.deviceAccess(userId, deviceId, 'control');
    const creds = await this.getCreds(userId);
    try {
      const result = await this.tuyaService.sendCommand(
        creds.accessId,
        creds.accessSecret,
        creds.region as any,
        deviceId,
        commands,
      );
      if (result === false) throw new Error('Device rejected command');
      this.deviceRecipients(ownerId, deviceId)
        .then((ids) => this.gateway.broadcastToUsers(ids, 'device:update', { deviceId, commands }))
        .catch((error) => this.logger.error('Could not broadcast device update', error));
      this.logCommand(userId, deviceId, commands).catch((error) =>
        this.logger.error('Could not record device command', error),
      );
      this.notifyDeviceChange(userId, deviceId, commands).catch(() => {});
      this.automationEvaluator
        .evaluateOnCommand(ownerId, deviceId, commands)
        .catch((error) => this.logger.error(`Automation evaluation failed for ${deviceId}`, error));
      return result;
    } catch (e: any) {
      await this.logCommand(userId, deviceId, commands, true).catch((error) =>
        this.logger.error('Could not record failed command', error),
      );
      throw new BadGatewayException(e?.message ?? 'Failed to send command to Tuya');
    }
  }

  // ── Notification preferences ───────────────────────────────────────────────

  async getNotifPref(userId: string, deviceId: string) {
    await this.deviceAccess(userId, deviceId, 'view');
    const pref = await this.prisma.deviceNotifPref.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
    });
    return { enabled: pref?.enabled ?? false };
  }

  async setNotifPref(userId: string, deviceId: string, enabled: boolean, deviceName = '') {
    await this.deviceAccess(userId, deviceId, 'view');
    return this.prisma.deviceNotifPref.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: { userId, deviceId, enabled, deviceName },
      update: { enabled, ...(deviceName ? { deviceName } : {}) },
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /**
   * After a command is sent by `userId`, notify all OTHER users in the same
   * account who have device notifications enabled for this device.
   */
  private async notifyDeviceChange(
    actorId: string,
    deviceId: string,
    commands: { code: string; value: unknown }[],
  ) {
    const groupIds = await this.deviceRecipients(actorId, deviceId);
    const others = groupIds.filter((id) => id !== actorId);
    if (others.length === 0) return;

    const prefs = await this.prisma.deviceNotifPref.findMany({
      where: { userId: { in: others }, deviceId, enabled: true },
    });
    if (prefs.length === 0) return;

    const deviceName = prefs[0]?.deviceName || deviceId;
    const recipientIds = prefs.map((p) => p.userId);
    this.gateway.broadcastToUsers(recipientIds, 'device:alert', {
      type: 'state_change',
      deviceId,
      deviceName,
      commands,
    });
  }

  /**
   * Check if the device has a low battery and emit an alert to all users in
   * the group who have notifications enabled for this device.
   * Deduplicates using an in-memory map so the alert fires only on transition.
   */
  private async checkBatteryAlert(userId: string, device: any) {
    if (!device?.id || !device?.status) return;

    const status: any[] = device.status ?? [];
    let pct: number | null = null;

    for (const code of BATTERY_PCT_CODES) {
      const entry = status.find((s: any) => s.code === code);
      if (entry && typeof entry.value === 'number') {
        // Tuya sometimes encodes in tenths
        pct = entry.value > 100 ? entry.value / 10 : entry.value;
        break;
      }
    }

    if (pct === null) {
      const stateEntry = status.find((s: any) => s.code === BATTERY_STATE_CODE);
      if (stateEntry?.value === 'low') pct = 10;
    }

    if (pct === null) return;

    const deviceId: string = device.id;
    const prev = this.batteryStates.get(deviceId);
    this.batteryStates.set(deviceId, pct);

    // Only alert on the first detection or on a transition to low
    const wasLow = prev !== undefined && prev < BATTERY_LOW_THRESHOLD;
    const isLow = pct < BATTERY_LOW_THRESHOLD;
    if (!isLow || wasLow) return;

    const groupIds = await this.deviceRecipients(userId, deviceId);
    const prefs = await this.prisma.deviceNotifPref.findMany({
      where: { userId: { in: groupIds }, deviceId, enabled: true },
    });
    if (prefs.length === 0) return;

    const deviceName = prefs[0]?.deviceName || device.name || deviceId;
    const recipientIds = prefs.map((p) => p.userId);
    this.gateway.broadcastToUsers(recipientIds, 'device:alert', {
      type: 'battery_low',
      deviceId,
      deviceName,
      batteryLevel: Math.round(pct),
    });
  }

  // ── Device timers ──────────────────────────────────────────────────────────

  private async deviceViewer(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { permissions: true },
    });
    assertCanViewDevices(user);
    return user;
  }

  async deviceAccess(userId: string, deviceId: string, action: DeviceAction) {
    const user = await this.deviceViewer(userId);
    if (!canAccessDevice(user, deviceId, action)) {
      throw new ForbiddenException('No permission for this device action');
    }
    return user.role === 'MEMBER' ? user.createdById! : userId;
  }

  private async deviceRecipients(userId: string, deviceId: string) {
    const ownerId = await this.resolveOwnerId(userId);
    const users = await this.prisma.user.findMany({
      where: { OR: [{ id: ownerId }, { createdById: ownerId }] },
      include: { permissions: true },
    });
    return users.filter((user) => canAccessDevice(user, deviceId, 'view')).map((user) => user.id);
  }

  async getTimers(userId: string) {
    await this.deviceViewer(userId);
    const ownerId = await this.resolveOwnerId(userId);
    const timers = await this.prisma.deviceTimer.findMany({ where: { userId: ownerId } });
    const visible = [];
    for (const timer of timers) {
      try {
        await this.deviceAccess(userId, timer.deviceId, 'view');
        visible.push(timer);
      } catch {
        /* inaccessible device */
      }
    }
    return visible;
  }

  private readonly timerOperations = new Map<string, Promise<unknown>>();

  private async withTimerLock<T>(deviceId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.timerOperations.get(deviceId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    this.timerOperations.set(deviceId, current);
    try {
      return await current;
    } finally {
      if (this.timerOperations.get(deviceId) === current) this.timerOperations.delete(deviceId);
    }
  }

  async expireTimer(id: string, deviceId: string) {
    return this.withTimerLock(deviceId, async () => {
      const timer = await this.prisma.deviceTimer.findUnique({ where: { id } });
      if (!timer || timer.endsAt.getTime() > Date.now()) return;
      await this.sendCommand(timer.userId, timer.deviceId, [
        { code: timer.switchCode, value: false },
      ]);
      await this.prisma.deviceTimer.deleteMany({ where: { id: timer.id, endsAt: timer.endsAt } });
    });
  }

  async createTimer(
    userId: string,
    deviceId: string,
    deviceName: string,
    switchCode: string,
    minutes: number,
    extend = false,
  ) {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      throw new BadRequestException('Duration must be between 1 and 1440 minutes');
    }
    return this.withTimerLock(deviceId, async () => {
      const ownerId = await this.deviceAccess(userId, deviceId, 'control');
      const device = await this.getDevice(ownerId, deviceId);
      if (!device.status?.some((s: any) => s.code === switchCode && typeof s.value === 'boolean')) {
        throw new BadRequestException('Device does not expose this power switch');
      }
      const requestedEnd = new Date(Date.now() + minutes * 60_000);
      // Persist auto-off before sending power-on, including ambiguous network failures.
      const timer = await this.prisma.$transaction(async (tx) => {
        const previous = await tx.deviceTimer.findUnique({
          where: { userId_deviceId: { userId: ownerId, deviceId } },
        });
        const endsAt =
          extend && previous && previous.endsAt > requestedEnd ? previous.endsAt : requestedEnd;
        return tx.deviceTimer.upsert({
          where: { userId_deviceId: { userId: ownerId, deviceId } },
          create: { userId: ownerId, deviceId, deviceName, switchCode, endsAt },
          update: { deviceName, switchCode, endsAt },
        });
      });
      await this.sendCommand(userId, deviceId, [{ code: switchCode, value: true }]);
      return timer;
    });
  }

  async cancelTimer(userId: string, deviceId: string) {
    const ownerId = await this.deviceAccess(userId, deviceId, 'control');
    await this.withTimerLock(deviceId, () =>
      this.prisma.deviceTimer.deleteMany({ where: { userId: ownerId, deviceId } }),
    );
  }

  private async resolveOwnerId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, createdById: true },
    });
    return user?.role === 'MEMBER' && user.createdById ? user.createdById : userId;
  }

  private async logCommand(
    userId: string,
    deviceId: string,
    commands: { code: string; value: unknown }[],
    failed = false,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, createdById: true },
    });
    const ownerId = user?.role === 'MEMBER' ? (user.createdById ?? userId) : userId;
    await this.prisma.log.create({
      data: {
        userId,
        level: failed ? 'error' : 'info',
        message: `${failed ? 'Αποτυχία εντολής συσκευής' : 'Εντολή συσκευής'}: ${commands.map((c) => `${c.code}=${c.value}`).join(', ')}`,
        context: 'device',
        metadata: { deviceId, commands: commands as any, ownerId },
      },
    });
  }
}
