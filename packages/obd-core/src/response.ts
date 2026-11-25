export type ElmError =
  | 'NO_DATA'
  | 'UNKNOWN_COMMAND'
  | 'STOPPED'
  | 'CAN_ERROR'
  | 'BUS_ERROR'
  | 'DATA_ERROR'
  | 'UNABLE_TO_CONNECT';

export type ElmResponse = { ok: true; lines: string[] } | { ok: false; error: ElmError };

const ERRORS: readonly (readonly [RegExp, ElmError])[] = [
  [/^NO ?DATA/, 'NO_DATA'],
  [/^\?/, 'UNKNOWN_COMMAND'],
  [/^STOPPED/, 'STOPPED'],
  [/CAN ERROR/, 'CAN_ERROR'],
  [/UNABLE ?TO ?CONNECT/, 'UNABLE_TO_CONNECT'],
  [/^BUS (?:INIT:.*ERROR|BUSY|ERROR)|^FB ERROR|^LV RESET|^ERR\d\d/, 'BUS_ERROR'],
  [/DATA ERROR|RX ERROR|BUFFER FULL/, 'DATA_ERROR'],
];

const NOISE = /^(?:SEARCHING\.*|BUS INIT:.*OK)$/;

/** Cleans one raw adapter answer (everything up to the `>` prompt). */
export function parseResponse(raw: string, command: string): ElmResponse {
  const lines = raw
    .replace(/[\0>]/g, '')
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && line !== command && !NOISE.test(line));

  for (const line of lines) {
    const match = ERRORS.find(([pattern]) => pattern.test(line));
    if (match) return { ok: false, error: match[1] };
  }
  return { ok: true, lines };
}

const toBytes = (hex: string): number[] => (hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16));

/**
 * Turns hex lines into messages. Handles one line per ECU and the ELM327 CAN multi-frame
 * form: a three digit length line followed by `0:`, `1:` ... segments.
 */
export function extractMessages(lines: readonly string[]): number[][] {
  const messages: number[][] = [];
  let pending: { length: number; hex: string } | undefined;
  const flush = () => {
    if (pending) messages.push(toBytes(pending.hex).slice(0, pending.length));
    pending = undefined;
  };

  for (const line of lines) {
    const compact = line.replace(/\s/g, '').toUpperCase();
    if (/^[0-9A-F]{3}$/.test(compact)) {
      flush();
      pending = { length: parseInt(compact, 16), hex: '' };
      continue;
    }
    const segment = /^[0-9A-F]:([0-9A-F]*)$/.exec(compact);
    if (segment) {
      if (pending) pending.hex += segment[1];
      continue;
    }
    flush();
    if (/^(?:[0-9A-F]{2})+$/.test(compact)) messages.push(toBytes(compact));
  }
  flush();
  return messages;
}
