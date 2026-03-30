import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CalendarService } from './calendar.service';
import { CreateEventDto, UpdateEventDto } from './dto/calendar.dto';

@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Get()
  getEvents(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getEvents(req.user.id, from, to);
  }

  @Post()
  createEvent(@Req() req: any, @Body() dto: CreateEventDto) {
    return this.service.createEvent(req.user.id, dto);
  }

  @Put(':id')
  updateEvent(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.service.updateEvent(req.user.id, id, dto);
  }

  @Delete(':id')
  deleteEvent(@Req() req: any, @Param('id') id: string) {
    return this.service.deleteEvent(req.user.id, id);
  }
}
