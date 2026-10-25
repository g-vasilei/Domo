import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeviceSchedulesService } from './device-schedules.service';
import { DevicesService } from './devices.service';
import {
  SaveDeviceScheduleDto,
  StartDeviceTimerDto,
  ToggleDeviceScheduleDto,
} from './dto/device-schedule.dto';
import { SendCommandDto } from './dto/send-command.dto';

@ApiTags('devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly schedules: DeviceSchedulesService,
  ) {}

  @Get()
  getDevices(@Req() req: any) {
    return this.devicesService.getDevices(req.user.id);
  }

  @Get('rooms')
  getRooms(@Req() req: any) {
    return this.devicesService.getRooms(req.user.id);
  }

  @Get(':id')
  getDevice(@Req() req: any, @Param('id') deviceId: string) {
    return this.devicesService.getDevice(req.user.id, deviceId);
  }

  @Get(':id/specifications')
  getDeviceSpecifications(@Req() req: any, @Param('id') deviceId: string) {
    return this.devicesService.getDeviceSpecifications(req.user.id, deviceId);
  }

  @Get(':id/status')
  getDeviceStatus(@Req() req: any, @Param('id') deviceId: string) {
    return this.devicesService.getDeviceStatus(req.user.id, deviceId);
  }

  @Post(':id/commands')
  sendCommand(@Req() req: any, @Param('id') deviceId: string, @Body() dto: SendCommandDto) {
    return this.devicesService.sendCommand(req.user.id, deviceId, dto.commands);
  }

  @Get('timers/active')
  getTimers(@Req() req: any) {
    return this.devicesService.getTimers(req.user.id);
  }

  @Post('timers')
  createTimer(@Req() req: any, @Body() body: StartDeviceTimerDto) {
    return this.devicesService.createTimer(
      req.user.id,
      body.deviceId,
      body.deviceName,
      body.switchCode,
      body.minutes,
    );
  }

  @Get(':id/schedules')
  getSchedules(@Req() req: any, @Param('id') id: string) {
    return this.schedules.list(req.user.id, id);
  }

  @Post(':id/schedules')
  createSchedule(@Req() req: any, @Param('id') id: string, @Body() dto: SaveDeviceScheduleDto) {
    return this.schedules.save(req.user.id, id, dto);
  }

  @Put(':id/schedules/:scheduleId')
  updateSchedule(
    @Req() req: any,
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @Body() dto: SaveDeviceScheduleDto,
  ) {
    return this.schedules.save(req.user.id, id, dto, scheduleId);
  }

  @Patch(':id/schedules/:scheduleId')
  toggleSchedule(
    @Req() req: any,
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @Body() dto: ToggleDeviceScheduleDto,
  ) {
    return this.schedules.toggle(req.user.id, id, scheduleId, dto.enabled);
  }

  @Delete(':id/schedules/:scheduleId')
  removeSchedule(
    @Req() req: any,
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
  ) {
    return this.schedules.remove(req.user.id, id, scheduleId);
  }

  @Delete('timers/:deviceId')
  cancelTimer(@Req() req: any, @Param('deviceId') deviceId: string) {
    return this.devicesService.cancelTimer(req.user.id, deviceId);
  }

  @Get(':id/notif-pref')
  getNotifPref(@Req() req: any, @Param('id') deviceId: string) {
    return this.devicesService.getNotifPref(req.user.id, deviceId);
  }

  @Patch(':id/notif-pref')
  setNotifPref(
    @Req() req: any,
    @Param('id') deviceId: string,
    @Body() body: { enabled: boolean; deviceName?: string },
  ) {
    return this.devicesService.setNotifPref(req.user.id, deviceId, body.enabled, body.deviceName);
  }
}
