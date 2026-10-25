import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class ScheduleSlotDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) time!: string;
  @IsInt() @Min(1) @Max(1440) minutes!: number;
}

export class SaveDeviceScheduleDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsString() @MaxLength(100) deviceName!: string;
  @IsString() @MinLength(1) @MaxLength(80) switchCode!: string;
  @IsString() @MinLength(1) @MaxLength(100) timezone!: string;
  @IsBoolean() enabled!: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days!: number[];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(48)
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  slots!: ScheduleSlotDto[];
}

export class StartDeviceTimerDto {
  @IsString() @MinLength(1) deviceId!: string;
  @IsString() @MaxLength(100) deviceName!: string;
  @IsString() @MinLength(1) switchCode!: string;
  @IsInt() @Min(1) @Max(1440) minutes!: number;
}

export class ToggleDeviceScheduleDto {
  @IsBoolean() enabled!: boolean;
}
