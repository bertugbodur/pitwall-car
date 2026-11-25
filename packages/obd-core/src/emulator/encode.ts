/**
 * Car side of the SAE J1979 formulas. Written separately from the decoders in `pids.ts`
 * so that a mistake on one side shows up as a test failure.
 */

const byte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));
const word = (value: number) => {
  const n = Math.min(65535, Math.max(0, Math.round(value)));
  return [n >> 8, n & 0xff];
};
const percent = (v: number) => [byte(v * 2.55)];
const temperature = (v: number) => [byte(v + 40)];
const trim = (v: number) => [byte(v * 1.28 + 128)];
const oxygen = (v: number) => [byte(v * 200), 0x80];
const plain = (v: number) => [byte(v)];

export const ENCODERS: Record<string, (value: number) => number[]> = {
  '04': percent,
  '05': temperature,
  '06': trim,
  '07': trim,
  '08': trim,
  '09': trim,
  '0A': (v) => [byte(v / 3)],
  '0B': plain,
  '0C': (v) => word(v * 4),
  '0D': plain,
  '0E': (v) => [byte((v + 64) * 2)],
  '0F': temperature,
  '10': (v) => word(v * 100),
  '11': percent,
  '14': oxygen,
  '15': oxygen,
  '16': oxygen,
  '17': oxygen,
  '18': oxygen,
  '19': oxygen,
  '1A': oxygen,
  '1B': oxygen,
  '1F': word,
  '21': word,
  '2F': percent,
  '31': word,
  '33': plain,
  '42': (v) => word(v * 1000),
  '43': (v) => word(v * 2.55),
  '45': percent,
  '46': temperature,
  '49': percent,
  '4C': percent,
  '5C': temperature,
  '5E': (v) => word(v * 20),
};

export function encodeDtc(code: string): [number, number] {
  const system = 'PCBU'.indexOf(code[0]!);
  const n = parseInt(code.slice(1), 16);
  return [(system << 6) | (n >> 8), n & 0xff];
}
