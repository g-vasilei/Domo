import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ConditionDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() ruleId?: string;

  @IsIn(['device_state', 'time', 'sun'])
  type!: string;

  @ValidateIf((o) => o.type === 'device_state')
  @IsString()
  @IsNotEmpty()
  deviceId?: string;
  @IsOptional() @IsString() deviceName?: string;
  @ValidateIf((o) => o.type === 'device_state')
  @IsString()
  @IsNotEmpty()
  statusCode?: string;
  @IsOptional() @IsIn(['eq', 'neq', 'gt', 'lt']) operator?: string;
  @ValidateIf((o) => o.type === 'device_state')
  @IsDefined()
  value?: unknown;

  @ValidateIf((o) => o.type === 'time')
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  timeValue?: string;

  @ValidateIf((o) => o.type === 'sun')
  @IsIn(['sunrise', 'sunset'])
  sunEvent?: string;
  @IsOptional() @IsInt() @Min(-1440) @Max(1440) sunOffsetMin?: number;

  @IsInt() @Min(0) order!: number;
  @IsOptional() @IsIn(['AND', 'OR']) nextOperator?: string;
}

export class ActionDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() ruleId?: string;

  @IsIn(['device_control', 'countdown', 'notification'])
  type!: string;

  @ValidateIf((o) => ['device_control', 'countdown'].includes(o.type))
  @IsString()
  @IsNotEmpty()
  deviceId?: string;
  @IsOptional() @IsString() deviceName?: string;
  @ValidateIf((o) => ['device_control', 'countdown'].includes(o.type))
  @IsString()
  @IsNotEmpty()
  statusCode?: string;
  @ValidateIf((o) => o.type === 'device_control')
  @IsDefined()
  value?: unknown;
  @ValidateIf((o) => o.type === 'countdown')
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes?: number;

  @IsInt() @Min(0) order!: number;
}

export class CreateRuleDto {
  @IsString() @Matches(/\S/) name!: string;
  @IsBoolean() @ValidateIf((_o, value) => value !== undefined) enabled?: boolean;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  conditions!: ConditionDto[];

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ActionDto)
  actions!: ActionDto[];
}

export class UpdateRuleDto {
  @ValidateIf((_o, value) => value !== undefined) @IsString() @Matches(/\S/) name?: string;
  @ValidateIf((_o, value) => value !== undefined) @IsBoolean() enabled?: boolean;

  @ValidateIf((_o, value) => value !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  conditions?: ConditionDto[];

  @ValidateIf((_o, value) => value !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ActionDto)
  actions?: ActionDto[];
}

export class UpdateLocationDto {
  @ValidateIf((_o, value) => value !== undefined) @IsString() timezone?: string;
  @ValidateIf((_o, value) => value !== undefined) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @ValidateIf((_o, value) => value !== undefined)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
