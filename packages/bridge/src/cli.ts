import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { Command, InvalidArgumentError } from 'commander';
import { fileURLToPath } from 'node:url';
import { openAdapter, parseAdapter, WIFI_DEFAULT } from './adapter.ts';
import { CLIENTS, configureClient, type ClientName } from './connect.ts';
import { createMcpServer } from './mcp.ts';
import { DEFAULT_PORT, startBridge } from './server.ts';
import { defaultDataDir } from './trips.ts';

interface AdapterFlags {
  serial?: string;
  tcp?: string | boolean;
  simulator?: string | boolean;
}

/** The adapter chosen by flags, else the PITWALL_ADAPTER variable. */
function adapterText(flags: AdapterFlags): string | undefined {
  if (flags.serial) return `serial:${flags.serial}`;
  if (flags.tcp) return `tcp:${flags.tcp === true ? WIFI_DEFAULT : flags.tcp}`;
  if (flags.simulator) return `sim:${flags.simulator === true ? 'city' : flags.simulator}`;
  return process.env.PITWALL_ADAPTER || undefined;
}

const withAdapter = (command: Command) =>
  command
    .option('--serial <port[@baud]>', 'USB or paired Bluetooth serial port, e.g. COM3 or /dev/rfcomm0')
    .option('--tcp [host:port]', `Wi-Fi adapter (default ${WIFI_DEFAULT})`)
    .option('--simulator [scenario]', 'simulated car (default city)');

const program = new Command()
  .name('pitwall-obd')
  .description('Read-only local bridge and MCP server for ELM327 OBD-II adapters.')
  .version('0.1.0');

withAdapter(program.command('bridge').description('let the web app reach a serial or Wi-Fi adapter'))
  .option('--port <number>', 'websocket port on 127.0.0.1', (v) => {
    const port = Number(v);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new InvalidArgumentError('not a port');
    return port;
  }, DEFAULT_PORT)
  .option('--allow-origin <url>', 'also accept a self-hosted copy of the web app served from this origin')
  .action(async (flags: AdapterFlags & { port: number; allowOrigin?: string }) => {
    const text = adapterText(flags) ?? `tcp:${WIFI_DEFAULT}`;
    const bridge = await startBridge({ channel: openAdapter(parseAdapter(text)), port: flags.port, allowOrigin: flags.allowOrigin });
    console.log(`pitwall bridge (read-only) on ws://127.0.0.1:${bridge.port}`);
    console.log(`Adapter: ${text}`);
    console.log(`Pairing code: ${bridge.code}   (enter it in the web app under Settings)`);
    process.on('SIGINT', () => void bridge.close().then(() => process.exit(0)));
  });

withAdapter(program.command('mcp').description('run the MCP server on stdio'))
  .option('--show-vin', 'give the AI client the full VIN instead of a masked one')
  .action(async (flags: AdapterFlags & { showVin?: boolean }) => {
    const text = adapterText(flags);
    const handle = createMcpServer({
      adapter: text ? openAdapter(parseAdapter(text)) : undefined,
      dataDir: defaultDataDir(),
      showVin: flags.showVin,
    });
    // stdout carries the protocol; anything for people goes to stderr.
    console.error(`pitwall MCP server (read-only), adapter: ${text ?? 'none'}`);
    await handle.server.connect(new StdioServerTransport());
  });

program
  .command('ports')
  .description('list serial ports')
  .action(async () => {
    const { SerialPort } = await import('serialport');
    const ports = await SerialPort.list();
    for (const port of ports) console.log(`${port.path}\t${port.manufacturer ?? ''}`);
    if (ports.length === 0) console.log('No serial ports found.');
  });

withAdapter(program.command('connect').description('add the MCP server to an AI client'))
  .argument('<client>', CLIENTS.join(' | '))
  .option('--dry-run', 'print the result without writing it')
  .action(async (client: string, flags: AdapterFlags & { dryRun?: boolean }) => {
    if (!CLIENTS.includes(client as ClientName)) program.error(`Unknown client "${client}". Use: ${CLIENTS.join(', ')}`);
    const text = adapterText(flags);
    const [kind, ...rest] = text?.split(':') ?? [];
    const flag = kind === 'sim' ? '--simulator' : kind ? `--${kind}` : undefined;
    const adapterArgs = flag ? [flag, rest.join(':')] : [];

    // From a source checkout the package is not on npm yet, so point at this file.
    const self = fileURLToPath(import.meta.url);
    const installed = /[\\/]node_modules[\\/]/.test(self);
    const server = installed
      ? { command: 'npx', args: ['-y', 'pitwall-obd', 'mcp', ...adapterArgs] }
      : { command: process.execPath, args: [self, 'mcp', ...adapterArgs] };

    const result = await configureClient(client as ClientName, server, { dryRun: flags.dryRun });
    if (flags.dryRun) console.log(result.content);
    console.log(`${flags.dryRun ? 'Would write' : 'Wrote'} ${result.path}`);
    if (!flags.dryRun) console.log('Restart the client to load the server.');
  });

program.parseAsync().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
