import { Controller, Get, Param, Query, BadRequestException } from '@nestjs/common';
import { AgentService } from './agent.service';

@Controller('agent/workspaces')
export class AgentLiveContextController {
  constructor(private readonly agentService: AgentService) {}

  /** GET /agent/workspaces/:id/live-context?token=... — no auth guard, token is self-validating */
  @Get(':id/live-context')
  getLiveContext(@Param('id') id: string, @Query('token') token: string) {
    if (!token) throw new BadRequestException('token query param is required');
    return this.agentService.getLiveContext(id, token);
  }
}
