
import { IsEnum } from 'class-validator';
import { EstadoTransaccionSimulada } from '../services/pasarela-simulada.service.js';

export class CambiarEstadoPagoDto {
  @IsEnum(EstadoTransaccionSimulada)
  estado!: EstadoTransaccionSimulada;
}
