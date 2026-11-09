import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
} from 'lucide-react';

export function weatherConditions(code: number, day: boolean) {
  if (code === 0) return { label: day ? 'Αίθριος καιρός' : 'Ξαστεριά', Icon: day ? Sun : Moon };
  if (code === 1 || code === 2) return { label: 'Λίγες νεφώσεις', Icon: day ? CloudSun : Cloud };
  if (code === 3) return { label: 'Συννεφιά', Icon: Cloud };
  if (code === 45 || code === 48) return { label: 'Ομίχλη', Icon: CloudFog };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: 'Ψιλόβροχο', Icon: CloudDrizzle };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: 'Βροχή', Icon: CloudRain };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: 'Χιονόπτωση', Icon: CloudSnow };
  if ([95, 96, 99].includes(code)) return { label: 'Καταιγίδα', Icon: CloudLightning };
  return { label: 'Καιρός', Icon: Cloud };
}
