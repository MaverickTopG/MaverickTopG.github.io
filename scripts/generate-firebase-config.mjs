import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const envPath = path.join(repoRoot, '.env');
const outputPath = path.join(repoRoot, 'public', 'firebase-config.json');

if (!fs.existsSync(envPath)) {
  console.error('Missing .env file at', envPath);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};

envContent.split(/\r?\n/).forEach((line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIndex = trimmed.indexOf('=');
  if (eqIndex === -1) return;
  const key = trimmed.slice(0, eqIndex).trim();
  const value = trimmed.slice(eqIndex + 1).trim();
  env[key] = value;
});

const config = {
  apiKey: env.PUBLIC_FIREBASE_API_KEY || '',
  authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: env.PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.PUBLIC_FIREBASE_APP_ID || '',
};

const required = ['apiKey', 'authDomain', 'projectId'];
const missing = required.filter((key) => !config[key]);
if (missing.length) {
  console.error('Missing required Firebase env vars:', missing.join(', '));
  process.exit(1);
}

fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
console.log('Wrote', outputPath);
