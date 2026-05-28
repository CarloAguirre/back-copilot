import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentSession } from './agent-session.entity';
import { AgentSessionService } from './agent-session.service';
import { AgentSessionController } from './agent-session.controller';
import { AgentCurrentController } from './agent-current.controller';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentSession]),
    WorkspaceModule,
  ],
  controllers: [AgentSessionController, AgentCurrentController],
  providers: [AgentSessionService],
})
export class AgentSessionModule {}
