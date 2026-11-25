/**
 * pitwall is read-only. Every command that reaches an adapter passes through this
 * list; anything not matched is refused. Mode 04 (clear codes) is deliberately absent.
 */
export type AllowedCommand = `AT${string}` | `01${string}` | `02${string}` | '03' | '07' | `09${string}` | '0A';

/** Adapter setup and query commands. Listed one by one: other AT commands can persist settings or monitor the bus. */
const AT_COMMANDS: ReadonlySet<string> = new Set([
  'ATZ', 'ATWS', 'ATI',
  'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0', 'ATAT1', 'ATAT2',
  'ATDP', 'ATDPN', 'ATRV',
]);

/** Read-only OBD services: live data, freeze frame, stored/pending/permanent codes, vehicle info. */
const OBD_REQUESTS: readonly RegExp[] = [
  /^01[0-9A-F]{2}$/,
  /^02[0-9A-F]{2}(?:[0-9A-F]{2})?$/,
  /^(?:03|07|0A)$/,
  /^09[0-9A-F]{2}$/,
];

export class ForbiddenCommandError extends Error {
  constructor(command: unknown) {
    super(`Command refused, pitwall only reads: ${JSON.stringify(command)}`);
    this.name = 'ForbiddenCommandError';
  }
}

export function isAllowedCommand(command: string): command is AllowedCommand {
  if (typeof command !== 'string') return false;
  return AT_COMMANDS.has(command) || OBD_REQUESTS.some((pattern) => pattern.test(command));
}

export function assertAllowed(command: string): AllowedCommand {
  if (!isAllowedCommand(command)) throw new ForbiddenCommandError(command);
  return command;
}
