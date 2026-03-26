import { Module } from '@nestjs/common';

import { RolesGuard } from '../auth/guards/roles.guard';
import { TuyaModule } from '../tuya/tuya.module';
import { InvitationsController, UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TuyaModule],
  controllers: [UsersController, InvitationsController],
  providers: [UsersService, RolesGuard],
  exports: [UsersService],
})
export class UsersModule {}
