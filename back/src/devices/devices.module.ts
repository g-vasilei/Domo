import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { DevicesGateway } from './devices.gateway';
import { TuyaModule } from '../tuya/tuya.module';
import { UsersModule } from '../users/users.module';
import { PrismaModule } from '../prisma/prisma.module';

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
