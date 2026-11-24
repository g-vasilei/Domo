import { Module } from '@nestjs/common';

import { TuyaService } from './tuya.service';
import { TuyaMessagesService } from './tuya-messages.service';

@Module({
  providers: [TuyaService, TuyaMessagesService],
  exports: [TuyaService],
})
export class TuyaModule {}
