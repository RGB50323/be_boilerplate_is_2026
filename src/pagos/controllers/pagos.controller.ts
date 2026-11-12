import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { ProcesarPagoDto } from '@Pagos/dto';
import { PagosService } from '@Pagos/services';

@Controller('pagos')
export class PagosController {
  constructor(
    private readonly pagosService: PagosService,
  ) {}

  @Post('procesar')
  async procesarPago(@Body() datos: ProcesarPagoDto) {
    return this.pagosService.procesarPago(datos);
  }
}
