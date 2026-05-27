import {
  Controller, Get, Post, Patch, Param, Body,
  Req, Res, UseGuards, HttpCode, HttpStatus, MessageEvent, Sse,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { SessionUser } from '../auth/auth.service';
import { WorkspaceService } from './workspace.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { PatchWorkspaceStateDto } from './dto/patch-workspace-state.dto';

function user(req: Request): SessionUser {
  return req.user as SessionUser;
}

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  /** POST /workspaces */
  @Post()
  create(@Req() req: Request, @Body() dto: CreateWorkspaceDto) {
    const { githubId, username } = user(req);
    return this.workspaceService.create(githubId, username, dto);
  }

  /** PATCH /workspaces/:id/state */
  @Patch(':id/state')
  @HttpCode(HttpStatus.NO_CONTENT)
  async patchState(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: PatchWorkspaceStateDto,
  ) {
    await this.workspaceService.patchState(id, user(req).githubId, dto);
  }

  /** GET /workspaces/:id/state */
  @Get(':id/state')
  getState(@Req() req: Request, @Param('id') id: string) {
    return this.workspaceService.getState(id, user(req).githubId);
  }

  /** GET /workspaces/:id/events  (SSE) */
  @Sse(':id/events')
  async events(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<Observable<MessageEvent>> {
    const stream = await this.workspaceService.streamEvents(id, user(req).githubId);
    return stream.pipe(map((data) => ({ data }) as MessageEvent));
  }

  /** POST /workspaces/:id/actions/:actionId/apply */
  @Post(':id/actions/:actionId/apply')
  applyAction(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('actionId') actionId: string,
  ) {
    return this.workspaceService.applyAction(id, actionId, user(req).githubId);
  }

  /** POST /workspaces/:id/actions/:actionId/reject */
  @Post(':id/actions/:actionId/reject')
  rejectAction(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('actionId') actionId: string,
  ) {
    return this.workspaceService.rejectAction(id, actionId, user(req).githubId);
  }
}
