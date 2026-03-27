import { Module } from '@nestjs/common';

import { DevicesModule } from '../devices/devices.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { AutomationEvaluatorService } from './automation-evaluator.service';

@Module({
  imports: [PrismaModule, DevicesModule],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationEvaluatorService],
  exports: [AutomationEvaluatorService],
})
export class AutomationModule {}
