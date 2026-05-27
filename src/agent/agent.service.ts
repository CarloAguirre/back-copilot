import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { WorkspaceService } from '../workspace/workspace.service';
import { AgentAction, AgentActionStatus } from '../workspace/entities/agent-action.entity';
import { AgentEvent, AgentEventType } from '../workspace/entities/agent-event.entity';
import { WorkspaceSnapshot } from '../workspace/entities/workspace-snapshot.entity';
import { EventBusService } from '../events/event-bus.service';
import { CreateActionDto } from './dto/create-action.dto';

@Injectable()
export class AgentService {
  constructor(
    @InjectRepository(AgentAction) private actionRepo: Repository<AgentAction>,
    @InjectRepository(AgentEvent) private eventRepo: Repository<AgentEvent>,
    @InjectRepository(WorkspaceSnapshot) private snapRepo: Repository<WorkspaceSnapshot>,
    private readonly workspaceService: WorkspaceService,
    private readonly eventBus: EventBusService,
    private readonly config: ConfigService,
  ) {}

  async getContext(workspaceId: string) {
    const ws = await this.workspaceService.findByIdOrFail(workspaceId);

    const recentSnapshots = await this.snapRepo.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
      take: 3,
    });

    const dirtyFiles = ws.tabs.filter((t) => t.dirty).map((t) => t.path);

    return {
      workspaceId,
      repoFullName: ws.repoFullName,
      owner: ws.owner,
      repo: ws.repo,
      branch: ws.branch,
      activePath: ws.activePath,
      tabs: ws.tabs.map((t) => ({
        path: t.path,
        language: t.language,
        sha: t.sha,
        dirty: t.dirty,
        isActive: t.isActive,
        content: t.content,
        cursorLine: t.cursorLine,
        cursorColumn: t.cursorColumn,
      })),
      dirtyFiles,
      treeSummary: ws.tabs.map((t) => t.path),
      recentSnapshots: recentSnapshots.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        activePath: (s.payload as any).activePath,
        tabCount: ((s.payload as any).tabs ?? []).length,
      })),
    };
  }

  async getLiveContext(workspaceId: string, token: string) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Invalid token format');

    const [tokenWsId, expiresAtStr, sig] = parts;
    if (tokenWsId !== workspaceId) throw new UnauthorizedException('Token/workspace mismatch');

    const expiresAt = Number(expiresAtStr);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      throw new UnauthorizedException('Token expired');
    }

    const secret = this.config.get<string>('JWT_SECRET');
    const expected = createHmac('sha256', secret).update(`${workspaceId}:${expiresAt}`).digest('hex');
    if (expected.length !== sig.length) throw new UnauthorizedException('Invalid token signature');
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
      throw new UnauthorizedException('Invalid token signature');
    }

    const ws = await this.workspaceService.findByIdOrFail(workspaceId);
    const dirtyFiles = ws.tabs.filter((t) => t.dirty).map((t) => t.path);

    return {
      workspaceId,
      repoFullName: ws.repoFullName,
      owner: ws.owner,
      repo: ws.repo,
      branch: ws.branch,
      activePath: ws.activePath,
      updatedAt: ws.updatedAt,
      tabs: ws.tabs.map((t) => ({
        path: t.path,
        language: t.language,
        sha: t.sha,
        dirty: t.dirty,
        isActive: t.isActive,
        content: t.content,
        cursorLine: t.cursorLine,
        cursorColumn: t.cursorColumn,
        selectionStart: t.selectionStart,
        selectionEnd: t.selectionEnd,
      })),
      dirtyFiles,
    };
  }

  async createAction(workspaceId: string, dto: CreateActionDto) {
    await this.workspaceService.findByIdOrFail(workspaceId);

    const action = await this.actionRepo.save(
      this.actionRepo.create({
        workspaceId,
        type: dto.type,
        payload: dto.payload,
        createdBy: dto.createdBy,
        status: AgentActionStatus.PENDING,
      }),
    );

    const event = await this.eventRepo.save(
      this.eventRepo.create({
        workspaceId,
        type: AgentEventType.AGENT_ACTION,
        payload: { action },
      }),
    );

    this.eventBus.emit(workspaceId, { type: 'agent_action', action });

    return action;
  }
}
