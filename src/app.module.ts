import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '@Auth';
import { JwtAuthGuard } from '@Auth/guards';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Si falta DATABASE_URL o JWT_SECRET, la app no arranca.
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    UsersModule,
    NotificacionesModule,
    AuthModule,
    MenuModule,
    ReservacionesModule,
    CategoriasModule,
    PlatillosModule,
    PedidosModule
  ],
  providers: [
    {
      // Todo cerrado por defecto: las rutas públicas se abren con @Public().
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
