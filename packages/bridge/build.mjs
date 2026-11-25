import { rm } from 'node:fs/promises';
import { build } from 'esbuild';

await rm(new URL('./dist', import.meta.url), { recursive: true, force: true });
await build({
  entryPoints: ['src/cli.ts'],
  outdir: 'dist',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  // Published dependencies stay external; the private workspace packages are bundled in.
  external: ['serialport', 'ws', 'commander', 'zod', '@modelcontextprotocol/server', '@modelcontextprotocol/server/stdio'],
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'warning',
});
