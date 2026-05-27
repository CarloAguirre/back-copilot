import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface SessionUser {
  githubId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  email: string | null;
  /** Never exposed to the frontend – decrypted only inside the server. */
  accessToken: string;
}

export interface JwtPayload {
  sub: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  email: string | null;
  /** GitHub token encrypted with AES-256-GCM. Unreadable without JWT_SECRET. */
  enc: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  buildSessionUser(accessToken: string, profile: any): SessionUser {
    return {
      githubId: String(profile.id),
      username: profile.username,
      displayName: profile.displayName || profile.username,
      avatarUrl: profile.photos?.[0]?.value ?? '',
      email: profile.emails?.[0]?.value ?? null,
      accessToken,
    };
  }

  async generateJwt(user: SessionUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.githubId,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      email: user.email,
      enc: this.encryptToken(user.accessToken),
    };
    return this.jwtService.signAsync(payload);
  }

  fromJwtPayload(payload: JwtPayload): SessionUser {
    return {
      githubId: payload.sub,
      username: payload.username,
      displayName: payload.displayName,
      avatarUrl: payload.avatarUrl,
      email: payload.email,
      accessToken: this.decryptToken(payload.enc),
    };
  }

  toPublicUser(user: SessionUser) {
    const { accessToken: _removed, ...pub } = user;
    return pub;
  }

  // ── AES-256-GCM helpers ───────────────────────────────────────────────────

  private encKey(): Buffer {
    // Derive a 32-byte key from JWT_SECRET using SHA-256
    return crypto
      .createHash('sha256')
      .update(this.config.get<string>('JWT_SECRET'))
      .digest();
  }

  private encryptToken(token: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encKey(), iv);
    const enc = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':');
  }

  private decryptToken(encryptedToken: string): string {
    const [ivHex, tagHex, encHex] = encryptedToken.split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encKey(),
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(encHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }
}
