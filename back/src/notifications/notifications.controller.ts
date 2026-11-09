import { Body, Controller, Delete, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { NotificationsService } from './notifications.service';
import { UpdatePushSettingsDto } from './update-push-settings.dto';

class KeysDto {
  @IsString() @MaxLength(200) p256dh!: string;
  @IsString() @MaxLength(100) auth!: string;
}
class SubscriptionDto {
  @IsString() @MaxLength(2000) endpoint!: string;
  @IsDefined() @ValidateNested() @Type(() => KeysDto) keys!: KeysDto;
}
class IdsDto {
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) ids!: string[];
}
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get() list(@Req() req: any) {
    return this.service.list(req.user.id);
  }
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Get('settings')
  settings(@Req() req: any) {
    return this.service.getPushSettings(req.user.id);
  }
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Patch('settings')
  updateSettings(@Req() req: any, @Body() dto: UpdatePushSettingsDto) {
    return this.service.updatePushSettings(req.user.id, dto.contactEmail);
  }
  @Get('push-key') async key() {
    return { publicKey: (await this.service.keys()).publicKey };
  }
  @Post('subscription') async subscribe(@Req() req: any, @Body() dto: SubscriptionDto) {
    await this.service.subscribe(req.user.id, dto);
    return { ok: true };
  }
  @Delete('subscription') async unsubscribe(@Req() req: any, @Body() dto: SubscriptionDto) {
    // Only the authenticated owner can remove this browser's subscription.
    return this.service.unsubscribe(req.user.id, dto.endpoint);
  }
  @Patch('read') read(@Req() req: any, @Body() dto: IdsDto) {
    return this.service.read(req.user.id, dto.ids);
  }
  @Delete() clear(@Req() req: any, @Body() dto: IdsDto) {
    return this.service.clear(req.user.id, dto.ids);
  }
}
