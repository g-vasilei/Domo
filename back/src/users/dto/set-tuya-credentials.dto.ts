import { ApiProperty } from '@nestjs/swagger';
import { IsIn,IsString } from 'class-validator';

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
