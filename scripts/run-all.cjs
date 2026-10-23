const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

console.log('🏛️ Starting CivicPilot Full Ecosystem: Next.js + n8n Automation...\n');

// 1. Start n8n
const n8nProc = spawn(process.execPath, [path.join(rootDir, 'scripts', 'run-n8n.cjs')], {
  cwd: rootDir,
  stdio: 'inherit',
});

// 2. Start Next.js dev server
const nextBin = path.join(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next');
const nextProc = spawn(process.execPath, [nextBin, 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
});

const cleanup = () => {
  console.log('\nShutting down CivicPilot services...');
  try { n8nProc.kill('SIGTERM'); } catch {}
  try { nextProc.kill('SIGTERM'); } catch {}
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

n8nProc.on('exit', (code) => {
  console.log(`n8n exited with code ${code}`);
});

nextProc.on('exit', (code) => {
  console.log(`Next.js exited with code ${code}`);
});
