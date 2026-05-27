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
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { GithubOAuthGuard } from './github-oauth.guard';
import { SessionGuard } from './session.guard';
import { AuthService, SessionUser } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Step 1 – redirect browser to GitHub.
   * Frontend just navigates to GET /auth/github (link or window.location).
   */
  @Get('github')
  @UseGuards(AuthGuard('github'))
  githubLogin() {
    // Passport intercepts and redirects – this body never runs.
  }

  /**
   * Step 2 – GitHub redirects here after user approves.
   * Passport validates the code, creates the session, then we redirect
   * back to the frontend with a clean URL (no token in the URL).
   */
  @Get('github/callback')
  @UseGuards(GithubOAuthGuard)
  async githubCallback(@Res() res: Response) {
    const frontendCallback = this.config.get<string>(
      'FRONTEND_CALLBACK_URL',
      'http://localhost:5173/auth/callback',
    );
    res.redirect(frontendCallback);
  }

  /**
   * GET /auth/me
   * Returns the public user profile stored in the session.
   * The access token is never included in the response.
   */
  @Get('me')
  @UseGuards(SessionGuard)
  getMe(@Req() req: Request) {
    return this.authService.toPublicUser(req.user as SessionUser);
  }

  /**
   * POST /auth/logout
   * Destroys the session and clears the cookie.
   */
  @Get('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Req() req: Request, @Res() res: Response) {
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.status(HttpStatus.NO_CONTENT).send();
      });
    });
  }
}
