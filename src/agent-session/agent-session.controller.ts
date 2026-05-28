import { Controller, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { SessionUser } from '../auth/auth.service';
import { AgentSessionService } from './agent-session.service';

class SetActiveDto {
  @IsString() @IsNotEmpty() workspaceId: string;
  @IsOptional() @IsString() alias?: string;
}

@Controller('agent-session')
@UseGuards(JwtAuthGuard)
export class AgentSessionController {
  constructor(private readonly agentSessionService: AgentSessionService) {}

  /** PATCH /agent-session/active */
  @Patch('active')
  setActive(@Req() req: Request, @Body() dto: SetActiveDto) {
    const { githubId } = req.user as SessionUser;
    return this.agentSessionService.setActive(githubId, dto.workspaceId, dto.alias);
  }
}
