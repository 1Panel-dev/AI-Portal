import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadBuiltinRegistry, getPlatformsByPriority } from './registry.js';
import { loadUserConfig, getCurrentPlatform, ensureConfig } from './config-yaml.js';

function getOS() {
  return process.platform === 'win32' ? 'windows' : 'mac';
}

function probePlatform(platform, osType) {
  const probePath = platform.probe?.[osType];
  if (!probePath) return false;
  return fs.existsSync(expandPath(probePath));
}

function getInstallPath(platform, osType) {
  return expandPath(platform.install_to[osType]);
}

/**
 * Merges user-defined platforms from config.yaml into the builtin registry.
 * User platforms with the same name override builtin probe/install paths;
 * new names are added and sorted by their declared priority.
 */
function mergeRegistries(builtin, userConfig) {
  const merged = { platforms: { ...builtin.platforms } };

  if (!userConfig?.platforms) return merged;

  for (const [name, cfg] of Object.entries(userConfig.platforms)) {
    if (merged.platforms[name]) {
      // Override existing platform fields
      merged.platforms[name] = { ...merged.platforms[name], ...cfg };
    } else {
      // New user-defined platform — fill missing required fields
      merged.platforms[name] = {
        probe: cfg.probe || null,
        install_to: cfg.install_to || { mac: `~/.${name}/skills`, windows: `~/.${name}/skills` },
        priority: cfg.priority ?? 50,
        ...cfg,
      };
    }
  }

  return merged;
}

/**
 * Returns the merged registry (builtin + user platforms).
 */
function loadMergedRegistry() {
  ensureConfig();
  const builtin = loadBuiltinRegistry();
  const userConfig = loadUserConfig();
  return mergeRegistries(builtin, userConfig);
}

/**
 * Returns a sorted map of all available platform names.
 */
export function getAvailablePlatforms() {
  const registry = loadMergedRegistry();
  return getPlatformsByPriority(registry);
}

/**
 * Detect which platform to use.
 * Priority: config.current_platform > probe-based auto-detect > universal fallback
 */
export function detectPlatform() {
  const registry = loadMergedRegistry();
  const osType = getOS();

  // 1. If current_platform is set in config, use it directly
  const currentPlatform = getCurrentPlatform();
  if (currentPlatform && registry.platforms[currentPlatform]) {
    const platform = registry.platforms[currentPlatform];
    const installPath = platform.workspace_install_to
      ? path.resolve(platform.workspace_install_to)
      : getInstallPath(platform, osType);

    // User config override: only apply in global mode
    const userConfig = loadUserConfig();
    const installMode = userConfig.platforms?.[currentPlatform]?.install_mode || 'workspace';
    if (installMode === 'global' && userConfig.platforms?.[currentPlatform]?.install_to) {
      const userInstallTo = userConfig.platforms[currentPlatform].install_to;
      const override = typeof userInstallTo === 'string' ? userInstallTo : userInstallTo[osType];
      if (override) {
        return { name: currentPlatform, path: expandPath(override) };
      }
    }

    return { name: currentPlatform, path: installPath };
  }

  // 2. Probe-based auto-detect
  const platforms = getPlatformsByPriority(registry);

  for (const [name, platform] of platforms) {
    if (probePlatform(platform, osType)) {
      const installPath = platform.workspace_install_to
        ? path.resolve(platform.workspace_install_to)
        : getInstallPath(platform, osType);
      return { name, path: installPath };
    }
  }

  // 3. Universal fallback
  const universal = registry.platforms.universal;
  return { name: 'universal', path: getInstallPath(universal, osType) };
}

export function getPlatformPath(platformName) {
  const registry = loadMergedRegistry();
  const platform = registry.platforms[platformName];
  if (!platform) throw new Error(`Unknown platform: ${platformName}`);
  const osType = getOS();

  const userConfig = loadUserConfig();
  const installMode = userConfig.platforms?.[platformName]?.install_mode || 'workspace';

  if (installMode === 'workspace' && platform.workspace_install_to) {
    return path.resolve(platform.workspace_install_to);
  }
  return getInstallPath(platform, osType);
}

export function expandPath(p) {
  return p.replace(/^~/, os.homedir());
}
