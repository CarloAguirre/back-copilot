import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { AgentKeyGuard } from './agent-key.guard';
import { AgentService } from './agent.service';
import { CreateActionDto } from './dto/create-action.dto';

@Controller('agent/workspaces')
@UseGuards(AgentKeyGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /** GET /agent/workspaces/:id/context */
  @Get(':id/context')
  getContext(@Param('id') id: string) {
    return this.agentService.getContext(id);
  }

  /** POST /agent/workspaces/:id/actions */
  @Post(':id/actions')
  createAction(@Param('id') id: string, @Body() dto: CreateActionDto) {
    return this.agentService.createAction(id, dto);
  }
}
