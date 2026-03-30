import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto, UpdateEventDto } from './dto/calendar.dto';

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getEvents(userId: string, from?: string, to?: string) {
    const where: any = { userId };
    if (from || to) {
      where.startAt = {};
      if (from) where.startAt.gte = new Date(from);
      if (to) where.startAt.lte = new Date(to);
    }
    return this.prisma.calendarEvent.findMany({
      where,
      orderBy: { startAt: 'asc' },
    });
  }

  async createEvent(userId: string, dto: CreateEventDto) {
    return this.prisma.calendarEvent.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        startAt: new Date(dto.startAt),
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        allDay: dto.allDay ?? true,
        color: dto.color ?? 'blue',
      },
    });
  }

  async updateEvent(userId: string, id: string, dto: UpdateEventDto) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event || event.userId !== userId) throw new NotFoundException('Event not found');
    return this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.startAt !== undefined && { startAt: new Date(dto.startAt) }),
        ...(dto.endAt !== undefined && { endAt: new Date(dto.endAt) }),
        ...(dto.allDay !== undefined && { allDay: dto.allDay }),
        ...(dto.color !== undefined && { color: dto.color }),
      },
    });
  }

  async deleteEvent(userId: string, id: string) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event || event.userId !== userId) throw new NotFoundException('Event not found');
    await this.prisma.calendarEvent.delete({ where: { id } });
    return { message: 'Event deleted' };
  }
}
