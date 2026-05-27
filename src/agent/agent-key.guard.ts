import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AgentKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] ?? '';
    const key = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-agent-key'];
    const expected = this.config.get<string>('AGENT_API_KEY');

    if (!key || key !== expected) {
      throw new UnauthorizedException('Invalid or missing agent key');
    }
    return true;
  }
}
