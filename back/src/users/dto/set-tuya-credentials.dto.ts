import { IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetTuyaCredentialsDto {
  @ApiProperty()
  @IsString()
  accessId!: string;

  @ApiProperty()
  @IsString()
  accessSecret!: string;

  @ApiProperty({ enum: ['eu', 'us', 'cn'] })
  @IsIn(['eu', 'us', 'cn'])
  region!: 'eu' | 'us' | 'cn';
}
