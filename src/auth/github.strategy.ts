import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { AuthService } from './auth.service';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    private readonly config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: config.get<string>('GITHUB_CLIENT_ID'),
      clientSecret: config.get<string>('GITHUB_CLIENT_SECRET'),
      callbackURL: config.get<string>('GITHUB_CALLBACK_URL'),
      // Request repo + user scopes so we can read/write repos and PRs
      scope: ['read:user', 'user:email', 'repo'],
    });
  }

  async validate(
    accessToken: string,
    _refreshToken: string,
    profile: any,
  ) {
    return this.authService.buildSessionUser(accessToken, profile);
  }
}
