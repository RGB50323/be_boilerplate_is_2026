import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MovimientoPuntosDto {
  @ApiProperty() id!: number;
  @ApiProperty() cuentaPuntosId!: number;
  @ApiProperty({ enum: ['ACUMULACION', 'CANJE', 'AJUSTE'] }) tipo!: string;
  @ApiProperty({ example: 12, description: 'Negativo en canjes y ajustes' })
  puntos!: number;
  @ApiProperty() saldoAnterior!: number;
  @ApiProperty() saldoResultante!: number;
  @ApiPropertyOptional({ nullable: true, description: 'Compra que lo generó' })
  pedidoId!: number | null;
  @ApiPropertyOptional({ nullable: true }) canjeId!: number | null;
  @ApiPropertyOptional({ nullable: true }) reglaId!: number | null;
  @ApiPropertyOptional({ nullable: true }) puntosPorDolar!: number | null;
  @ApiPropertyOptional({ nullable: true }) motivo!: string | null;
  @ApiProperty() fecha!: Date;
}

export class PuntosResponseDto {
  @ApiProperty({ description: 'Saldo que se puede canjear' })
  saldoDisponible!: number;
  @ApiProperty({ description: 'Puntos bloqueados las primeras 24 horas' })
  puntosPendientes!: number;
  @ApiProperty({ type: [MovimientoPuntosDto] })
  movimientos!: MovimientoPuntosDto[];
}

export class BeneficioDto {
  @ApiProperty() id!: number;
  @ApiProperty() nombre!: string;
  @ApiPropertyOptional({ nullable: true }) descripcion!: string | null;
  @ApiProperty() costoPuntos!: number;
  @ApiProperty() activo!: boolean;
  @ApiProperty() vigenteDesde!: Date;
  @ApiProperty() vigenteHasta!: Date;
  @ApiProperty() creadoEn!: Date;
  @ApiPropertyOptional({ nullable: true }) modificadoEn!: Date | null;
  @ApiPropertyOptional({ nullable: true }) deshabilitadoEn!: Date | null;
}

export class BeneficioAdministrativoDto extends BeneficioDto {
  @ApiProperty({
    enum: ['ACTIVO', 'INACTIVO', 'FUTURO', 'CADUCADO', 'DESHABILITADO'],
  })
  estado!: string;
}

class BeneficioCuponDto {
  @ApiProperty() id!: number;
  @ApiProperty() nombre!: string;
}

export class CuponDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: '9b38c378f88b7a289fbb' }) codigo!: string;
  @ApiProperty({ type: BeneficioCuponDto }) beneficio!: BeneficioCuponDto;
  @ApiProperty() puntosUsados!: number;
  @ApiProperty() creadoEn!: Date;
  @ApiProperty({ description: 'Fin de la vigencia del beneficio' })
  expiraEn!: Date;
  @ApiPropertyOptional({ nullable: true }) utilizadoEn!: Date | null;
  @ApiProperty({ enum: ['PENDIENTE', 'UTILIZADO', 'EXPIRADO'] })
  estado!: string;
}

export class ReglaPuntosDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 1 }) puntosPorDolar!: number;
  @ApiProperty() activa!: boolean;
  @ApiProperty() vigenteDesde!: Date;
  @ApiPropertyOptional({ nullable: true }) modificadaEn!: Date | null;
  @ApiPropertyOptional({ nullable: true }) deshabilitadaEn!: Date | null;
  @ApiProperty() creadaEn!: Date;
}
