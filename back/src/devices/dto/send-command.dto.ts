import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDefined,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

class CommandDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsDefined()
  value: unknown;
}

export class SendCommandDto {
  @ApiProperty()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CommandDto)
  commands!: CommandDto[];
}
