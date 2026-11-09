import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdatePushSettingsDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object, value) => value !== '')
  @IsString()
  @MaxLength(254)
  @IsEmail()
  contactEmail!: string;
}
