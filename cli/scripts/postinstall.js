#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.f2chub');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yaml');
const EXAMPLE_FILE = path.join(CONFIG_DIR, 'config-example.yaml');

// Resolve package directory (works on Windows too)
const pkgDir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const srcExample = path.join(pkgDir, 'lib', 'config-example.yaml');

if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Copy config-example.yaml as both config.yaml and config-example.yaml
// The config.yaml is the user's live config; config-example.yaml is a reference
if (!fs.existsSync(CONFIG_FILE) && fs.existsSync(srcExample)) {
  fs.copyFileSync(srcExample, CONFIG_FILE);
  console.log(`✓ Config created: ${CONFIG_FILE}`);
  console.log('  Edit this file to customize platform install paths.');
  console.log('  On first install, you will be asked to select a platform.');
}

if (fs.existsSync(srcExample) && !fs.existsSync(EXAMPLE_FILE)) {
  fs.copyFileSync(srcExample, EXAMPLE_FILE);
}
