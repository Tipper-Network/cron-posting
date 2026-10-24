import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadDotEnv } from './env';

async function bootstrap() {
  loadDotEnv();
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  const port = Number(process.env.PORT || process.env.API_PORT || 3001);
  await app.listen(port);
}

bootstrap();
