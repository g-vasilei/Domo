import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateRuleDto, UpdateLocationDto, UpdateRuleDto } from './dto/automation.dto';

const RULE_INCLUDE = {
  conditions: { orderBy: { order: 'asc' as const } },
  actions: { orderBy: { order: 'asc' as const } },
};

@Injectable()
export class AutomationService {
  constructor(private readonly prisma: PrismaService) {}

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
      select: { role: true, permissions: { select: { canManageAutomations: true } } },
    });
    if (user?.role === 'MEMBER' && !user.permissions?.canManageAutomations) {
      throw new ForbiddenException('No permission to manage automations');
    }
  }

  async getRules(userId: string) {
    const ownerId = await this.resolveOwnerId(userId);
    return this.prisma.automationRule.findMany({
      where: { userId: ownerId },
      include: RULE_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  async getRule(userId: string, id: string) {
    const ownerId = await this.resolveOwnerId(userId);
    const rule = await this.prisma.automationRule.findUnique({
      where: { id },
      include: RULE_INCLUDE,
    });
    if (!rule || rule.userId !== ownerId) throw new NotFoundException('Rule not found');
    return rule;
  }

  async createRule(userId: string, dto: CreateRuleDto) {
    await this.assertCanManage(userId);
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
    const rule = await this.prisma.automationRule.findUnique({ where: { id } });
    if (!rule || rule.userId !== ownerId) throw new NotFoundException('Rule not found');

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
    const rule = await this.prisma.automationRule.findUnique({ where: { id } });
    if (!rule || rule.userId !== ownerId) throw new NotFoundException('Rule not found');
    return this.prisma.automationRule.update({
      where: { id },
      data: { enabled: !rule.enabled },
      include: RULE_INCLUDE,
    });
  }

  async deleteRule(userId: string, id: string) {
    await this.assertCanManage(userId);
    const ownerId = await this.resolveOwnerId(userId);
    const rule = await this.prisma.automationRule.findUnique({ where: { id } });
    if (!rule || rule.userId !== ownerId) throw new NotFoundException('Rule not found');
    await this.prisma.automationRule.delete({ where: { id } });
    return { message: 'Rule deleted' };
  }

  async updateLocation(userId: string, dto: UpdateLocationDto) {
    return this.prisma.user.update({
      where: { id: userId },
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
