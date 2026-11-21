import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@Config';
import { PlatillosController } from './controllers/platillos.controller.js';
import { PlatillosService } from './services/platillos.service.js';
import { PlatillosRepository } from './repositories/platillos.repository.js';
import { ImagenesPlatilloService } from './services/imagenes-platillo.service.js';
import { ALMACEN_IMAGENES } from './services/almacen-imagenes.js';
import { AlmacenImagenesLocal } from './services/almacen-imagenes-local.js';
import { AlmacenImagenesSupabase } from './services/almacen-imagenes-supabase.js';

@Module({
  controllers: [PlatillosController],
  providers: [
    PlatillosService,
    PlatillosRepository,
    ImagenesPlatilloService,
    {
      // Con Supabase configurado las imágenes van a Storage; si no, al disco local
      provide: ALMACEN_IMAGENES,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => {
        const url = config.get('SUPABASE_URL', { infer: true });
        return url
          ? new AlmacenImagenesSupabase({
              url,
              clave: config.get('SUPABASE_SECRET_KEY', { infer: true }),
              bucket: config.get('SUPABASE_BUCKET_PLATILLOS', { infer: true }),
            })
          : new AlmacenImagenesLocal();
      },
    },
  ],
})
export class PlatillosModule {}