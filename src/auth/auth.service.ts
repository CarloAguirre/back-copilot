import { Injectable } from '@nestjs/common';

export interface SessionUser {
  githubId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  email: string | null;
  /** Never exposed to the frontend – lives only in the server-side session. */
  accessToken: string;
}

@Injectable()
export class AuthService {
  buildSessionUser(accessToken: string, profile: any): SessionUser {
    return {
      githubId: profile.id,
      username: profile.username,
      displayName: profile.displayName || profile.username,
      avatarUrl: profile.photos?.[0]?.value ?? '',
      email: profile.emails?.[0]?.value ?? null,
      accessToken,
    };
  }

  /** Safe user object – omits the token before sending to the frontend. */
  toPublicUser(user: SessionUser) {
    const { accessToken: _removed, ...pub } = user;
    return pub;
  }
}
