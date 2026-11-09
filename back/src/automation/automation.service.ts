import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { canAccessDevice } from '../devices/device-permissions';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRuleDto, UpdateLocationDto, UpdateRuleDto } from './dto/automation.dto';

const RULE_INCLUDE = {
  conditions: { orderBy: { order: 'asc' as const } },
  actions: { orderBy: { order: 'asc' as const } },
};

@Injectable()
export class AutomationService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveOwnerIdPublic(userId: string): Promise<string> {
    return this.resolveOwnerId(userId);
  }

  private async resolveOwnerId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, createdById: true },
    });
    return user?.role === 'MEMBER' && user.createdById ? user.createdById : userId;
  }

  private async assertCanManage(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { permissions: true },
    });
    if (
      !user ||
      (user.role !== 'OWNER' &&
        (user.role !== 'MEMBER' || !user.createdById || !user.permissions?.canManageAutomations))
    ) {
      throw new ForbiddenException('No permission to manage automations');
    }
    return user;
  }

  private canAccessRule(
    user: Awaited<ReturnType<AutomationService['assertCanManage']>>,
    rule: {
      conditions: { type: string; deviceId?: string | null }[];
      actions: { type: string; deviceId?: string | null }[];
    },
  ) {
    return (
      rule.conditions.every(
        (condition) =>
          condition.type !== 'device_state' ||
          (!!condition.deviceId && canAccessDevice(user, condition.deviceId, 'view')),
      ) &&
      rule.actions.every(
        (action) =>
          !['device_control', 'countdown'].includes(action.type) ||
          (!!action.deviceId && canAccessDevice(user, action.deviceId, 'control')),
      )
    );
  }

  private async assertRuleAccess(
    userId: string,
    rule: Parameters<AutomationService['canAccessRule']>[1],
  ) {
    const user = await this.assertCanManage(userId);
    if (!this.canAccessRule(user, rule))
      throw new ForbiddenException('No permission for this device action');
  }

  async getRules(userId: string) {
    const user = await this.assertCanManage(userId);
    const ownerId = await this.resolveOwnerId(userId);
    const rules = await this.prisma.automationRule.findMany({
      where: { userId: ownerId },
      include: RULE_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rules.filter((rule) => this.canAccessRule(user, rule));
  }

  async getRule(userId: string, id: string) {
    await this.assertCanManage(userId);
    const ownerId = await this.resolveOwnerId(userId);
    const rule = await this.prisma.automationRule.findUnique({
      where: { id },
      include: RULE_INCLUDE,
    });
    if (!rule || rule.userId !== ownerId) throw new NotFoundException('Rule not found');
    await this.assertRuleAccess(userId, rule);
    return rule;
  }

  async createRule(userId: string, dto: CreateRuleDto) {
    await this.assertRuleAccess(userId, dto);
    this.validateConditions(dto.conditions);
    const ownerId = await this.resolveOwnerId(userId);
    return this.prisma.automationRule.create({
      data: {
        userId: ownerId,
        name: dto.name,
        enabled: dto.enabled ?? true,
        conditions: {
          create: dto.conditions.map((c) => ({
            type: c.type,
            deviceId: c.deviceId,
            deviceName: c.deviceName,
            statusCode: c.statusCode,
            operator: c.operator,
            value: c.value !== undefined ? (c.value as any) : undefined,
            timeValue: c.timeValue,
            sunEvent: c.sunEvent,
            sunOffsetMin: c.sunOffsetMin,
            order: c.order,
            nextOperator: c.nextOperator,
          })),
        },
        actions: {
          create: dto.actions.map((a) => ({
            type: a.type,
            deviceId: a.deviceId,
            deviceName: a.deviceName,
            statusCode: a.statusCode,
            value: a.value !== undefined ? (a.value as any) : undefined,
            minutes: a.minutes,
            order: a.order,
          })),
        },
      },
      include: RULE_INCLUDE,
    });
  }

  async updateRule(userId: string, id: string, dto: UpdateRuleDto) {
    await this.assertCanManage(userId);
    const ownerId = await this.resolveOwnerId(userId);
    const rule = await this.prisma.automationRule.findUnique({
      where: { id },
      include: RULE_INCLUDE,
    });
    if (!rule || rule.userId !== ownerId) throw new NotFoundException('Rule not found');
    await this.assertRuleAccess(userId, rule);
    await this.assertRuleAccess(userId, {
      conditions: dto.conditions ?? rule.conditions,
      actions: dto.actions ?? rule.actions,
    });

    this.validateConditions(dto.conditions ?? rule.conditions);
    const conditionsChanged =
      dto.conditions !== undefined &&
      this.conditionSignature(dto.conditions) !== this.conditionSignature(rule.conditions);
    return this.prisma.$transaction(async (tx) => {
      if (dto.conditions !== undefined) {
        await tx.automationCondition.deleteMany({ where: { ruleId: id } });
      }
      if (dto.actions !== undefined) {
        await tx.automationAction.deleteMany({ where: { ruleId: id } });
      }

      return tx.automationRule.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.enabled !== undefined && { enabled: dto.enabled }),
          ...((conditionsChanged ||
            (dto.enabled !== undefined && dto.enabled !== rule.enabled)) && {
            conditionMet: false,
          }),
          ...(dto.conditions !== undefined && {
            conditions: {
              create: dto.conditions.map((c) => ({
                type: c.type,
                deviceId: c.deviceId,
                deviceName: c.deviceName,
                statusCode: c.statusCode,
                operator: c.operator,
                value: c.value !== undefined ? (c.value as any) : undefined,
                timeValue: c.timeValue,
                sunEvent: c.sunEvent,
                sunOffsetMin: c.sunOffsetMin,
                order: c.order,
                nextOperator: c.nextOperator,
              })),
            },
          }),
          ...(dto.actions !== undefined && {
            actions: {
              create: dto.actions.map((a) => ({
                type: a.type,
                deviceId: a.deviceId,
                deviceName: a.deviceName,
                statusCode: a.statusCode,
                value: a.value !== undefined ? (a.value as any) : undefined,
                minutes: a.minutes,
                order: a.order,
              })),
            },
          }),
        },
        include: RULE_INCLUDE,
      });
    });
  }

  async toggleRule(userId: string, id: string) {
    await this.assertCanManage(userId);
    const ownerId = await this.resolveOwnerId(userId);
    const rule = await this.prisma.automationRule.findUnique({
      where: { id },
      include: RULE_INCLUDE,
    });
    if (!rule || rule.userId !== ownerId) throw new NotFoundException('Rule not found');
    await this.assertRuleAccess(userId, rule);
    return this.prisma.automationRule.update({
      where: { id },
      data: { enabled: !rule.enabled, conditionMet: false },
      include: RULE_INCLUDE,
    });
  }

  async deleteRule(userId: string, id: string) {
    await this.assertCanManage(userId);
    const ownerId = await this.resolveOwnerId(userId);
    const rule = await this.prisma.automationRule.findUnique({
      where: { id },
      include: RULE_INCLUDE,
    });
    if (!rule || rule.userId !== ownerId) throw new NotFoundException('Rule not found');
    await this.assertRuleAccess(userId, rule);
    await this.prisma.automationRule.delete({ where: { id } });
    return { message: 'Rule deleted' };
  }

  private conditionSignature(conditions: any[]) {
    return JSON.stringify(
      [...conditions]
        .sort((a, b) => a.order - b.order)
        .map((c, index) => ({
          type: c.type,
          operator: c.operator ?? 'eq',
          nextOperator: index < conditions.length - 1 ? (c.nextOperator ?? 'AND') : null,
          ...(c.type === 'device_state' && {
            deviceId: c.deviceId,
            statusCode: c.statusCode,
            value: c.value,
          }),
          ...(c.type === 'time' && { timeValue: c.timeValue }),
          ...(c.type === 'sun' && { sunEvent: c.sunEvent, sunOffsetMin: c.sunOffsetMin ?? 0 }),
        })),
    );
  }

  private validateConditions(
    conditions: { type: string; operator?: string | null; value?: unknown }[],
  ) {
    for (const condition of conditions) {
      if (
        condition.type === 'device_state' &&
        ['gt', 'lt'].includes(condition.operator ?? '') &&
        (typeof condition.value !== 'number' || !Number.isFinite(condition.value))
      ) {
        throw new BadRequestException('Numeric comparisons require a finite numeric value');
      }
    }
  }

  async updateLocation(userId: string, dto: UpdateLocationDto) {
    await this.assertCanManage(userId);
    const ownerId = await this.resolveOwnerId(userId);
    if (dto.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat('en-GB', { timeZone: dto.timezone }).format();
      } catch {
        throw new BadRequestException('Invalid timezone');
      }
    }
    return this.prisma.user.update({
      where: { id: ownerId },
      data: {
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
      },
      select: { timezone: true, latitude: true, longitude: true },
    });
  }

  async getLocation(userId: string) {
    const ownerId = await this.resolveOwnerId(userId);
    return this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { timezone: true, latitude: true, longitude: true },
    });
  }
}
