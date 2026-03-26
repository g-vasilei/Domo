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
import { Roles,RolesGuard } from '../auth/guards/roles.guard';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { SetTuyaCredentialsDto } from './dto/set-tuya-credentials.dto';
import { UpdateMemberPermissionsDto } from './dto/update-member-permissions.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@Req() req: any) {
    return this.usersService.getProfile(req.user.id);
  }

  @Get('logs')
  getLogs(@Req() req: any) {
    return this.usersService.getLogs(req.user.id);
  }

  @Patch('me/password')
  changePassword(@Req() req: any, @Body() body: { currentPassword: string; newPassword: string }) {
    return this.usersService.changePassword(req.user.id, body.currentPassword, body.newPassword);
  }

  @Post('tuya-credentials')
  setTuyaCredentials(@Req() req: any, @Body() dto: SetTuyaCredentialsDto) {
    return this.usersService.setTuyaCredentials(req.user.id, dto);
  }

  // ── Members (OWNER only) ─────────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Get('members')
  getMembers(@Req() req: any) {
    return this.usersService.getMembers(req.user.id);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Get('invitations')
  getPendingInvitations(@Req() req: any) {
    return this.usersService.getPendingInvitations(req.user.id);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Post('members/invite')
  inviteMember(@Req() req: any, @Body() dto: InviteMemberDto) {
    return this.usersService.inviteMember(req.user.id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Put('members/:id/permissions')
  updateMemberPermissions(
    @Req() req: any,
    @Param('id') memberId: string,
    @Body() dto: UpdateMemberPermissionsDto,
  ) {
    return this.usersService.updateMemberPermissions(req.user.id, memberId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Delete('members/:id')
  deleteMember(@Req() req: any, @Param('id') memberId: string) {
    return this.usersService.deleteMember(req.user.id, memberId);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Delete('invitations/:id')
  revokeInvitation(@Req() req: any, @Param('id') invitationId: string) {
    return this.usersService.revokeInvitation(req.user.id, invitationId);
  }
}

// ── Public endpoint (no auth) ────────────────────────────────────────────
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly usersService: UsersService) {}

  @Post('accept')
  accept(@Body() dto: AcceptInvitationDto) {
    return this.usersService.acceptInvitation(dto);
  }
}
