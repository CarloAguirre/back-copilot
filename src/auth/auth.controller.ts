import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  InternalServerErrorException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './jwt.guard';
import { AuthService, SessionUser } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /auth/session
   * Step 1 – frontend calls this to obtain a sessionId and the authUrl to show the user.
   * No auth required.
   */
  @Post('session')
  @HttpCode(HttpStatus.OK)
  createSession() {
    const sessionId = this.authService.createPendingSession();
    const backendUrl = this.config.get<string>('BACKEND_URL', 'https://back-copilot.onrender.com');
    const authUrl = `${backendUrl}/auth/github?sessionId=${sessionId}`;
    return { sessionId, authUrl };
  }

  /**
   * GET /auth/session/:sessionId
   * Step 3 (polling) – frontend polls until status is "authenticated".
   * On first authenticated response the token is returned and the session is consumed.
   */
  @Get('session/:sessionId')
  pollSession(@Param('sessionId') sessionId: string) {
    return this.authService.pollSession(sessionId);
  }

  /**
   * GET /auth/github?sessionId=<uuid>
   * Step 2a – redirect the user's browser to GitHub OAuth.
   * The sessionId travels as OAuth state so the callback can link them.
   */
  @Get('github')
  githubLogin(
    @Query('sessionId') sessionId: string,
    @Res() res: Response,
  ) {
    if (!sessionId) throw new BadRequestException('sessionId is required');

    const params = new URLSearchParams({
      client_id: this.config.get<string>('GITHUB_CLIENT_ID'),
      redirect_uri: this.config.get<string>('GITHUB_CALLBACK_URL'),
      scope: 'read:user user:email repo',
      state: sessionId,
    });

    res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  }

  /**
   * GET /auth/github/callback
   * Step 2b – GitHub redirects here with ?code=&state=<sessionId>.
   * We exchange the code, generate a JWT, store it keyed by sessionId,
   * and return a plain HTML page the user can close.
   */
  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code) {
      return this.sendHtml(res, '✗', 'Error', 'No se recibió código de GitHub. Intenta de nuevo.');
    }

    // ── Exchange code for access token ────────────────────────────────────
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.config.get<string>('GITHUB_CLIENT_ID'),
        client_secret: this.config.get<string>('GITHUB_CLIENT_SECRET'),
        code,
        redirect_uri: this.config.get<string>('GITHUB_CALLBACK_URL'),
      }),
    });

    const tokenData = (await tokenRes.json()) as any;
    const accessToken: string = tokenData.access_token;

    if (!accessToken) {
      return this.sendHtml(res, '✗', 'Error de autenticación', 'No se pudo obtener el token. Intenta de nuevo.');
    }

    // ── Fetch GitHub profile + emails in parallel ─────────────────────────
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' };
    const [profileRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user', { headers }),
      fetch('https://api.github.com/user/emails', { headers }),
    ]);

    if (!profileRes.ok) {
      throw new InternalServerErrorException('GitHub profile fetch failed');
    }

    const profile = (await profileRes.json()) as any;
    const emails = emailsRes.ok ? ((await emailsRes.json()) as any[]) : [];

    // ── Build user, generate JWT, store in session ────────────────────────
    const sessionUser = this.authService.buildSessionUser(accessToken, profile, emails);
    const jwt = await this.authService.generateJwt(sessionUser);

    if (state) {
      this.authService.storeSessionToken(state, jwt);
    }

    return this.sendHtml(res, '✓', 'Login listo, vuelve al chat.', 'Puedes cerrar esta pestaña.');
  }

  /**
   * GET /auth/me
   * Returns the public user profile. Requires Authorization: Bearer <token>.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req: Request) {
    return this.authService.toPublicUser(req.user as SessionUser);
  }

  /**
   * GET /auth/logout
   * Stateless – the frontend simply discards the JWT.
   */
  @Get('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout() {
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────

  private sendHtml(res: Response, icon: string, title: string, subtitle: string) {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body{margin:0;display:flex;justify-content:center;align-items:center;
         height:100vh;background:#0d1117;color:#c9d1d9;font-family:sans-serif;text-align:center}
  </style>
</head>
<body>
  <div>
    <div style="font-size:52px;margin-bottom:12px">${icon}</div>
    <h2 style="margin:0 0 8px">${title}</h2>
    <p style="color:#8b949e;margin:0">${subtitle}</p>
  </div>
</body>
</html>`);
  }
}
