import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from '../prisma/prisma.module';
import { TuyaModule } from '../tuya/tuya.module';
import { UsersModule } from '../users/users.module';
import { DevicesController } from './devices.controller';
import { DevicesGateway } from './devices.gateway';
import { DevicesService } from './devices.service';

@Module({
  imports: [
    TuyaModule,
    UsersModule,
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '15m') },
      }),
    }),
  ],
  controllers: [DevicesController],
  providers: [DevicesService, DevicesGateway],
  exports: [DevicesGateway, DevicesService],
})
export class DevicesModule {}
