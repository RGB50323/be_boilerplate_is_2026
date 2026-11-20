import { UserRepository } from '@Users/repositories';
import type { PrismaService } from '@Prisma/services';
import { ReglaPuntosService } from '../src/beneficios/services/regla-puntos.service.js';
import { AcreditacionesRepository } from '../src/lealtad/repositories/acreditaciones.repository.js';
import { AcreditacionesService } from '../src/lealtad/services/acreditaciones.service.js';

export function crearAcreditacionesPruebas(prisma: PrismaService) {
  return new AcreditacionesService(
    new AcreditacionesRepository(prisma),
    new UserRepository(prisma),
    new ReglaPuntosService(prisma),
  );
}
