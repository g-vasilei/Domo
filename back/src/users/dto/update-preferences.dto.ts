import { IsBoolean, IsIn, ValidateIf } from 'class-validator';

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
}
