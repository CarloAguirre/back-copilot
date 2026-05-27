import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { AgentAction } from '../workspace/entities/agent-action.entity';
import { AgentEvent } from '../workspace/entities/agent-event.entity';
import { GithubModule } from '../github/github.module';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentAction, AgentEvent]),
    GithubModule,
    WorkspaceModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
