import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, type Paginated, type UserDto, type UserSummary } from '@deskai/shared';
import type { AuthUser } from '../common/auth-user';
import { apiError } from '../common/errors';
import { paginated, resolvePage } from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto, UpdateUserDto, UserListQueryDto } from './dto/user.dto';
import { PasswordService } from './password.service';
import { toUserDto, toUserSummary, userSummarySelect } from './user.mapper';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async list(query: UserListQueryDto): Promise<Paginated<UserDto>> {
    const { page, pageSize, skip } = resolvePage(query);
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
    ]);
    return paginated(users.map(toUserDto), total, page, pageSize);
  }

  /** Active staff who can be assigned to tickets. */
  async listAssignable(): Promise<UserSummary[]> {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, role: { in: [Role.AGENT, Role.ADMIN] } },
      select: userSummarySelect,
      orderBy: { name: 'asc' },
    });
    return users.map(toUserSummary);
  }

  async findById(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(apiError('USER_NOT_FOUND', 'User not found'));
    return toUserDto(user);
  }

  async create(dto: CreateUserDto): Promise<UserDto> {
    await this.assertEmailAvailable(dto.email);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role,
        passwordHash: await this.passwords.hash(dto.password),
      },
    });
    return toUserDto(user);
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto): Promise<UserDto> {
    if (actor.id === id && (dto.role !== undefined || dto.isActive === false)) {
      throw new BadRequestException(
        apiError(
          'CANNOT_MODIFY_SELF',
          'Admins cannot change their own role or deactivate themselves',
        ),
      );
    }
    await this.findById(id);

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { name: dto.name, role: dto.role, isActive: dto.isActive },
      });
      // A deactivated or re-roled user must log in again (their access token expires within minutes).
      if (dto.isActive === false || dto.role !== undefined) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return updated;
    });
    return toUserDto(user);
  }

  async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw new ConflictException(
        apiError('EMAIL_TAKEN', 'An account with this email already exists'),
      );
    }
  }
}
