import { Module } from '@nestjs/common';
import { TuyaModule } from '../tuya/tuya.module';
import { UsersController, InvitationsController } from './users.controller';
import { UsersService } from './users.service';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  imports: [TuyaModule],
  controllers: [UsersController, InvitationsController],
  providers: [UsersService, RolesGuard],
  exports: [UsersService],
})
export class UsersModule {}
