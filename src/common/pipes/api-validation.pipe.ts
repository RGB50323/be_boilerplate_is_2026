import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

function erroresPorCampo(
  errors: ValidationError[],
  prefix = '',
): [string, string][] {
  return errors.flatMap((error) => {
    const field = prefix ? `${prefix}.${error.property}` : error.property;
    const messages = Object.values(error.constraints ?? {});
    const current: [string, string][] = messages.length
      ? [[field, messages.join(' ')]]
      : [];
    return [...current, ...erroresPorCampo(error.children ?? [], field)];
  });
}

/** Conserva el contrato de Nest y agrega los errores por campo para formularios. */
export class ApiValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const errores = Object.fromEntries(erroresPorCampo(errors));
        return new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: Object.values(errores),
          errores,
        });
      },
    });
  }
}
