import { ApiProperty } from '@nestjs/swagger';

export class ErrorDisponibilidadResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message!: string | string[];

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Mensajes por campo: id (parámetro de ruta), sucursalId, fecha, hora o personas.',
    example: {
      hora: 'Horario no válido: elegí una hora dentro del horario de atención.',
    },
  })
  errores!: Record<string, string>;
}
