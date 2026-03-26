import { IsArray, ValidateNested, IsString, Allow } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class CommandDto {
  @IsString()
  code!: string;

  @Allow()
  value: unknown;
}

export class SendCommandDto {
  @ApiProperty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommandDto)
  commands!: CommandDto[];
}
