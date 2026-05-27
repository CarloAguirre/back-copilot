import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { GithubModule } from './github/github.module';
import { EventsModule } from './events/events.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { AgentModule } from './agent/agent.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: true, // auto-creates/alters tables on start
        ssl: config.get<string>('NODE_ENV') === 'production'
          ? { rejectUnauthorized: false }
          : false,
      }),
      inject: [ConfigService],
    }),

    EventsModule,
    AuthModule,
    GithubModule,
    WorkspaceModule,
    AgentModule,
  ],
})
export class AppModule {}
