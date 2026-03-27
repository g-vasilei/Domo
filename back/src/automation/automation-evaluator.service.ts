import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as SunCalc from 'suncalc';

import { DevicesGateway } from '../devices/devices.gateway';
import { DevicesService } from '../devices/devices.service';
import { PrismaService } from '../prisma/prisma.service';

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between triggers

@Injectable()
export class AutomationEvaluatorService {
  private readonly logger = new Logger(AutomationEvaluatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly devicesService: DevicesService,
    private readonly gateway: DevicesGateway,
  ) {}

  // ── Public: called after a device command is sent ──────────────────────────

  async evaluateOnCommand(
    ownerId: string,
    deviceId: string,
    commands: { code: string; value: unknown }[],
  ) {
    const rules = await this.getEnabledRulesWithDeviceCondition(ownerId, deviceId);
    if (!rules.length) return;

    // Build a fake status array from the commands we just sent
    const knownStatus = commands.map((c) => ({ code: c.code, value: c.value }));

    for (const rule of rules) {
      await this.evaluateRule(rule, ownerId, knownStatus, deviceId);
    }
  }

  // ── Cron: poll device states every 30s for device_state rules ─────────────

  @Cron('*/30 * * * * *')
  async evaluateDeviceStateRules() {
    const rules = await this.prisma.automationRule.findMany({
      where: {
        enabled: true,
        conditions: { some: { type: 'device_state' } },
      },
      include: {
        conditions: { orderBy: { order: 'asc' } },
        actions: { orderBy: { order: 'asc' } },
        user: { select: { id: true } },
      },
    });

    // Group by userId to batch device fetches
    const byUser = new Map<string, typeof rules>();
    for (const rule of rules) {
      const uid = rule.userId;
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid)!.push(rule);
    }

