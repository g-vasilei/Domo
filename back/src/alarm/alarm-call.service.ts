import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';

const OTP_TTL_SECS = 300; // 5 minutes

@Injectable()
export class AlarmCallService {
  private readonly logger = new Logger(AlarmCallService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // ── OTP ────────────────────────────────────────────────────────────────────

  async sendOtp(userId: string, phoneNumber: string): Promise<void> {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.set(
      `phone_otp:${userId}`,
      JSON.stringify({ otp, phoneNumber }),
      'EX',
      OTP_TTL_SECS,
    );

    const creds = await this.getCredentials(userId);
    if (!creds) {
      this.logger.warn(`OTP for ${phoneNumber}: ${otp} (Infobip not configured — log only)`);
      return;
    }

    await this.sendSms(creds, phoneNumber, `Your Domo verification code is: ${otp}. Valid for 5 minutes.`);
    this.logger.log(`OTP sent to ${phoneNumber}`);
  }

  async verifyOtp(userId: string, otp: string): Promise<string | null> {
    const raw = await this.redis.get(`phone_otp:${userId}`);
    if (!raw) return null;

    const { otp: stored, phoneNumber } = JSON.parse(raw);
    if (stored !== otp) return null;

    await this.redis.del(`phone_otp:${userId}`);
    return phoneNumber;
  }

  // ── Voice call ──────────────────────────────────────────────────────────────

  async callNumber(userId: string, to: string): Promise<void> {
    const creds = await this.getCredentials(userId);
    if (!creds) {
      this.logger.warn(`Phone call to ${to} skipped — Infobip not configured`);
      return;
    }

    try {
      const res = await fetch(`${creds.baseUrl}/tts/3/single`, {
        method: 'POST',
        headers: {
          Authorization: `App ${creds.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          from: creds.sender,
          to,
          text: 'Alert. Your home alarm has been triggered. Please check your property immediately.',
          language: 'en',
          voice: { name: 'Joanna', gender: 'female' },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`Infobip voice call failed (${res.status}): ${body}`);
        return;
      }

      const data: any = await res.json();
      this.logger.log(`Voice call initiated to ${to} — bulk ID: ${data.bulkId}`);
    } catch (e: any) {
      this.logger.error(`Voice call to ${to} failed: ${e?.message}`);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async getCredentials(userId: string) {
    const settings = await this.prisma.alarmSettings.findUnique({ where: { userId } });
    if (!settings?.infobipApiKey || !settings.infobipBaseUrl) return null;

    return {
      apiKey: this.encryption.decrypt(settings.infobipApiKey),
      baseUrl: settings.infobipBaseUrl,
      sender: settings.infobipSender ?? 'Domo',
    };
  }

  private async sendSms(
    creds: { apiKey: string; baseUrl: string; sender: string },
    to: string,
    text: string,
  ): Promise<void> {
    const res = await fetch(`${creds.baseUrl}/sms/2/text/advanced`, {
      method: 'POST',
      headers: {
        Authorization: `App ${creds.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        messages: [{ from: creds.sender, destinations: [{ to }], text }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Infobip SMS failed (${res.status}): ${body}`);
    }
  }
}
