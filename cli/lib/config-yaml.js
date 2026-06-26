import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'yaml';

const CONFIG_DIR = path.join(os.homedir(), '.f2chub');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yaml');

export function loadUserConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
  return yaml.parse(content) || {};
}

export function saveUserConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const content = yaml.stringify(config);
  fs.writeFileSync(CONFIG_FILE, content, 'utf-8');
}

export function getCurrentPlatform() {
  const config = loadUserConfig();
  return config.current_platform || null;
}

export function setCurrentPlatform(name) {
  const config = loadUserConfig();
  config.current_platform = name;
  saveUserConfig(config);
}

export function setConfig(key, value) {
  const config = loadUserConfig();
  const [platform, field] = key.split('.');
  if (!config.platforms) config.platforms = {};
  if (!config.platforms[platform]) config.platforms[platform] = {};
  config.platforms[platform][field === 'path' ? 'install_to' : field] = value;
  saveUserConfig(config);
}

export function resetConfig(platform) {
  const config = loadUserConfig();
  if (config.platforms?.[platform]) {
    delete config.platforms[platform];
    saveUserConfig(config);
  }
}

export function setInstallMode(platformName, mode) {
  if (!['workspace', 'global'].includes(mode)) {
    throw new Error(`Invalid install mode: "${mode}". Use "workspace" or "global".`);
  }
  const config = loadUserConfig();
  if (!config.platforms) config.platforms = {};
  if (!config.platforms[platformName]) config.platforms[platformName] = {};
  config.platforms[platformName].install_mode = mode;
  saveUserConfig(config);
}

/**
 * Ensures ~/.f2chub/config.yaml exists.
 * On first creation, writes a full template with all builtin platforms
 * so the user can see and edit them directly.
 */
export function ensureConfig() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (fs.existsSync(CONFIG_FILE)) return;

  // First-time creation: write a full template with builtin platforms
  const defaultContent = `# F2CHub CLI Configuration
# Config file: ~/.f2chub/config.yaml

# Current active platform (set on first install, change with: f2chub config switch <name>)
current_platform:

# ─── Platform Configuration ───────────────────────────────────────────
# Each platform defines WHERE skills are installed.
#
# install_mode:
#   workspace → install to ./skills (current working directory)
#   global    → install to the fixed path below
#
# Change mode with: f2chub config mode <platform> <workspace|global>
# ──────────────────────────────────────────────────────────────────────

platforms:
  # OpenClaw — agent workspace mode
  # Skills install to: ./skills (in the current directory)
  openclaw:
    install_mode: workspace

  # WorkBuddy — global install mode
  # Skills install to: ~/.workbuddy/skills
  workbuddy:
    install_mode: global
    install_to:
      mac: ~/.workbuddy/skills
      windows: ~/.workbuddy/skills
`;

  fs.writeFileSync(CONFIG_FILE, defaultContent, 'utf-8');
}

export function addPlatform(name, options = {}) {
  const config = loadUserConfig();
  if (!config.platforms) config.platforms = {};

  if (config.platforms[name]) {
    throw new Error(`Platform "${name}" already exists. Use "f2chub config set ${name}.path <value>" to modify its install path.`);
  }

  const installMac = options.installMac || `~/.${name}/skills`;
  const installWindows = options.installWindows || `~/.${name}/skills`;
  const priority = options.priority ?? 50;

  config.platforms[name] = {
    install_mode: 'workspace',
    install_to: { mac: installMac, windows: installWindows },
    priority,
  };

  saveUserConfig(config);
}

export function removePlatform(name) {
  const config = loadUserConfig();
  if (!config.platforms?.[name]) {
    throw new Error(`Platform "${name}" not found in your config.`);
  }
  delete config.platforms[name];
  // If this was the current platform, clear it
  if (config.current_platform === name) {
    config.current_platform = null;
  }
  saveUserConfig(config);
}
