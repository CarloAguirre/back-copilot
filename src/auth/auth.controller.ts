import {
  Controller,
  Get,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt.guard';
import { AuthService, SessionUser } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * GET /auth/github
   * Frontend opens this URL in a popup window.
   * Passport redirects to GitHub – this body never runs.
   */
  @Get('github')
  @UseGuards(AuthGuard('github'))
  githubLogin() {}

  /**
   * GET /auth/github/callback
   * GitHub redirects here after the user approves.
   * We generate a JWT and pass it to the opener window via postMessage,
   * then close the popup – the GitHub token never leaves the server.
   */
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  async githubCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as SessionUser;
    const jwt = await this.authService.generateJwt(user);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body{margin:0;display:flex;justify-content:center;align-items:center;
         height:100vh;background:#0d1117;color:#c9d1d9;font-family:sans-serif}
    .box{text-align:center}
    .check{font-size:52px;margin-bottom:12px}
  </style>
</head>
<body>
  <div class="box">
    <div class="check">&#10003;</div>
    <h2 style="margin:0 0 8px">Login successful</h2>
    <p style="color:#8b949e;margin:0">This window will close automatically.</p>
  </div>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage(
          { type: 'NEBULA_AUTH', token: '${jwt}' },
          '*'
        );
      }
    } finally {
      setTimeout(() => window.close(), 1200);
    }
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
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
   * Stateless – the frontend just discards the JWT.
   * This endpoint exists for a clean API surface.
   */
  @Get('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout() {
    return;
  }
}
