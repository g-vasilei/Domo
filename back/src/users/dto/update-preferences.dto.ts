import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdatePreferencesDto {
  @ValidateIf((_o, value) => value !== undefined)
  @IsIn([
    'athens',
    'agrinio',
    'agios-nikolaos',
    'aigio',
    'alexandroupoli',
    'amfissa',
    'argos',
    'argostoli',
    'arta',
    'veria',
    'volos',
    'giannitsa',
    'grevena',
    'drama',
    'edessa',
    'elefsina',
    'ermoupoli',
    'zakynthos',
    'igoumenitsa',
    'heraklion',
    'thessaloniki',
    'thiva',
    'ioannina',
    'kavala',
    'kalamata',
    'karditsa',
    'karpenisi',
    'kastoria',
    'katerini',
    'kerkyra',
    'kilkis',
    'kozani',
    'komotini',
    'korinthos',
    'kos',
    'lamia',
    'larisa',
    'livadia',
    'lefkada',
    'mesolongi',
    'mytilini',
    'naousa',
    'naxos',
    'nafplio',
    'nafpaktos',
    'xanthi',
    'orestiada',
    'patra',
    'piraeus',
    'polygyros',
    'preveza',
    'ptolemaida',
    'pyrgos',
    'rethymno',
    'rhodes',
    'samos',
    'serres',
    'sitia',
    'sparti',
    'trikala',
    'tripoli',
    'florina',
    'chalkida',
    'chania',
    'chios',
  ])
  weatherCityId?: string;

  @ValidateIf((_o, value) => value !== undefined)
  @IsIn(['C', 'F'])
  tempUnit?: string;

  @ValidateIf((_o, value) => value !== undefined)
  @IsBoolean()
  notificationsEnabled?: boolean;
  @ValidateIf((_o, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsIn(['alarm', 'weather', 'temperature'], { each: true })
  dashboardCardOrder?: string[];

  @ValidateIf((_o, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(['overview', 'devices', 'stats', 'health'], { each: true })
  dashboardSectionOrder?: string[];
  @ValidateIf((_o, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(128, { each: true })
  dashboardTemperatureDeviceIds?: string[];
  @ValidateIf((_o, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsIn(
    [
      'alarm',
      'weather',
      'temperature',
      'total-devices',
      'online-devices',
      'offline-devices',
      'rooms',
    ],
    { each: true },
  )
  dashboardHiddenCards?: string[];

  @ValidateIf((_o, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(['overview', 'devices', 'stats', 'health'], { each: true })
  dashboardHiddenSections?: string[];
}
