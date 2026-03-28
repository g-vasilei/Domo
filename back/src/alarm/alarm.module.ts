import { Module } from '@nestjs/common';

import { RolesGuard } from '../auth/guards/roles.guard';
import { DevicesModule } from '../devices/devices.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AlarmCallService } from './alarm-call.service';
import { AlarmController } from './alarm.controller';
import { AlarmService } from './alarm.service';

@Module({
  imports: [PrismaModule, DevicesModule, EncryptionModule],
  controllers: [AlarmController],
  providers: [AlarmService, AlarmCallService, RolesGuard],
  exports: [AlarmService],
})
export class AlarmModule {}
