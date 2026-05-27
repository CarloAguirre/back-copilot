import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { UserWorkspaceSession } from './entities/user-workspace-session.entity';
import { WorkspaceTab } from './entities/workspace-tab.entity';
import { WorkspaceSnapshot } from './entities/workspace-snapshot.entity';
import { AgentAction } from './entities/agent-action.entity';
import { AgentEvent } from './entities/agent-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserWorkspaceSession,
      WorkspaceTab,
      WorkspaceSnapshot,
      AgentAction,
      AgentEvent,
    ]),
  ],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
