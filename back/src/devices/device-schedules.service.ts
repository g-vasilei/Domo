import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from './devices.service';
import { SaveDeviceScheduleDto } from './dto/device-schedule.dto';

export function scheduleClock(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  const time = `${part('hour')}:${part('minute')}`;
  return { time, key: `${date}T${time}`, day: new Date(`${date}T12:00:00Z`).getUTCDay() };
}

@Injectable()
export class DeviceSchedulesService {
  private readonly logger = new Logger(DeviceSchedulesService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: DevicesService,
  ) {}

  async list(userId: string, deviceId: string) {
    const ownerId = await this.devices.deviceAccess(userId, deviceId, 'view');
    return this.prisma.deviceSchedule.findMany({
      where: { userId: ownerId, deviceId },
      include: { slots: { orderBy: { time: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private validate(dto: SaveDeviceScheduleDto) {
    if (!dto.name.trim()) throw new BadRequestException('Enter a schedule name');
    try {
      scheduleClock(new Date(), dto.timezone);
    } catch {
      throw new BadRequestException('Invalid timezone');
    }
    if (new Set(dto.slots.map((s) => s.time)).size !== dto.slots.length) {
      throw new BadRequestException('Each start time must be unique');
    }
  }

  async save(userId: string, deviceId: string, dto: SaveDeviceScheduleDto, id?: string) {
    const ownerId = await this.devices.deviceAccess(userId, deviceId, 'schedule');
    this.validate(dto);
    const device = await this.devices.getDevice(ownerId, deviceId);
    if (
      !device.status?.some((s: any) => s.code === dto.switchCode && typeof s.value === 'boolean')
    ) {
      throw new BadRequestException('Device does not expose this power switch');
    }
    const data = {
      name: dto.name.trim(),
      deviceName: device.name ?? dto.deviceName,
      switchCode: dto.switchCode,
      timezone: dto.timezone,
      days: dto.days,
      enabled: dto.enabled,
    };
    if (!id)
      return this.prisma.deviceSchedule.create({
        data: { ...data, userId: ownerId, deviceId, slots: { create: dto.slots } },
        include: { slots: { orderBy: { time: 'asc' } } },
      });
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.deviceSchedule.findFirst({
        where: { id, userId: ownerId, deviceId },
        include: { slots: true },
      });
      if (!existing) throw new NotFoundException('Schedule not found');
      await tx.deviceScheduleSlot.deleteMany({ where: { scheduleId: id } });
      return tx.deviceSchedule.update({
        where: { id },
        data: {
          ...data,
          slots: {
            create: dto.slots.map((slot) => ({
              ...slot,
              lastRunKey: existing.slots.find((old) => old.time === slot.time)?.lastRunKey,
            })),
          },
        },
        include: { slots: { orderBy: { time: 'asc' } } },
      });
    });
  }

  async toggle(userId: string, deviceId: string, id: string, enabled: boolean) {
    const ownerId = await this.devices.deviceAccess(userId, deviceId, 'schedule');
    const result = await this.prisma.deviceSchedule.updateMany({
      where: { id, deviceId, userId: ownerId },
      data: { enabled },
    });
    if (!result.count) throw new NotFoundException('Schedule not found');
    return { enabled };
  }

  async remove(userId: string, deviceId: string, id: string) {
    const ownerId = await this.devices.deviceAccess(userId, deviceId, 'schedule');
    const result = await this.prisma.deviceSchedule.deleteMany({
      where: { id, deviceId, userId: ownerId },
    });
    if (!result.count) throw new NotFoundException('Schedule not found');
    return { deleted: true };
  }

  // The server must be online at the start time. Missed starts are not replayed.
  @Cron('*/15 * * * * *')
  async runSchedules() {
    if (this.running) return;
    this.running = true;
    try {
      const schedules = await this.prisma.deviceSchedule.findMany({
        where: { enabled: true },
        include: { slots: true },
      });
      for (const schedule of schedules) {
        const clock = scheduleClock(new Date(), schedule.timezone);
        if (!schedule.days.includes(clock.day)) continue;
        for (const slot of schedule.slots) {
          if (slot.time !== clock.time || slot.lastRunKey === clock.key) continue;
          const claim = await this.prisma.deviceScheduleSlot.updateMany({
            where: { id: slot.id, lastRunKey: slot.lastRunKey, schedule: { enabled: true } },
            data: { lastRunKey: clock.key },
          });
          if (!claim.count) continue;
          try {
            await this.devices.createTimer(
              schedule.userId,
              schedule.deviceId,
              schedule.deviceName,
              schedule.switchCode,
              slot.minutes,
              true,
            );
          } catch (e: any) {
            this.logger.error(`Schedule ${schedule.id} failed: ${e?.message}`);
            await this.prisma.deviceScheduleSlot.updateMany({
              where: { id: slot.id, lastRunKey: clock.key },
              data: { lastRunKey: slot.lastRunKey },
            });
          }
        }
      }
    } finally {
      this.running = false;
    }
  }
}
