import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { EstadoResena, MotivoOcultacion } from '@PrismaClient';
import { PaginacionQueryDto } from '@Common/paginacion';

export class ModeracionQueryDto extends PaginacionQueryDto {
  @ApiPropertyOptional({
    enum: EstadoResena,
    description: 'Filtra por Visibles u Ocultas; sin filtro trae todas.',
  })
  @IsOptional()
  @IsIn(Object.values(EstadoResena), {
    message: 'El estado debe ser VISIBLE u OCULTA.',
  })
  estado?: EstadoResena;
}

export class OcultarResenaDto {
  @ApiProperty({ enum: MotivoOcultacion, example: MotivoOcultacion.OFENSIVO })
  @IsEnum(MotivoOcultacion, {
    message: 'Elige un motivo: OFENSIVO, SPAM o NO_RELACIONADO.',
  })
  motivo!: MotivoOcultacion;
}

export class OcultacionDto {
  @ApiProperty({ example: 'Gerente Centro' })
  por!: string;

  @ApiProperty({ example: '2026-11-18' })
  fecha!: string;

  @ApiProperty({ example: '21:30' })
  hora!: string;

  @ApiProperty({ enum: MotivoOcultacion })
  motivo!: MotivoOcultacion;
}

export class ResenaModeracionDto {
  @ApiProperty({ example: 501 })
  id!: number;

  @ApiProperty({ example: 'Pupusa revuelta' })
  platillo!: string;

  @ApiProperty({ example: 2 })
  estrellas!: number;

  @ApiProperty({ type: String, nullable: true, example: 'No me gustó' })
  comentario!: string | null;

  @ApiProperty({ example: '2026-11-15' })
  fecha!: string;

  @ApiProperty({ example: 'Ana L.' })
  cliente!: string;

  @ApiProperty({ enum: EstadoResena })
  estado!: EstadoResena;

  @ApiProperty({
    type: OcultacionDto,
    nullable: true,
    description: 'Quién, cuándo y por qué se ocultó; null si está visible.',
  })
  ocultacion!: OcultacionDto | null;
}

export class ModeracionResenasResponseDto {
  @ApiProperty({ type: [ResenaModeracionDto] })
  datos!: ResenaModeracionDto[];

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 3 })
  totalPaginas!: number;

  @ApiProperty({ example: 25 })
  total!: number;
}
