import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    const host = this.config.get('SMTP_HOST');
    if (host) {
      const port = Number(this.config.get('SMTP_PORT') ?? 587);
      const secure = this.config.get('SMTP_SECURE') === 'true' || port === 465;
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user: this.config.get('SMTP_USER'),
          pass: this.config.get('SMTP_PASS'),
        },
      });
    } else {
      this.logger.warn('SMTP not configured — invitation links will only be logged');
    }
  }

  async sendInvitation(to: string, inviterEmail: string, inviteUrl: string) {
    const subject = `You've been invited to SmartHome`;
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#3C50E0">SmartHome Invitation</h2>
        <p><strong>${inviterEmail}</strong> has invited you to join their SmartHome system.</p>
        <p>Click the button below to set up your account:</p>
        <a href="${inviteUrl}"
           style="display:inline-block;background:#3C50E0;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0">
          Accept Invitation
        </a>
        <p style="color:#888;font-size:12px">This link expires in 48 hours. If you didn't expect this, ignore this email.</p>
      </div>`;

    if (this.transporter) {
      await this.transporter.sendMail({
        from: this.config.get('EMAIL_FROM') ?? 'SmartHome <no-reply@smarthome.local>',
        to,
        subject,
        html,
      });
      this.logger.log(`Invitation sent to ${to}`);
    } else {
      // Dev fallback — log the link so you can test without SMTP
      this.logger.warn(`[DEV] Invitation link for ${to}: ${inviteUrl}`);
    }
  }
}
