import { Controller, Get, Query, Param, BadRequestException, Res } from '@nestjs/common';
import { Response } from 'express';
import { AgentSessionService } from './agent-session.service';

@Controller('agent')
export class AgentCurrentController {
  constructor(private readonly agentSessionService: AgentSessionService) {}

  /**
   * GET /agent/current?key=<agentKey>
   * Stable URL with explicit key. No auth header needed.
   */
  @Get('current')
  async getCurrent(@Query('key') key: string, @Res() res: Response) {
    if (!key) throw new BadRequestException('key query param is required');
    const data = await this.agentSessionService.getCurrent(key);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(JSON.stringify(data));
  }

  /**
   * GET /agent/current/:alias
   * Zero-friction URL for ChatGPT — alias is set via AGENT_ALIAS env var
   * or via PATCH /agent-session/active { alias }.
   * Example: GET /agent/current/copilot-plus-2
   */
  @Get('current/:alias')
  async getCurrentByAlias(@Param('alias') alias: string, @Res() res: Response) {
    const data = await this.agentSessionService.getCurrentByAlias(alias);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(JSON.stringify(data));
  }
}
