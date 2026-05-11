import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DevicesService } from './devices.service';
import { SendCommandDto } from './dto/send-command.dto';

@ApiTags('devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

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

  @Get(':id/status')
  getDeviceStatus(@Req() req: any, @Param('id') deviceId: string) {
    return this.devicesService.getDeviceStatus(req.user.id, deviceId);
  }

  @Post(':id/commands')
  sendCommand(@Req() req: any, @Param('id') deviceId: string, @Body() dto: SendCommandDto) {
    return this.devicesService.sendCommand(req.user.id, deviceId, dto.commands);
  }

  @Post('timers')
  createTimer(
    @Req() req: any,
    @Body()
    body: { deviceId: string; deviceName: string; switchCode: string; minutes: number },
  ) {
    return this.devicesService.createTimer(
      req.user.id,
      body.deviceId,
      body.deviceName,
      body.switchCode,
      body.minutes,
    );
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
