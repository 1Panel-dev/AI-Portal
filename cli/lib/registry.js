import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadBuiltinRegistry() {
  const registryPath = path.join(__dirname, 'registry.yaml');
  const content = fs.readFileSync(registryPath, 'utf-8');
  return yaml.parse(content);
}

export function getPlatformsByPriority(registry) {
  return Object.entries(registry.platforms)
    .sort((a, b) => a[1].priority - b[1].priority);
}
