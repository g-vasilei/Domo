import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID', '');
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET', '');
    super({
      clientID: clientID || 'placeholder',
      clientSecret: clientSecret || 'placeholder',
      callbackURL: config.get('GOOGLE_CALLBACK_URL', 'http://localhost:3001/auth/google/callback'),
      scope: ['email', 'profile'],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: any, done: VerifyCallback) {
    const { id, emails } = profile;
    done(null, { googleId: id, email: emails[0].value });
  }
}
