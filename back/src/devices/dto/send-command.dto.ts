import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Allow, IsArray, IsString, ValidateNested } from 'class-validator';

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
