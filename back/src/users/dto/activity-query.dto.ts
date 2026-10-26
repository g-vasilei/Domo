import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

export class ActivityQueryDto {
  @IsOptional()
  @IsIn(['device', 'alarm', 'automation'])
  context?: string;

  @IsOptional()
  @IsIn(['info', 'warn', 'error'])
  level?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  since?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page: number = 1;
}
