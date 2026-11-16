import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IdentityClientService } from './identity-client.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        baseURL:
          configService.get<string>('IDENTITY_SERVICE_URL') ||
          'http://localhost:8080',
        headers: {
          'x-internal-api-key':
            configService.get<string>('INTERNAL_API_KEY') || '',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      }),
    }),
  ],
  providers: [IdentityClientService],
  exports: [IdentityClientService],
})
export class IdentityClientModule {}
