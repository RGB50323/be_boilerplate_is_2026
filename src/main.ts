import { ApiValidationPipe } from '@Common/pipes';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import type { EnvConfig } from '@Config';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';

const API_PREFIX = 'api/v1';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService<EnvConfig, true>);

  // Versionado en la URI: /api/v1/...
  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(new ApiValidationPipe());

  app.enableShutdownHooks();

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SI Backend Boilerplate')
    .setDescription('API REST con autenticación por usuario y contraseña.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}

await bootstrap();
