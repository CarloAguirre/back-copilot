import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GithubOAuthGuard extends AuthGuard('github') {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const result = (await super.canActivate(ctx)) as boolean;
    const req = ctx.switchToHttp().getRequest();
    await super.logIn(req);
    return result;
  }
}
