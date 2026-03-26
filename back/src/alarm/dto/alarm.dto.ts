import {
  Allow,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ArmDto {
  @IsString()
  @IsIn(['home', 'away'])
  mode!: 'home' | 'away';

  @IsString()
  @IsOptional()
  pin?: string;
}

export class DisarmDto {
  @IsString()
  @IsOptional()
  pin?: string;
}

export class SetPinDto {
  @IsString()
  @MinLength(4)
  @MaxLength(8)
  pin!: string;

  @IsString()
  @IsOptional()
  currentPin?: string;
}

export class UpdateDisplayDto {
  @IsBoolean() @IsOptional() displayMode?: boolean;
  @IsBoolean() @IsOptional() showClock?: boolean;
  @IsBoolean() @IsOptional() showTemp?: boolean;
  @IsBoolean() @IsOptional() showHumidity?: boolean;
  @IsString() @IsOptional() tempDeviceId?: string;
  @IsString() @IsOptional() humidDeviceId?: string;
  @IsInt() @Min(10) @Max(120) @IsOptional() exitDelaySecs?: number;
  @IsInt() @Min(10) @Max(120) @IsOptional() entryDelaySecs?: number;
}

export class CreateRuleDto {
  @IsString() @IsNotEmpty() deviceId!: string;
  @IsString() @IsNotEmpty() deviceName!: string;
  @IsString() @IsNotEmpty() triggerCode!: string;
  @Allow() triggerValue!: unknown;
  @IsBoolean() @IsOptional() activeInHome?: boolean;
  @IsBoolean() @IsOptional() activeInAway?: boolean;
  @IsString() @IsOptional() @IsIn(['ENTRY_DELAY', 'IMMEDIATE']) action?: string;
}

export class UpdateRuleDto {
  @IsBoolean() @IsOptional() activeInHome?: boolean;
  @IsBoolean() @IsOptional() activeInAway?: boolean;
  @IsString() @IsOptional() @IsIn(['ENTRY_DELAY', 'IMMEDIATE']) action?: string;
  @IsBoolean() @IsOptional() enabled?: boolean;
}
