const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const envFile = path.join(rootDir, '.env.local');

const settings = {};
if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) {
      settings[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

const env = {
  ...process.env,
  N8N_USER_FOLDER: path.join(rootDir, '.n8n-local'),
  N8N_HOST: 'localhost',
  N8N_LISTEN_ADDRESS: '127.0.0.1',
  N8N_PORT: '5678',
  N8N_PROTOCOL: 'http',
  N8N_SECURE_COOKIE: 'false',
  N8N_DIAGNOSTICS_ENABLED: 'false',
  N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
  N8N_BLOCK_ENV_ACCESS_IN_NODE: 'false',
  N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'true',
  WEBHOOK_URL: 'http://localhost:5678/',
  N8N_WEBHOOK_SECRET: settings.N8N_WEBHOOK_SECRET || '',
  CIVICPILOT_APP_URL: 'http://localhost:3000',
  GEMINI_API_KEY: settings.GEMINI_API_KEY || '',
  WHATSAPP_PHONE_NUMBER_ID: settings.WHATSAPP_PHONE_NUMBER_ID || '',
  REVIEWER_SECRET_KEY: settings.REVIEWER_SECRET_KEY || '',
};

const n8nBin = path.join(rootDir, '.n8n-runtime', 'node_modules', 'n8n', 'bin', 'n8n');
console.log('Starting n8n from:', n8nBin);

const logStream = fs.createWriteStream(path.join(rootDir, 'scripts', 'n8n-output.log'), { flags: 'a' });

const proc = spawn(process.execPath, [n8nBin, 'start'], {
  cwd: rootDir,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

proc.stdout.on('data', (d) => {
  process.stdout.write(d);
  logStream.write(d);
});
proc.stderr.on('data', (d) => {
  process.stderr.write(d);
  logStream.write(d);
});

proc.on('error', (err) => {
  console.error('Failed to spawn n8n:', err);
  logStream.write(`Failed to spawn n8n: ${err}\n`);
});

proc.on('exit', (code, signal) => {
  console.log(`n8n process exited with code ${code}, signal ${signal}`);
  logStream.write(`n8n process exited with code ${code}, signal ${signal}\n`);
  process.exit(code || 0);
});
