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

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AutomationService } from './automation.service';
import { CreateRuleDto, UpdateLocationDto, UpdateRuleDto } from './dto/automation.dto';

@Controller('automations')
@UseGuards(JwtAuthGuard)
export class AutomationController {
  constructor(private readonly service: AutomationService) {}

  @Get()
  getRules(@Req() req: any) {
    return this.service.getRules(req.user.id);
  }

  @Get('location')
  getLocation(@Req() req: any) {
    return this.service.getLocation(req.user.id);
  }

  @Patch('location')
  updateLocation(@Req() req: any, @Body() dto: UpdateLocationDto) {
    return this.service.updateLocation(req.user.id, dto);
  }

  @Get(':id')
  getRule(@Req() req: any, @Param('id') id: string) {
    return this.service.getRule(req.user.id, id);
  }

  @Post()
  createRule(@Req() req: any, @Body() dto: CreateRuleDto) {
    return this.service.createRule(req.user.id, dto);
  }

  @Put(':id')
  updateRule(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateRuleDto) {
    return this.service.updateRule(req.user.id, id, dto);
  }

  @Patch(':id/toggle')
  toggleRule(@Req() req: any, @Param('id') id: string) {
    return this.service.toggleRule(req.user.id, id);
  }

  @Delete(':id')
  deleteRule(@Req() req: any, @Param('id') id: string) {
    return this.service.deleteRule(req.user.id, id);
  }
}
