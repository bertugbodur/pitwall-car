/** Reads Mode 09 PID 02 answers, both the single CAN message and the numbered lines of older buses. */
export function parseVin(messages: readonly number[][]): string | undefined {
  const text = messages
    .filter((m) => m[0] === 0x49 && m[1] === 0x02)
    .sort((x, y) => (x[2] ?? 0) - (y[2] ?? 0))
    .flatMap((m) => m.slice(3))
    .filter((byte) => byte > 0x20 && byte < 0x7f)
    .map((byte) => String.fromCharCode(byte))
    .join('');
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(text) ? text : undefined;
}

/** World manufacturer identifiers (first three VIN characters). A short list, extended as needed. */
const WMI: Record<string, string> = {
  NM0: 'Ford Otosan', NM4: 'Tofaş (Fiat)', NMT: 'Toyota Türkiye', NLH: 'Hyundai Assan', NLA: 'Honda Türkiye',
  VF1: 'Renault', VF3: 'Peugeot', VF7: 'Citroën', UU1: 'Dacia', VSS: 'SEAT', TMB: 'Škoda',
  WVW: 'Volkswagen', WV1: 'Volkswagen', WV2: 'Volkswagen', WAU: 'Audi', WBA: 'BMW', WBS: 'BMW M',
  WDB: 'Mercedes-Benz', WDD: 'Mercedes-Benz', W1K: 'Mercedes-Benz', W1N: 'Mercedes-Benz',
  WP0: 'Porsche', W0L: 'Opel', W0V: 'Opel', WF0: 'Ford', ZFA: 'Fiat', ZAR: 'Alfa Romeo',
  SAL: 'Land Rover', SAJ: 'Jaguar', SJN: 'Nissan', YV1: 'Volvo', TRU: 'Audi', TMA: 'Hyundai', U5Y: 'Kia',
  JHM: 'Honda', JMZ: 'Mazda', JN1: 'Nissan', JTD: 'Toyota', JTE: 'Toyota', JF1: 'Subaru', JSA: 'Suzuki',
  KMH: 'Hyundai', KNA: 'Kia', LRW: 'Tesla', XP7: 'Tesla', '5YJ': 'Tesla', '7SA': 'Tesla',
  '1FA': 'Ford', '1G1': 'Chevrolet', '1HG': 'Honda',
};

export const decodeWmi = (vin: string): string | undefined => WMI[vin.slice(0, 3).toUpperCase()];

export const maskVin = (vin: string): string => `${vin.slice(0, 3)}${'•'.repeat(10)}${vin.slice(-4)}`;
