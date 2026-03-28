import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AlarmCallService } from './alarm-call.service';
import { AlarmService } from './alarm.service';
import {
  ArmDto,
  CreateRuleDto,
  CreateTriggerActionDto,
  DisarmDto,
  SetPinDto,
  UpdateDisplayDto,
  UpdateRuleDto,
  UpdateTriggerActionDto,
} from './dto/alarm.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER')
@Controller('alarm')
export class AlarmController {
  constructor(
    private readonly alarmService: AlarmService,
    private readonly callService: AlarmCallService,
  ) {}

  @Get()
  getSettings(@Request() req: any) {
    return this.alarmService.getSettings(req.user.id);
  }

  @Post('arm')
  arm(@Request() req: any, @Body() dto: ArmDto) {
    return this.alarmService.arm(req.user.id, dto.mode, dto.pin, req.user.id);
  }

  @Post('disarm')
  disarm(@Request() req: any, @Body() dto: DisarmDto) {
    return this.alarmService.disarm(req.user.id, dto.pin, req.user.id);
  }

  @Post('trigger')
  trigger(@Request() req: any) {
    return this.alarmService.triggerEntryDelay(req.user.id);
  }

  @Post('pin')
  setPin(@Request() req: any, @Body() dto: SetPinDto) {
    return this.alarmService.setPin(req.user.id, dto.pin, dto.currentPin);
  }

  @Patch('display')
  updateDisplay(@Request() req: any, @Body() dto: UpdateDisplayDto) {
    return this.alarmService.updateDisplaySettings(req.user.id, dto);
  }

  // ── Phone OTP ──────────────────────────────────────────────────────────

  @Post('phone/send-otp')
  sendOtp(@Request() req: any, @Body() body: { phoneNumber: string }) {
    return this.callService.sendOtp(req.user.id, body.phoneNumber).then(() => ({ sent: true }));
  }

  @Post('phone/verify-otp')
  async verifyOtp(@Request() req: any, @Body() body: { otp: string }) {
    const phoneNumber = await this.callService.verifyOtp(req.user.id, body.otp);
    if (!phoneNumber) return { verified: false };
    await this.alarmService.updateDisplaySettings(req.user.id, { phoneNumber });
    return { verified: true, phoneNumber };
  }

  // ── Rules ──────────────────────────────────────────────────────────────

  @Get('rules')
  getRules(@Request() req: any) {
    return this.alarmService.getRules(req.user.id);
  }

  @Post('rules')
  createRule(@Request() req: any, @Body() dto: CreateRuleDto) {
    return this.alarmService.createRule(req.user.id, dto);
  }

  @Patch('rules/:id')
  updateRule(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateRuleDto) {
    return this.alarmService.updateRule(req.user.id, id, dto);
  }

  @Delete('rules/:id')
  deleteRule(@Request() req: any, @Param('id') id: string) {
    return this.alarmService.deleteRule(req.user.id, id);
  }

  // ── Trigger Actions ────────────────────────────────────────────────────

  @Get('trigger-actions')
  getTriggerActions(@Request() req: any) {
    return this.alarmService.getTriggerActions(req.user.id);
  }

  @Post('trigger-actions')
  createTriggerAction(@Request() req: any, @Body() dto: CreateTriggerActionDto) {
    return this.alarmService.createTriggerAction(req.user.id, dto);
  }

  @Patch('trigger-actions/:id')
  updateTriggerAction(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateTriggerActionDto) {
    return this.alarmService.updateTriggerAction(req.user.id, id, dto);
  }

  @Delete('trigger-actions/:id')
  deleteTriggerAction(@Request() req: any, @Param('id') id: string) {
    return this.alarmService.deleteTriggerAction(req.user.id, id);
  }
}
