/** Adds the pitwall MCP server to an AI client's configuration file. */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const CLIENTS = ['claude-desktop', 'claude-code', 'cursor', 'vscode'] as const;
export type ClientName = (typeof CLIENTS)[number];

export interface ServerEntry {
  command: string;
  args: string[];
}

export interface ConnectOptions {
  /** Overrides the default location of the configuration file. */
  path?: string;
  home?: string;
  cwd?: string;
  platform?: NodeJS.Platform;
  dryRun?: boolean;
}

function defaultPath(client: ClientName, { home = homedir(), cwd = process.cwd(), platform = process.platform }: ConnectOptions): string {
  switch (client) {
    case 'claude-desktop': {
      const file = 'claude_desktop_config.json';
      if (platform === 'win32') return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Claude', file);
      if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'Claude', file);
      return join(home, '.config', 'Claude', file);
    }
    case 'claude-code':
      return join(cwd, '.mcp.json');
    case 'cursor':
      return join(home, '.cursor', 'mcp.json');
    case 'vscode':
      return join(cwd, '.vscode', 'mcp.json');
  }
}

export async function configureClient(
  client: ClientName,
  server: ServerEntry,
  options: ConnectOptions = {},
): Promise<{ path: string; content: string }> {
  const path = options.path ?? defaultPath(client, options);
  const existing = await readFile(path, 'utf8').catch(() => undefined);

  let config: Record<string, any> = {};
  if (existing?.trim()) {
    try {
      config = JSON.parse(existing);
    } catch {
      throw new Error(`${path} is not valid JSON; fix or add the server by hand. Nothing was changed.`);
    }
  }
  // VS Code names the list "servers" and wants the transport type.
  const key = client === 'vscode' ? 'servers' : 'mcpServers';
  const entry = client === 'vscode' ? { type: 'stdio', ...server } : server;
  config[key] = { ...config[key], 'pitwall-car': entry };
  const content = `${JSON.stringify(config, null, 2)}\n`;

  if (!options.dryRun) {
    await mkdir(dirname(path), { recursive: true });
    if (existing !== undefined) await copyFile(path, `${path}.bak`);
    await writeFile(path, content);
  }
  return { path, content };
}