    for (const [ownerId, userRules] of byUser) {
      // Collect unique device IDs needed
      const deviceIds = new Set<string>();
      for (const rule of userRules) {
        for (const cond of rule.conditions) {
          if (cond.type === 'device_state' && cond.deviceId) {
            deviceIds.add(cond.deviceId);
          }
        }
      }

      // Fetch each device's status
      const statusMap = new Map<string, any[]>();
      for (const did of deviceIds) {
        try {
          const status = await this.devicesService.getDeviceStatus(ownerId, did);
          statusMap.set(did, Array.isArray(status) ? status : []);
        } catch (_e) {
          // Device unreachable — skip
        }
      }

      for (const rule of userRules) {
        await this.evaluateRule(rule, ownerId, undefined, undefined, statusMap);
      }
    }
  }

  // ── Cron: evaluate time/sun rules every minute ─────────────────────────────

  @Cron('* * * * *')
  async evaluateTimeSunRules() {
    const rules = await this.prisma.automationRule.findMany({
      where: {
        enabled: true,
        conditions: { some: { type: { in: ['time', 'sun'] } } },
      },
      include: {
        conditions: { orderBy: { order: 'asc' } },
        actions: { orderBy: { order: 'asc' } },
        user: { select: { id: true, timezone: true, latitude: true, longitude: true } },
      },
    });

    for (const rule of rules) {
      await this.evaluateRule(rule, rule.userId);
    }
  }

  // ── Core evaluation ────────────────────────────────────────────────────────

  private async evaluateRule(
    rule: any,
    ownerId: string,
    knownStatus?: { code: string; value: unknown }[],
    knownDeviceId?: string,
    statusMap?: Map<string, any[]>,
  ) {
    if (!rule.enabled) return;

    // Cooldown check
    if (rule.lastTriggeredAt) {
      const elapsed = Date.now() - new Date(rule.lastTriggeredAt).getTime();
      if (elapsed < COOLDOWN_MS) return;
    }

    const user =
      rule.user ??
      (await this.prisma.user.findUnique({
        where: { id: ownerId },
        select: { timezone: true, latitude: true, longitude: true },
      }));

    const condMet = await this.evaluateConditions(
      rule.conditions,
      knownStatus,
      knownDeviceId,
      statusMap,
      user,
    );

    if (!condMet) return;

    this.logger.log(`Rule "${rule.name}" (${rule.id}) triggered for user ${ownerId}`);

    await this.prisma.automationRule.update({
      where: { id: rule.id },
      data: { lastTriggeredAt: new Date() },
    });

    await this.executeActions(rule.actions, ownerId);
  }

  private async evaluateConditions(
    conditions: any[],
    knownStatus?: { code: string; value: unknown }[],
    knownDeviceId?: string,
    statusMap?: Map<string, any[]>,
    user?: any,
  ): Promise<boolean> {
    if (!conditions.length) return false;

    let result = await this.evaluateSingleCondition(
      conditions[0],
      knownStatus,
      knownDeviceId,
      statusMap,
      user,
    );

    for (let i = 0; i < conditions.length - 1; i++) {
      const op = conditions[i].nextOperator ?? 'AND';
      const next = await this.evaluateSingleCondition(
        conditions[i + 1],
        knownStatus,
        knownDeviceId,
        statusMap,
        user,
      );
      result = op === 'OR' ? result || next : result && next;
    }

    return result;
  }

  private async evaluateSingleCondition(
    cond: any,
    knownStatus?: { code: string; value: unknown }[],
    knownDeviceId?: string,
    statusMap?: Map<string, any[]>,
    user?: any,
  ): Promise<boolean> {
    if (cond.type === 'device_state') {
      return this.evaluateDeviceCondition(cond, knownStatus, knownDeviceId, statusMap);
    }
    if (cond.type === 'time') {
      return this.evaluateTimeCondition(cond, user?.timezone);
    }
    if (cond.type === 'sun') {
      return this.evaluateSunCondition(cond, user?.latitude, user?.longitude, user?.timezone);
    }
    return false;
  }

  private evaluateDeviceCondition(
    cond: any,
    knownStatus?: { code: string; value: unknown }[],
    knownDeviceId?: string,
    statusMap?: Map<string, any[]>,
  ): boolean {
    let status: any[] | undefined;

    if (knownDeviceId && knownDeviceId === cond.deviceId && knownStatus) {
      status = knownStatus as any[];
    } else if (statusMap) {
      status = statusMap.get(cond.deviceId);
    }

    if (!status) return false;

    const entry = status.find((s: any) => s.code === cond.statusCode);
    if (!entry) return false;

    const actual = JSON.stringify(entry.value);
    const expected = JSON.stringify(cond.value);

    return cond.operator === 'neq' ? actual !== expected : actual === expected;
  }

  private evaluateTimeCondition(cond: any, timezone?: string | null): boolean {
    if (!cond.timeValue) return false;

    const [targetH, targetM] = cond.timeValue.split(':').map(Number);
    const targetMin = targetH * 60 + targetM;
    const now = new Date();
    const tz = timezone ?? 'UTC';

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const nowMin = h * 60 + m;

    const op = cond.operator ?? 'eq';
    if (op === 'gt') return nowMin > targetMin;
    if (op === 'lt') return nowMin < targetMin;
    return h === targetH && m === targetM; // eq
  }

  private evaluateSunCondition(
    cond: any,
    latitude?: number | null,
    longitude?: number | null,
    timezone?: string | null,
  ): boolean {
    if (!cond.sunEvent || latitude == null || longitude == null) return false;

    const now = new Date();
    const times = SunCalc.getTimes(now, latitude, longitude);
    const eventTime: Date = times[cond.sunEvent as keyof typeof times] as Date;
    if (!eventTime || isNaN(eventTime.getTime())) return false;

    const offset = cond.sunOffsetMin ?? 0;
    const targetMs = eventTime.getTime() + offset * 60_000;

    const op = cond.operator ?? 'eq';
    if (op === 'gt') return now.getTime() > targetMs;
    if (op === 'lt') return now.getTime() < targetMs;
    // eq: match within the current minute window
    return Math.abs(now.getTime() - targetMs) / 60_000 < 1;
  }

  // ── Action execution ───────────────────────────────────────────────────────

  private async executeActions(actions: any[], ownerId: string) {
    const sorted = [...actions].sort((a, b) => a.order - b.order);

    for (const action of sorted) {
      try {
        if (action.type === 'device_control' && action.deviceId && action.statusCode) {
          await this.devicesService.sendCommand(ownerId, action.deviceId, [
            { code: action.statusCode, value: action.value },
          ]);
          this.logger.log(
            `Action: set ${action.statusCode}=${JSON.stringify(action.value)} on device ${action.deviceId}`,
          );
        } else if (
          action.type === 'countdown' &&
          action.deviceId &&
          action.statusCode &&
          action.minutes
        ) {
          // Turn on, then schedule turn off
          await this.devicesService.sendCommand(ownerId, action.deviceId, [
            { code: action.statusCode, value: true },
          ]);
          setTimeout(async () => {
            try {
              await this.devicesService.sendCommand(ownerId, action.deviceId, [
                { code: action.statusCode, value: false },
              ]);
            } catch (_e) {
              this.logger.error(`Countdown turn-off failed: ${_e}`);
            }
          }, action.minutes * 60_000);
          this.logger.log(`Action: countdown ${action.minutes}min on device ${action.deviceId}`);
        }
      } catch (e: any) {
        this.logger.error(`Action failed: ${e?.message}`);
      }
    }
  }

  // ── Helper ─────────────────────────────────────────────────────────────────

  private getEnabledRulesWithDeviceCondition(ownerId: string, deviceId: string) {
    return this.prisma.automationRule.findMany({
      where: {
        userId: ownerId,
        enabled: true,
        conditions: { some: { type: 'device_state', deviceId } },
      },
      include: {
        conditions: { orderBy: { order: 'asc' } },
        actions: { orderBy: { order: 'asc' } },
        user: { select: { id: true, timezone: true, latitude: true, longitude: true } },
      },
    });
  }
}
