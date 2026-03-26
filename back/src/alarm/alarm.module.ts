import { Module } from '@nestjs/common';
import { AlarmController } from './alarm.controller';
import { AlarmService } from './alarm.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DevicesModule } from '../devices/devices.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, DevicesModule],
  controllers: [AlarmController],
  providers: [AlarmService, RolesGuard],
  exports: [AlarmService],
})
export class AlarmModule {}
