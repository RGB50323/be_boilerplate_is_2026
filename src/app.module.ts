import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from '@Auth';
import { JwtAuthGuard, RolesGuard } from '@Auth/guards';
import { CocinaModule } from '@Cocina';
import { HealthModule } from '@Health';
import { PrismaModule } from '@Prisma';
import { ReservacionesModule } from '@Reservaciones';
import { UsersModule } from '@Users';
import { NotificacionesModule } from '@Notificaciones';
import { validateEnv } from '@Config';
import { MenuModule } from './menu/menu.module.js';
import { CategoriasModule } from '@Categorias';
import { PlatillosModule } from '@Platillos';
import { PedidosModule } from '@Pedidos';
import { ResenasModule } from '@Resenas';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Si falta DATABASE_URL o JWT_SECRET, la app no arranca.
      validate: validateEnv,
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    HealthModule,
    UsersModule,
    NotificacionesModule,
    AuthModule,
    MenuModule,
    ReservacionesModule,
    CocinaModule,
    CategoriasModule,
    PlatillosModule,
    PedidosModule,
    ResenasModule,
  ],
  providers: [
    {
      // Todo cerrado por defecto: las rutas públicas se abren con @Public().
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: RolesGuard,
    },
  ],
})
export class AppModule {}
