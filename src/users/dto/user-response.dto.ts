import { ApiProperty } from '@nestjs/swagger';
import { Rol, type User } from '@PrismaClient';

/**
 * Forma pública de un usuario.
 *
 * Los controladores devuelven esto y nunca la fila cruda de Prisma, para que
 * `passwordHash` no pueda filtrarse en una respuesta por descuido.
 */
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'nestor@example.com', format: 'email' })
  email!: string;

  @ApiProperty({ enum: Rol, example: Rol.GERENTE })
  rol!: Rol;

  @ApiProperty({ type: Number, nullable: true, example: 1 })
  sucursalId!: number | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  static fromEntity(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      rol: user.rol,
      sucursalId: user.sucursalId,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }
}
