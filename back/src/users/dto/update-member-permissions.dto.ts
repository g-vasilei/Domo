import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateMemberPermissionsDto {
  @IsOptional() @IsBoolean() canViewDevices?: boolean;
  @IsOptional() @IsBoolean() canControlDevices?: boolean;
  @IsOptional() @IsBoolean() canCreateSchedules?: boolean;
  @IsOptional() @IsBoolean() canManageMembers?: boolean;
  @IsOptional() @IsBoolean() canArmAlarm?: boolean;
  @IsOptional() @IsBoolean() canSetAlarmPin?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) allowedDeviceIds?: string[];
}
