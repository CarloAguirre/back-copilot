import { Controller, Get, Param, Query, BadRequestException, Res } from '@nestjs/common';
import { Response } from 'express';
import { AgentService } from './agent.service';

@Controller('agent')
export class AgentLiveContextController {
  constructor(private readonly agentService: AgentService) {}

  /** GET /agent/workspaces/:id/live-context?token=... */
  @Get('workspaces/:id/live-context')
  getLiveContext(@Param('id') id: string, @Query('token') token: string) {
    if (!token) throw new BadRequestException('token query param is required');
    return this.agentService.getLiveContext(id, token);
  }

  /**
   * GET /agent/live/:token
   * Ultra-simple read for ChatGPT: token in path, plain-text JSON, no headers needed.
   */
  @Get('live/:token')
  async liveSimple(@Param('token') token: string, @Res() res: Response) {
    const data = await this.agentService.getLiveContextByToken(token);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(JSON.stringify(data));
  }
}
