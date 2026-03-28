import { BadRequestException, Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { AlarmAction, AlarmState } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { EncryptionService } from '../encryption/encryption.service';
import { DevicesGateway } from '../devices/devices.gateway';
import { DevicesService } from '../devices/devices.service';
import { PrismaService } from '../prisma/prisma.service';
import { AlarmCallService } from './alarm-call.service';
import { CreateRuleDto, CreateTriggerActionDto, UpdateDisplayDto, UpdateRuleDto, UpdateTriggerActionDto } from './dto/alarm.dto';

@Injectable()
export class AlarmService implements OnModuleInit {
  private readonly logger = new Logger(AlarmService.name);

  private exitTimers = new Map<string, NodeJS.Timeout>();
  private entryTimers = new Map<string, NodeJS.Timeout>();
  private pollTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private prisma: PrismaService,
    private gateway: DevicesGateway,
    private devicesService: DevicesService,
    private callService: AlarmCallService,
    private encryption: EncryptionService,
  ) {}

  async onModuleInit() {
    // Restore polling for users who were armed when the server last restarted
    const armed = await this.prisma.alarmSettings.findMany({
      where: { state: { in: ['ARMED_HOME', 'ARMED_AWAY'] } },
    });
    for (const s of armed) {
      this.startPolling(s.userId, s.state as 'ARMED_HOME' | 'ARMED_AWAY');
      this.logger.log(`Restored polling for user ${s.userId} (${s.state})`);
    }
  }

  // ── Settings ─────────────────────────────────────────────────────────────

  async getSettings(userId: string) {
    const s = await this.prisma.alarmSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return {
      ...s,
      infobipApiKey: undefined, // never expose the encrypted key
      infobipConfigured: !!s.infobipApiKey,
    };
  }

  async setPin(userId: string, pin: string, currentPin?: string) {
    const existing = await this.prisma.alarmSettings.findUnique({ where: { userId } });
    if (existing?.pinHash) {
      if (!currentPin) throw new UnauthorizedException('Current PIN required to change PIN');
      const valid = await bcrypt.compare(currentPin, existing.pinHash);
      if (!valid) throw new UnauthorizedException('Current PIN is incorrect');
    }
    const pinHash = await bcrypt.hash(pin, 10);
    return this.prisma.alarmSettings.upsert({
      where: { userId },
      create: { userId, pinHash },
      update: { pinHash },
    });
  }

  async updateDisplaySettings(userId: string, dto: UpdateDisplayDto) {
    const data: any = { ...dto };
    if (dto.infobipApiKey) {
      data.infobipApiKey = this.encryption.encrypt(dto.infobipApiKey);
    }
    return this.prisma.alarmSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  // ── Rules ─────────────────────────────────────────────────────────────────

  async getRules(userId: string) {
    return this.prisma.alarmRule.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createRule(userId: string, dto: CreateRuleDto) {
    return this.prisma.alarmRule.create({
      data: {
        userId,
        deviceId: dto.deviceId,
        deviceName: dto.deviceName,
        triggerCode: dto.triggerCode,
        triggerValue: dto.triggerValue as any,
        activeInHome: dto.activeInHome ?? false,
        activeInAway: dto.activeInAway ?? true,
        action: (dto.action as AlarmAction) ?? 'ENTRY_DELAY',
      },
    });
  }

  async updateRule(userId: string, ruleId: string, dto: UpdateRuleDto) {
    return this.prisma.alarmRule.updateMany({
      where: { id: ruleId, userId },
      data: {
        ...dto,
        action: dto.action as AlarmAction | undefined,
      },
    });
  }

  async deleteRule(userId: string, ruleId: string) {
    return this.prisma.alarmRule.deleteMany({
      where: { id: ruleId, userId },
    });
  }

  // ── Trigger Actions ───────────────────────────────────────────────────────

  async getTriggerActions(userId: string) {
    return this.prisma.alarmTriggerAction.findMany({
      where: { userId },
      orderBy: { order: 'asc' },
    });
  }

  async createTriggerAction(userId: string, dto: CreateTriggerActionDto) {
    return this.prisma.alarmTriggerAction.create({
      data: { userId, ...dto, value: dto.value as any },
    });
  }

  async updateTriggerAction(userId: string, id: string, dto: UpdateTriggerActionDto) {
    return this.prisma.alarmTriggerAction.updateMany({
      where: { id, userId },
      data: { ...dto, value: dto.value as any },
    });
  }

  async deleteTriggerAction(userId: string, id: string) {
    return this.prisma.alarmTriggerAction.deleteMany({ where: { id, userId } });
  }

  // ── Arm / Disarm ─────────────────────────────────────────────────────────

  async arm(userId: string, mode: 'home' | 'away', pin?: string, actorId?: string) {
    const settings = await this.getSettings(userId);

    if (['EXIT_DELAY', 'ENTRY_DELAY', 'TRIGGERED'].includes(settings.state)) {
      throw new BadRequestException('Cannot arm while in an active alarm state');
    }

    // Verify PIN if one is set
    if (settings.pinHash) {
      if (!pin) throw new UnauthorizedException('PIN required');
      const valid = await bcrypt.compare(pin, settings.pinHash);
      if (!valid) throw new UnauthorizedException('Invalid PIN');
    }

    await this.logAction(userId, actorId ?? userId, `arm_${mode}`);

    if (mode === 'home') {
      const result = await this.setState(userId, 'ARMED_HOME', actorId);
      this.startPolling(userId, 'ARMED_HOME');
      return result;
    } else {
      this.clearDelayTimers(userId);
      const result = await this.setState(userId, 'EXIT_DELAY', actorId);
      const delay = (result.exitDelaySecs ?? 30) * 1000;
      const timer = setTimeout(async () => {
        this.exitTimers.delete(userId);
        await this.setState(userId, 'ARMED_AWAY', actorId);
        this.startPolling(userId, 'ARMED_AWAY');
      }, delay);
      this.exitTimers.set(userId, timer);
      return result;
    }
  }

  async disarm(userId: string, pin?: string, actorId?: string) {
    const settings = await this.getSettings(userId);

    // PIN always required to disarm (if one is set)
    if (settings.pinHash) {
      if (!pin) throw new UnauthorizedException('PIN required');
      const valid = await bcrypt.compare(pin, settings.pinHash);
      if (!valid) throw new UnauthorizedException('Invalid PIN');
    }

    await this.logAction(userId, actorId ?? userId, 'disarm');
    this.clearAll(userId);
    await this.setState(userId, 'DISARMED', actorId);
  }

  async triggerEntryDelay(userId: string) {
    const settings = await this.getSettings(userId);
    if (!['ARMED_HOME', 'ARMED_AWAY'].includes(settings.state)) return;

    this.stopPolling(userId);
    this.clearDelayTimers(userId);
    const result = await this.setState(userId, 'ENTRY_DELAY');
    const delay = (result.entryDelaySecs ?? 30) * 1000;
    const timer = setTimeout(async () => {
      this.entryTimers.delete(userId);
      await this.setState(userId, 'TRIGGERED');
    }, delay);
    this.entryTimers.set(userId, timer);
  }

  async triggerImmediate(userId: string) {
    const settings = await this.getSettings(userId);
    if (!['ARMED_HOME', 'ARMED_AWAY'].includes(settings.state)) return;
    this.stopPolling(userId);
    this.clearDelayTimers(userId);
    await this.setState(userId, 'TRIGGERED');
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  private startPolling(userId: string, armedState: 'ARMED_HOME' | 'ARMED_AWAY') {
    this.stopPolling(userId);
    const timer = setInterval(() => this.checkRules(userId, armedState), 15_000);
    this.pollTimers.set(userId, timer);
    this.logger.log(`Polling started for user ${userId} (${armedState})`);
  }

  private stopPolling(userId: string) {
    const t = this.pollTimers.get(userId);
    if (t) {
      clearInterval(t);
      this.pollTimers.delete(userId);
    }
  }

  private async checkRules(userId: string, armedState: 'ARMED_HOME' | 'ARMED_AWAY') {
    const settings = await this.getSettings(userId);
    // Re-check state hasn't changed since timer was started
    if (settings.state !== armedState) {
      this.stopPolling(userId);
      return;
    }

    const isHome = armedState === 'ARMED_HOME';
    const rules = await this.prisma.alarmRule.findMany({
      where: {
        userId,
        enabled: true,
        ...(isHome ? { activeInHome: true } : { activeInAway: true }),
      },
    });
    if (rules.length === 0) return;

    // Fetch status for each unique device
    const deviceIds = [...new Set(rules.map((r) => r.deviceId))];
    const statuses = new Map<string, any[]>();

    for (const deviceId of deviceIds) {
      try {
        const status = await this.devicesService.getDeviceStatus(userId, deviceId);
        statuses.set(deviceId, Array.isArray(status) ? status : []);
      } catch (e: any) {
        this.logger.warn(`Could not poll device ${deviceId}: ${e?.message}`);
      }
    }

    for (const rule of rules) {
      const status = statuses.get(rule.deviceId) ?? [];
      const entry = status.find((s: any) => s.code === rule.triggerCode);
      if (!entry) continue;

      const matches = JSON.stringify(entry.value) === JSON.stringify(rule.triggerValue);
      if (!matches) continue;

      this.logger.warn(`Rule triggered: device=${rule.deviceId} code=${rule.triggerCode}`);
      if (rule.action === 'IMMEDIATE') {
        await this.triggerImmediate(userId);
      } else {
        await this.triggerEntryDelay(userId);
      }
      return; // Only fire one rule at a time
    }
  }

  // ── State management ──────────────────────────────────────────────────────

  private async setState(userId: string, state: AlarmState, actorId?: string) {
    const result = await this.prisma.alarmSettings.upsert({
      where: { userId },
      create: { userId, state, stateAt: new Date() },
      update: { state, stateAt: new Date() },
    });
    this.logger.log(`Alarm → ${state} (user ${userId})`);

    // Broadcast to owner + all their members so every connected session gets the update
    const members = await this.prisma.user.findMany({
      where: { createdById: userId },
      select: { id: true },
    });
    const groupIds = [userId, ...members.map((m) => m.id)];

    const payload = {
      state: result.state,
      stateAt: result.stateAt,
      exitDelaySecs: result.exitDelaySecs,
      entryDelaySecs: result.entryDelaySecs,
      actorId: actorId ?? userId,
    };

    this.gateway.broadcastToUsers(groupIds, 'alarm:state', payload);

    // On trigger: execute device actions + phone call
    if (state === 'TRIGGERED') {
      this.executeTriggerActions(userId).catch(() => {});
      if (result.callOnTrigger && result.phoneNumber) {
        this.callService.callNumber(userId, result.phoneNumber).catch(() => {});
      }
    }

    return result;
  }

  private async executeTriggerActions(userId: string) {
    const actions = await this.prisma.alarmTriggerAction.findMany({
      where: { userId },
      orderBy: { order: 'asc' },
    });
    for (const action of actions) {
      try {
        await this.devicesService.sendCommand(userId, action.deviceId, [
          { code: action.statusCode, value: action.value },
        ]);
        this.logger.log(`Trigger action: set ${action.statusCode} on ${action.deviceId}`);
      } catch (e: any) {
        this.logger.error(`Trigger action failed: ${e?.message}`);
      }
    }
  }

  private async logAction(ownerId: string, actorId: string, action: string) {
    await this.prisma.log.create({
      data: {
        userId: actorId,
        level: 'info',
        message: `Alarm ${action}`,
        context: 'alarm',
        metadata: { action, ownerId, actorId },
      },
    });
  }

  private clearDelayTimers(userId: string) {
    const exit = this.exitTimers.get(userId);
    if (exit) {
      clearTimeout(exit);
      this.exitTimers.delete(userId);
    }
    const entry = this.entryTimers.get(userId);
    if (entry) {
      clearTimeout(entry);
      this.entryTimers.delete(userId);
    }
  }

  private clearAll(userId: string) {
    this.clearDelayTimers(userId);
    this.stopPolling(userId);
  }
}
