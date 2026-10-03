import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import type { Env } from '../config/env';

@Injectable()
export class PasswordService {
  private readonly rounds: number;
  /** Compared against when a login email doesn't exist, so response time doesn't reveal it. */
  private readonly dummyHash: string;

  constructor(config: ConfigService<Env, true>) {
    this.rounds = config.get('BCRYPT_ROUNDS', { infer: true });
    this.dummyHash = bcrypt.hashSync('timing-safe-dummy-password', this.rounds);
  }

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  verify(plain: string, hash: string | null | undefined): Promise<boolean> {
    return bcrypt.compare(plain, hash ?? this.dummyHash);
  }
}
