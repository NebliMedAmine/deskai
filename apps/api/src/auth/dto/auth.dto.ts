import { IsString, MaxLength, MinLength } from 'class-validator';
import type { LoginRequest, RegisterRequest } from '@deskai/shared';
import { EmailField, NameField, PasswordField } from '../../users/dto/user.dto';

export class RegisterDto implements RegisterRequest {
  @EmailField()
  email: string;

  @NameField()
  name: string;

  @PasswordField()
  password: string;
}

export class LoginDto implements LoginRequest {
  @EmailField()
  email: string;

  // No strength rules at login: only reject obviously invalid input.
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}
