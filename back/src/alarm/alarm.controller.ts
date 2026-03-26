import { Controller, Get, Post, Patch, Delete, Body, Param, Request, UseGuards } from '@nestjs/common';
import { AlarmService } from './alarm.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { ArmDto, DisarmDto, SetPinDto, UpdateDisplayDto, CreateRuleDto, UpdateRuleDto } from './dto/alarm.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER')
@Controller('alarm')
export class AlarmController {
  constructor(private readonly alarmService: AlarmService) {}

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
}
