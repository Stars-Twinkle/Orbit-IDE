import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electronPath from 'electron';

const server = await createServer({ configFile: 'vite.config.mjs' });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`\n  Orbit IDE renderer: ${url}\n`);

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VITE_DEV_SERVER_URL: url, ORBIT_DEV: '1' },
});

const shutdown = async () => {
  await server.close();
  if (!child.killed) child.kill();
  process.exit(0);
};
child.on('exit', shutdown);
process.on('SIGINT', shutdown);
