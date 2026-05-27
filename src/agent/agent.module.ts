import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentController } from './agent.controller';
import { AgentLiveContextController } from './agent-live-context.controller';
import { AgentService } from './agent.service';
import { AgentKeyGuard } from './agent-key.guard';
import { AgentAction } from '../workspace/entities/agent-action.entity';
import { AgentEvent } from '../workspace/entities/agent-event.entity';
import { WorkspaceSnapshot } from '../workspace/entities/workspace-snapshot.entity';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentAction, AgentEvent, WorkspaceSnapshot]),
    WorkspaceModule,
  ],
  controllers: [AgentController, AgentLiveContextController],
  providers: [AgentService, AgentKeyGuard],
})
export class AgentModule {}
