import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as passport from 'passport';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Log every incoming request so we can trace OAuth callback in Render Live Tail
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const q = Object.keys(req.query).length ? JSON.stringify(req.query) : '';
    console.log(`[req] ${req.method} ${req.path}${q ? ' query=' + q : ''}`);
    next();
  });
  const config = app.get(ConfigService);

  app.use(passport.initialize());

  const frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:5173');
  app.enableCors({
    origin: frontendUrl === '*' ? true : frontendUrl,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  console.log(`Nebula backend running on http://localhost:${port}`);
}

bootstrap();
