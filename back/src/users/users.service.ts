import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SetTuyaCredentialsDto } from './dto/set-tuya-credentials.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { UpdateMemberPermissionsDto } from './dto/update-member-permissions.dto';
import { TuyaService } from '../tuya/tuya.service';

@Injectable()
export class UsersService {
  private readonly algorithm = 'aes-256-cbc';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tuyaService: TuyaService,
    private readonly mail: MailService,
  ) {}

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordHash) throw new BadRequestException('Cannot change password for OAuth accounts');
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { message: 'Password updated' };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tuyaCredentials: { select: { accessId: true, region: true, createdAt: true } },
        permissions: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash, googleId, ...profile } = user;
    if (profile.tuyaCredentials) {
      (profile.tuyaCredentials as any).accessId = this.decrypt((profile.tuyaCredentials as any).accessId);
    }
    return profile;
  }

  async setTuyaCredentials(userId: string, dto: SetTuyaCredentialsDto) {
    // Validate keys against Tuya API before saving
    const valid = await this.tuyaService.validateCredentials(dto.accessId, dto.accessSecret, dto.region);
    if (!valid) throw new BadRequestException('Invalid Tuya credentials');

    const encryptedAccessId = this.encrypt(dto.accessId);
    const encryptedAccessSecret = this.encrypt(dto.accessSecret);

    return this.prisma.tuyaCredentials.upsert({
      where: { userId },
      create: {
        userId,
        accessId: encryptedAccessId,
        accessSecret: encryptedAccessSecret,
        region: dto.region,
      },
      update: {
        accessId: encryptedAccessId,
        accessSecret: encryptedAccessSecret,
        region: dto.region,
      },
    });
  }

  async getTuyaCredentials(userId: string): Promise<{ accessId: string; accessSecret: string; region: string } | null> {
    // Members don't have their own credentials — use their owner's
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, createdById: true } });
    const credUserId = user?.role === 'MEMBER' && user.createdById ? user.createdById : userId;

    const creds = await this.prisma.tuyaCredentials.findUnique({ where: { userId: credUserId } });
    if (!creds) return null;
    return {
      accessId: this.decrypt(creds.accessId),
      accessSecret: this.decrypt(creds.accessSecret),
      region: creds.region,
    };
  }

  async getMembers(ownerId: string) {
    return this.prisma.user.findMany({
      where: { createdById: ownerId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        permissions: true,
      },
    });
  }

  /** Returns [ownerId, ...memberIds] for any user in the group */
  async getGroupUserIds(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, createdById: true } });
    const ownerId = user?.role === 'MEMBER' && user.createdById ? user.createdById : userId;
    const members = await this.prisma.user.findMany({ where: { createdById: ownerId }, select: { id: true } });
    return [ownerId, ...members.map((m) => m.id)];
  }

  async inviteMember(ownerId: string, dto: InviteMemberDto) {
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner || owner.role !== 'OWNER') throw new ForbiddenException('Only owners can invite members');

    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) throw new BadRequestException('A user with this email already exists');

    // Upsert invitation (allow re-invite)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

    await this.prisma.invitation.upsert({
      where: { email: dto.email },
      create: { email: dto.email, token, invitedById: ownerId, expiresAt },
      update: { token, invitedById: ownerId, expiresAt, accepted: false },
    });

    const frontendUrl = this.config.get('FRONTEND_URL') ?? 'http://localhost:5173';
    const inviteUrl = `${frontendUrl}/accept-invite?token=${token}`;
    await this.mail.sendInvitation(dto.email, owner.email, inviteUrl);

    return { message: 'Invitation sent', email: dto.email };
  }

  async acceptInvitation(dto: AcceptInvitationDto) {
    const invitation = await this.prisma.invitation.findUnique({ where: { token: dto.token } });
    if (!invitation) throw new BadRequestException('Invalid invitation token');
    if (invitation.accepted) throw new BadRequestException('Invitation already used');
    if (invitation.expiresAt < new Date()) throw new BadRequestException('Invitation has expired');

    const existing = await this.prisma.user.findUnique({ where: { email: invitation.email } });
    if (existing) throw new BadRequestException('Account already exists for this email');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: invitation.email,
        passwordHash,
        role: 'MEMBER',
        createdById: invitation.invitedById,
        permissions: {
          create: {
            canViewDevices: true,
            canControlDevices: false,
            canArmAlarm: false,
            canSetAlarmPin: false,
          },
        },
      },
      include: { permissions: true },
    });

    await this.prisma.invitation.update({
      where: { token: dto.token },
      data: { accepted: true },
    });

    return { message: 'Account created', userId: user.id, email: user.email };
  }

  async getLogs(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, createdById: true } });

    let actorIds: string[];
    if (user?.role === 'OWNER') {
      // Show logs for owner + all their members
      const members = await this.prisma.user.findMany({ where: { createdById: userId }, select: { id: true } });
      actorIds = [userId, ...members.map((m) => m.id)];
    } else {
      actorIds = [userId];
    }

    return this.prisma.log.findMany({
      where: { userId: { in: actorIds } },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getPendingInvitations(ownerId: string) {
    return this.prisma.invitation.findMany({
      where: { invitedById: ownerId, accepted: false, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvitation(ownerId: string, invitationId: string) {
    const invitation = await this.prisma.invitation.findUnique({ where: { id: invitationId } });
    if (!invitation || invitation.invitedById !== ownerId) throw new ForbiddenException();
    await this.prisma.invitation.delete({ where: { id: invitationId } });
    return { message: 'Invitation revoked' };
  }

  async updateMemberPermissions(ownerId: string, memberId: string, dto: UpdateMemberPermissionsDto) {
    const member = await this.prisma.user.findUnique({ where: { id: memberId } });
    if (!member || member.createdById !== ownerId) throw new ForbiddenException();

    return this.prisma.memberPermissions.update({
      where: { userId: memberId },
      data: dto,
    });
  }

  async deleteMember(ownerId: string, memberId: string) {
    const member = await this.prisma.user.findUnique({ where: { id: memberId } });
    if (!member || member.createdById !== ownerId) throw new ForbiddenException();

    await this.prisma.user.delete({ where: { id: memberId } });
  }

  private encrypt(text: string): string {
    const key = Buffer.from(this.config.get<string>('ENCRYPTION_KEY')!, 'utf8').slice(0, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(text: string): string {
    const key = Buffer.from(this.config.get<string>('ENCRYPTION_KEY')!, 'utf8').slice(0, 32);
    const [ivHex, encryptedHex] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
