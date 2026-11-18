interface PowerDevice {
  category?: string;
  status?: { code: string; value: unknown }[];
}

const PRIMARY_CODES = ['switch', 'switch_1', 'switch_led', 'switch_on'];

export function powerSwitchCodes(device: PowerDevice): string[] {
  return (device.status ?? [])
    .filter(
      ({ code, value }) =>
        typeof value === 'boolean' &&
        (device.category === 'kt'
          ? code === 'switch'
          : PRIMARY_CODES.includes(code) || /^switch_\d+$/.test(code)),
    )
    .map(({ code }) => code)
    .sort((a, b) => {
      const priority = (code: string) => {
        const index = PRIMARY_CODES.indexOf(code);
        return index === -1 ? PRIMARY_CODES.length : index;
      };
      return priority(a) - priority(b) || a.localeCompare(b, 'en', { numeric: true });
    });
}
