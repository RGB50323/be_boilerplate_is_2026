import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';
import { LoginDto } from '@Auth/dto';
import { ApiValidationPipe } from './api-validation.pipe.js';

class ChildDto {
  @IsString()
  name!: string;
}
class ParentDto {
  @ValidateNested()
  @Type(() => ChildDto)
  child!: ChildDto;
}

describe('ApiValidationPipe', () => {
  const pipe = new ApiValidationPipe();

  it('conserva la normalización del correo del login', async () => {
    const dto = await pipe.transform(
      { email: '  DEMO@example.com  ', password: 'Demo1234!' },
      { type: 'body', metatype: LoginDto },
    );
    expect(dto.email).toBe('demo@example.com');
    expect(dto.password).toBe('Demo1234!');
  });

  it('mantiene message como array y agrega errores sin exponer valores', async () => {
    try {
      await pipe.transform(
        { email: 'correo-invalido', password: '' },
        { type: 'body', metatype: LoginDto },
      );
      expect.fail('Debía rechazar los datos');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse();
      expect(body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        message: expect.any(Array),
        errores: { email: expect.any(String), password: expect.any(String) },
      });
      expect(JSON.stringify(body)).not.toContain('correo-invalido');
    }
  });

  it('mantiene los errores de objetos anidados', async () => {
    try {
      await pipe.transform(
        { child: { name: 12 } },
        { type: 'body', metatype: ParentDto },
      );
      expect.fail('Debía rechazar el objeto');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        errores: { 'child.name': expect.any(String) },
      });
    }
  });

  it('continúa rechazando campos no permitidos', async () => {
    await expect(
      pipe.transform(
        {
          email: 'demo@example.com',
          password: 'Demo1234!',
          rol: 'GERENTE_GENERAL',
        },
        { type: 'body', metatype: LoginDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
