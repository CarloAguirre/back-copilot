import { Controller, Get, Query, BadRequestException, Res } from '@nestjs/common';
import { Response } from 'express';
import { AgentSessionService } from './agent-session.service';

@Controller('agent')
export class AgentCurrentController {
  constructor(private readonly agentSessionService: AgentSessionService) {}

  /**
   * GET /agent/current?key=<stable-key>
   * No auth header — the key IS the credential.
   * Returns plain-text JSON so ChatGPT can fetch it directly.
   */
  @Get('current')
  async getCurrent(@Query('key') key: string, @Res() res: Response) {
    if (!key) throw new BadRequestException('key query param is required');
    const data = await this.agentSessionService.getCurrent(key);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(JSON.stringify(data));
  }
}
