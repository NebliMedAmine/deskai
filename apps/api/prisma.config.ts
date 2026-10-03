import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Not needed for `prisma generate`, so don't fail when it's absent (e.g. in CI/Docker builds).
    url: process.env.DATABASE_URL ?? '',
  },
});
