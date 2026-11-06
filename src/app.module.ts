import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from '@Auth';
import { JwtAuthGuard, RolesGuard } from '@Auth/guards';
import { CocinaModule } from '@Cocina';
import { HealthModule } from '@Health';
import { PrismaModule } from '@Prisma';
import { UsersModule } from '@Users';
import { validateEnv } from '@Config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Si falta DATABASE_URL o JWT_SECRET, la app no arranca.
      validate: validateEnv,
    }),
    // Bus de eventos interno: desacopla a quien produce un cambio (pedidos,
    // cocina) de quien lo publica por WebSocket (gateways).
    EventEmitterModule.forRoot(),
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    CocinaModule,
  ],
  providers: [
    {
      // Todo cerrado por defecto: las rutas públicas se abren con @Public().
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
    {
      // Corre después de JwtAuthGuard (los APP_GUARD se ejecutan en el orden
      // en que se registran), así que ya tiene el usuario en el request.
      provide: APP_GUARD,
      useExisting: RolesGuard,
    },
  ],
})
export class AppModule {}
