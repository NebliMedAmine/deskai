import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role, type Paginated, type UserDto, type UserSummary } from '@deskai/shared';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateUserDto, UpdateUserDto, UserListQueryDto } from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('users')
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: UserListQueryDto): Promise<Paginated<UserDto>> {
    return this.users.list(query);
  }

  /** Staff list for the "assign to" dropdown. */
  @Get('assignable')
  @Roles(Role.AGENT, Role.ADMIN)
  listAssignable(): Promise<UserSummary[]> {
    return this.users.listAssignable();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserDto> {
    return this.users.findById(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto): Promise<UserDto> {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDto> {
    return this.users.update(actor, id, dto);
  }
}
