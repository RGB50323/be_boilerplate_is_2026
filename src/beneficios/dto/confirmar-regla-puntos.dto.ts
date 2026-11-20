import { IsInt, Max, Min } from 'class-validator';

export class ConfirmarReglaPuntosDto {
  @IsInt()
  @Min(1)
  @Max(10)
  puntosPorDolar!: number;
}
