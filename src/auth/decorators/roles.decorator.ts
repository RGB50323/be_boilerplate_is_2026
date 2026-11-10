import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse } from '@nestjs/swagger';
import type { Rol } from '@PrismaClient';
import { ROLES_KEY, RolesGuard } from '../guards/roles.guard.js';


export const Roles = (...roles: Rol[]) =>
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    UseGuards(RolesGuard),
    ApiForbiddenResponse({
      description: `Solo para los roles: ${roles.join(', ')}.`,
    }),
  );
