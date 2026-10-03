import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { AiProvider } from './ai-provider';
import { AiService } from './ai.service';
import { MockAiProvider } from './mock-ai.provider';
import { DEFAULT_OPENAI_MODEL, OpenAiProvider } from './openai.provider';

@Module({
  providers: [
    AiService,
    {
      provide: AiProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): AiProvider => {
        const apiKey = config.get('OPENAI_API_KEY', { infer: true });
        const provider = apiKey
          ? new OpenAiProvider(
              apiKey,
              config.get('OPENAI_MODEL', { infer: true }) ?? DEFAULT_OPENAI_MODEL,
              config.get('AI_TIMEOUT_MS', { infer: true }),
            )
          : new MockAiProvider();
        new Logger('AiModule').log(`AI provider: ${provider.model}`);
        return provider;
      },
    },
  ],
  exports: [AiService],
})
export class AiModule {}
