import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ConditionDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() ruleId?: string;

  @IsIn(['device_state', 'time', 'sun'])
  type!: string;

  @IsOptional() @IsString() deviceId?: string;
  @IsOptional() @IsString() deviceName?: string;
  @IsOptional() @IsString() statusCode?: string;
  @IsOptional() @IsIn(['eq', 'neq', 'gt', 'lt']) operator?: string;
  @IsOptional() value?: unknown;

  @IsOptional() @IsString() timeValue?: string;

  @IsOptional() @IsIn(['sunrise', 'sunset']) sunEvent?: string;
  @IsOptional() @IsInt() sunOffsetMin?: number;

  @IsInt() order!: number;
  @IsOptional() @IsIn(['AND', 'OR']) nextOperator?: string;
}

export class ActionDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() ruleId?: string;

  @IsIn(['device_control', 'countdown', 'notification'])
  type!: string;

  @IsOptional() @IsString() deviceId?: string;
  @IsOptional() @IsString() deviceName?: string;
  @IsOptional() @IsString() statusCode?: string;
  @IsOptional() value?: unknown;
  @IsOptional() @IsInt() minutes?: number;

  @IsInt() order!: number;
}

export class CreateRuleDto {
  @IsString() name!: string;
  @IsBoolean() @IsOptional() enabled?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  conditions!: ConditionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionDto)
  actions!: ActionDto[];
}

export class UpdateRuleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  conditions?: ConditionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionDto)
  actions?: ActionDto[];
}

export class UpdateLocationDto {
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
}
