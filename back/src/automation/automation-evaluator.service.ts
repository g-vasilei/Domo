import { BadRequestException, forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as SunCalc from 'suncalc';

import { DevicesGateway } from '../devices/devices.gateway';
import { DevicesService } from '../devices/devices.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AutomationEvaluatorService {
  private readonly logger = new Logger(AutomationEvaluatorService.name);
  private pollingDevices = false;
  private pollingTime = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => DevicesService))
    private readonly devicesService: DevicesService,
    private readonly gateway: DevicesGateway,
  ) {}

  // ── Public: manually test a rule, returns a debug trace ───────────────────

  async testRule(ownerId: string, ruleId: string) {
    const rule = await this.prisma.automationRule.findUnique({
      where: { id: ruleId },
      include: {
        conditions: { orderBy: { order: 'asc' } },
        actions: { orderBy: { order: 'asc' } },
        user: { select: { id: true, timezone: true, latitude: true, longitude: true } },
      },
    });
    if (!rule || rule.userId !== ownerId) return { error: 'Rule not found' };

    const trace: any = { ruleId, ruleName: rule.name, steps: [] };

    // Fetch device statuses
    const deviceIds = new Set<string>(
      rule.conditions
        .filter((c) => c.type === 'device_state' && c.deviceId)
        .map((c) => c.deviceId!),
    );
    const statusMap = new Map<string, any[]>();
    for (const did of deviceIds) {
      try {
        const status = await this.devicesService.getDeviceStatus(ownerId, did);
        const arr = Array.isArray(status) ? status : [];
        statusMap.set(did, arr);
        trace.steps.push({ step: 'device_status', deviceId: did, status: arr, ok: true });
      } catch (e: any) {
        trace.steps.push({ step: 'device_status', deviceId: did, ok: false, error: e?.message });
      }
    }

    // Evaluate conditions
    const condMet = await this.evaluateConditions(
      rule.conditions,
      undefined,
      undefined,
      statusMap,
      rule.user,
    );
    trace.steps.push({ step: 'condition_evaluation', condMet });

    if (condMet !== true) {
      trace.result = condMet === null ? 'inputs_unavailable' : 'condition_not_met';
      return trace;
    }

    // Manual testing deliberately bypasses automatic edge detection.
    const results = await this.executeActions(rule.actions, ownerId, rule.name);
    // A manual test must not consume or rearm an automatic condition edge.
    trace.steps.push({ step: 'actions_executed', actions: results });
    trace.result =
      results.length > 0 && results.every((result) => result.ok) ? 'fired' : 'actions_failed';
    return trace;
  }

  // ── Public: called after a device command is sent ──────────────────────────

  async evaluateOnCommand(
    ownerId: string,
    deviceId: string,
    commands: { code: string; value: unknown }[],
  ) {
    const rules = await this.getEnabledRulesWithDeviceCondition(ownerId, deviceId);
    if (!rules.length) return;

    // Commands may contain only one property; fetch the rest of each rule's inputs.
    // Reuse reads across rules and overlay the accepted command on Tuya's snapshot,
    // which can briefly lag behind a successful write.
    const statusMap = await this.fetchRuleStatuses(rules, ownerId);
    const changedStatus = new Map(
      (statusMap.get(deviceId) ?? []).map((entry) => [entry.code, entry]),
    );
    for (const command of commands) changedStatus.set(command.code, command);
    statusMap.set(deviceId, [...changedStatus.values()]);
    for (const rule of rules) {
      await this.evaluateSafely(rule, ownerId, statusMap);
    }
  }

  private async fetchRuleStatuses(rules: any[], ownerId: string) {
    const deviceIds = new Set<string>();
    for (const rule of rules) {
      for (const condition of rule.conditions) {
        if (condition.type === 'device_state' && condition.deviceId) {
          deviceIds.add(condition.deviceId);
        }
      }
    }
    const statuses = new Map<string, { code: string; value: unknown }[]>();
    for (const deviceId of deviceIds) {
      try {
        const status = await this.devicesService.getDeviceStatus(ownerId, deviceId);
        if (Array.isArray(status)) statuses.set(deviceId, status);
      } catch (error: any) {
        this.logger.warn(`Could not fetch status for device ${deviceId}: ${error?.message}`);
      }
    }
    return statuses;
  }

  private async evaluateSafely(rule: any, ownerId: string, statusMap?: Map<string, any[]>) {
    try {
      await this.evaluateRule(rule, ownerId, undefined, undefined, statusMap);
    } catch (error: any) {
      this.logger.error(`Rule ${rule.id} evaluation failed: ${error?.message}`);
    }
  }

  // ── Cron: execute expired device timers every 5s ─────────────────────────

  @Cron('*/5 * * * * *')
  async executeExpiredTimers() {
    const expired = await this.prisma.deviceTimer.findMany({
      where: { endsAt: { lte: new Date() } },
    });

    for (const timer of expired) {
      try {
        await this.devicesService.expireTimer(timer.id, timer.deviceId);
      } catch (e: any) {
        this.logger.error(`Timer execution failed for device ${timer.deviceId}: ${e?.message}`);
      }
    }
  }

  // ── Cron: poll device states every 30s for device_state rules ───────────

  @Cron('*/30 * * * * *')
  async evaluateDeviceStateRules() {
    if (this.pollingDevices) return;
    this.pollingDevices = true;
    try {
      const rules = await this.prisma.automationRule.findMany({
        where: {
          enabled: true,
          conditions: { some: { type: 'device_state' } },
        },
        include: {
          conditions: { orderBy: { order: 'asc' } },
          actions: { orderBy: { order: 'asc' } },
          user: { select: { id: true, timezone: true, latitude: true, longitude: true } },
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
        const statusMap = await this.fetchRuleStatuses(userRules, ownerId);

        for (const rule of userRules) {
          await this.evaluateSafely(rule, ownerId, statusMap);
        }
      }
    } finally {
      this.pollingDevices = false;
    }
  }

  // ── Cron: evaluate time/sun rules every minute ─────────────────────────────

  @Cron('* * * * *')
  async evaluateTimeSunRules() {
    if (this.pollingTime) return;
    this.pollingTime = true;
    try {
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
        await this.evaluateSafely(rule, rule.userId);
      }
    } finally {
      this.pollingTime = false;
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
    if (!statusMap && rule.conditions.some((condition: any) => condition.type === 'device_state')) {
      statusMap = await this.fetchRuleStatuses([rule], ownerId);
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

    // An unavailable input is unknown: do not manufacture a false edge.
    if (condMet === null) return;
    // Commands and polling share persistent edge detection.
    if (!condMet) {
      if (rule.conditionMet) {
        await this.prisma.automationRule.updateMany({
          where: { id: rule.id, lastTriggeredAt: rule.lastTriggeredAt, updatedAt: rule.updatedAt },
          data: { conditionMet: false },
        });
      }
      return;
    }

    if (rule.conditionMet) {
      // Condition was already true last evaluation — don't re-fire
      return;
    }

    // Claim the false → true edge atomically, including concurrent command/cron checks.
    const claimed = await this.prisma.automationRule.updateMany({
      where: { id: rule.id, enabled: true, conditionMet: false, updatedAt: rule.updatedAt },
      data: { lastTriggeredAt: new Date(), conditionMet: true },
    });
    if (!claimed.count) return;
    this.logger.log(`Rule "${rule.name}" (${rule.id}) triggered for user ${ownerId}`);

    await this.executeActions(rule.actions, ownerId, rule.name);
  }

  private async evaluateConditions(
    conditions: any[],
    knownStatus?: { code: string; value: unknown }[],
    knownDeviceId?: string,
    statusMap?: Map<string, any[]>,
    user?: any,
  ): Promise<boolean | null> {
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
      // Three-valued logic: true OR unknown is true; false AND unknown is false.
      result =
        op === 'OR'
          ? result === true || next === true
            ? true
            : result === null || next === null
              ? null
              : false
          : result === false || next === false
            ? false
            : result === null || next === null
              ? null
              : true;
    }

    return result;
  }

  private async evaluateSingleCondition(
    cond: any,
    knownStatus?: { code: string; value: unknown }[],
    knownDeviceId?: string,
    statusMap?: Map<string, any[]>,
    user?: any,
  ): Promise<boolean | null> {
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
  ): boolean | null {
    let status: any[] | undefined;

    if (knownDeviceId && knownDeviceId === cond.deviceId && knownStatus) {
      status = knownStatus as any[];
    } else if (statusMap) {
      status = statusMap.get(cond.deviceId);
    }

    if (!status) return null;

    const entry = status.find((s: any) => s.code === cond.statusCode);
    if (!entry) return null;

    const op = cond.operator ?? 'eq';

    if (op === 'gt' || op === 'lt') {
      const actualNum = entry.value;
      const expectedNum = cond.value;
      if (
        typeof actualNum !== 'number' ||
        typeof expectedNum !== 'number' ||
        !Number.isFinite(actualNum) ||
        !Number.isFinite(expectedNum)
      )
        return false;
      return op === 'gt' ? actualNum > expectedNum : actualNum < expectedNum;
    }

    const actual = JSON.stringify(entry.value);
    const expected = JSON.stringify(cond.value);
    return op === 'neq' ? actual !== expected : actual === expected;
  }

  private evaluateTimeCondition(cond: any, timezone?: string | null): boolean {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cond.timeValue ?? '')) return false;

    const [targetH, targetM] = cond.timeValue.split(':').map(Number);
    const targetMin = targetH * 60 + targetM;
    const now = new Date();
    const tz = timezone ?? 'UTC';

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);

    const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const nowMin = h * 60 + m;

    const op = cond.operator ?? 'eq';
    if (op === 'gt') return nowMin > targetMin;
    if (op === 'lt') return nowMin < targetMin;
    if (op === 'neq') return nowMin !== targetMin;
    return nowMin === targetMin;
  }

  private evaluateSunCondition(
    cond: any,
    latitude?: number | null,
    longitude?: number | null,
    timezone?: string | null,
  ): boolean {
    if (!['sunrise', 'sunset'].includes(cond.sunEvent) || latitude == null || longitude == null)
      return false;

    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone ?? 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const part = (name: string) => Number(parts.find((p) => p.type === name)?.value);
    // Anchor at solar noon on the user's civil date. Using "now" can select
    // tomorrow's solar cycle late in the evening, even before local midnight.
    const anchor = Date.UTC(part('year'), part('month') - 1, part('day'), 12) - longitude * 240_000;
    const target = (day: number) => {
      const times = SunCalc.getTimes(new Date(anchor + day * 86_400_000), latitude, longitude);
      return (
        (times[cond.sunEvent as 'sunrise' | 'sunset'] as Date).getTime() +
        (cond.sunOffsetMin ?? 0) * 60_000
      );
    };
    if (!Number.isFinite(target(0))) return false;
    const op = cond.operator ?? 'eq';
    if (op === 'gt') return now.getTime() > target(0);
    if (op === 'lt') return now.getTime() < target(0);
    // Compare calendar minutes, never fire in the minute before the event.
    // Adjacent solar days cover offsets that cross local midnight.
    const matches = [-1, 0, 1].some(
      (day) => Math.floor(now.getTime() / 60_000) === Math.floor(target(day) / 60_000),
    );
    return op === 'neq' ? !matches : matches;
  }

  // ── Action execution ───────────────────────────────────────────────────────

  private async executeActions(actions: any[], ownerId: string, ruleName?: string) {
    const sorted = [...actions].sort((a, b) => a.order - b.order);

    const results: { type: string; ok: boolean; attempts: number }[] = [];
    for (const action of sorted) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (action.type === 'notification') {
            const message =
              typeof action.value === 'string' && action.value.trim()
                ? action.value.trim()
                : `Automation "${ruleName ?? 'rule'}" triggered`;
            const groupUsers = await this.prisma.user.findMany({
              where: { OR: [{ id: ownerId }, { createdById: ownerId }] },
              select: { id: true },
            });
            this.gateway.broadcastToUsers(
              groupUsers.map((u) => u.id),
              'automation:alert',
              { message, ruleName },
            );
            this.logger.log(`Action: notification sent — "${message}"`);
          } else if (
            action.type === 'device_control' &&
            action.deviceId &&
            action.statusCode &&
            action.value !== undefined &&
            action.value !== null
          ) {
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
            Number.isInteger(action.minutes) &&
            action.minutes >= 1 &&
            action.minutes <= 1440
          ) {
            await this.devicesService.createTimer(
              ownerId,
              action.deviceId,
              action.deviceName ?? '',
              action.statusCode,
              action.minutes,
              true,
            );
            this.logger.log(`Action: countdown ${action.minutes}min on device ${action.deviceId}`);
          } else {
            throw new BadRequestException('Invalid automation action');
          }
          await this.recordAction(ownerId, ruleName, action, false);
          results.push({ type: action.type, ok: true, attempts: attempt });
          break;
        } catch (e: any) {
          const status = e?.getStatus?.() ?? e?.status;
          const retryable =
            action.type !== 'notification' &&
            ['device_control', 'countdown'].includes(action.type) &&
            (status === undefined || status === 429 || status >= 500);
          if (retryable && attempt < 3) {
            await this.retryDelay(attempt * 1000);
            continue;
          }
          this.logger.error(`Action failed after ${attempt} attempt(s): ${e?.message}`);
          await this.recordAction(ownerId, ruleName, action, true);
          results.push({ type: action.type, ok: false, attempts: attempt });
          break;
        }
      }
    }
    return results;
  }

  private retryDelay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private async recordAction(
    ownerId: string,
    ruleName: string | undefined,
    action: any,
    failed: boolean,
  ) {
    try {
      await this.prisma.log.create({
        data: {
          userId: ownerId,
          context: 'automation',
          level: failed ? 'error' : 'info',
          message: `${failed ? 'Αποτυχία ενέργειας' : 'Εκτέλεση ενέργειας'} αυτοματισμού «${ruleName ?? 'Κανόνας'}» (${action.type})`,
          metadata: {
            ownerId,
            ruleName: ruleName ?? '',
            actionType: action.type,
            ...(action.deviceId ? { deviceId: action.deviceId } : {}),
          },
        },
      });
    } catch (error) {
      this.logger.error('Could not record automation action', error);
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
