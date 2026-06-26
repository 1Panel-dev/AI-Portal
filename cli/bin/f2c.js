#!/usr/bin/env node
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'f2chub.js');

execFileSync(process.execPath, [script, ...process.argv.slice(2)], {
  env: { ...process.env, F2C_CLI_MODE: 'f2c' },
  stdio: 'inherit'
});
