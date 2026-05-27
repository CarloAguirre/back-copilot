import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
