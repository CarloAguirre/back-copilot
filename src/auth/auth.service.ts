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
  /** Decrypted only inside the server – never sent to any client. */
  accessToken: string;
}

export interface JwtPayload {
  sub: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  email: string | null;
  /** GitHub token encrypted with AES-256-GCM. */
  enc: string;
}

interface SessionEntry {
  status: 'pending' | 'authenticated';
  token?: string;
  expiresAt: number;
}

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 min

@Injectable()
export class AuthService {
  private readonly sessionStore = new Map<string, SessionEntry>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Session polling store ─────────────────────────────────────────────────

  createPendingSession(): string {
    this.purgeExpired();
    const sessionId = crypto.randomUUID();
    this.sessionStore.set(sessionId, {
      status: 'pending',
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return sessionId;
  }

  storeSessionToken(sessionId: string, token: string): void {
    const entry = this.sessionStore.get(sessionId);
    if (!entry || Date.now() > entry.expiresAt) return;
    entry.status = 'authenticated';
    entry.token = token;
    entry.expiresAt = Date.now() + SESSION_TTL_MS;
  }

  pollSession(sessionId: string): { status: 'pending' } | { status: 'authenticated'; token: string } {
    const entry = this.sessionStore.get(sessionId);
    if (!entry || Date.now() > entry.expiresAt) return { status: 'pending' };
    if (entry.status === 'authenticated') {
      this.sessionStore.delete(sessionId); // consume once – frontend must store the JWT
      return { status: 'authenticated', token: entry.token };
    }
    return { status: 'pending' };
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.sessionStore) {
      if (now > entry.expiresAt) this.sessionStore.delete(id);
    }
  }

  // ── User / JWT ────────────────────────────────────────────────────────────

  buildSessionUser(
    accessToken: string,
    profile: { id: number | string; login: string; name?: string; avatar_url?: string; email?: string },
    emails: { email: string; primary: boolean }[],
  ): SessionUser {
    const primaryEmail =
      emails.find((e) => e.primary)?.email ?? profile.email ?? null;
    return {
      githubId: String(profile.id),
      username: profile.login,
      displayName: profile.name || profile.login,
      avatarUrl: profile.avatar_url ?? '',
      email: primaryEmail,
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

  // ── AES-256-GCM ───────────────────────────────────────────────────────────

  private encKey(): Buffer {
    return crypto.createHash('sha256').update(this.config.get<string>('JWT_SECRET')).digest();
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
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
  }
}
