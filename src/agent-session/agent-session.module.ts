import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentSession } from './agent-session.entity';
import { AgentSessionService } from './agent-session.service';
import { AgentSessionController } from './agent-session.controller';
import { AgentCurrentController } from './agent-current.controller';
import { WorkspaceModule } from '../workspace/workspace.module';
import { GithubModule } from '../github/github.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentSession]),
    GithubModule,
    WorkspaceModule,
  ],
  controllers: [AgentSessionController, AgentCurrentController],
  providers: [AgentSessionService],
})
export class AgentSessionModule {}
