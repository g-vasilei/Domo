import { Module } from '@nestjs/common';
import { TuyaService } from './tuya.service';

@Module({
  providers: [TuyaService],
  exports: [TuyaService],
})
export class TuyaModule {}
