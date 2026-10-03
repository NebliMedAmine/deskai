import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  ROLES,
  type CreateUserRequest,
  type Role,
  type UpdateUserRequest,
  type UserListQuery,
} from '@deskai/shared';
import { PaginationQueryDto } from '../../common/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Reusable field rules, shared with the auth DTOs. */
export const EmailField = () =>
  applyDecorators(
    Transform(normalizeEmail),
    IsEmail({}, { message: 'email must be a valid email address' }),
    MaxLength(254),
  );

export const NameField = () => applyDecorators(Transform(trim), IsString(), Length(1, 100));

export const PasswordField = () =>
  applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH),
    MaxLength(72), // bcrypt only uses the first 72 bytes
    Matches(PASSWORD_PATTERN, {
      message: 'password must contain at least one letter and one number',
    }),
  );

export class CreateUserDto implements CreateUserRequest {
  @EmailField()
  email: string;

  @NameField()
  name: string;

  @PasswordField()
  password: string;

  @IsIn(ROLES)
  role: Role;
}

export class UpdateUserDto implements UpdateUserRequest {
  @IsOptional()
  @NameField()
  name?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UserListQueryDto extends PaginationQueryDto implements UserListQuery {
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;
}
