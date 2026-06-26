import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { execSync } from 'child_process';
import api from '../lib/api.js';
import storage from '../lib/storage.js';
import { getPlatformPath, getAvailablePlatforms, expandPath } from '../lib/platform.js';
import { loadUserConfig, getCurrentPlatform, setCurrentPlatform, ensureConfig } from '../lib/config-yaml.js';
import extractZip from 'extract-zip';

/**
 * Interactive prompt: ask user to select a platform.
 * Returns the selected platform name.
 */
function promptPlatformChoice() {
  const platforms = [...getAvailablePlatforms()].filter(([name]) => name !== 'universal');

  console.log('');
  console.log(chalk.bold('Which platform are you using?'));
  console.log(chalk.gray('This sets where skills will be installed. You can change it later with: f2chub config switch <name>'));
  console.log('');

  platforms.forEach(([name, platform], i) => {
    const installPath = platform.workspace_install_to || `~/.${name}/skills`;
    const num = chalk.cyan(`[${i + 1}]`);
    console.log(`  ${num} ${chalk.bold(name)} ${chalk.gray('→ ' + installPath)}`);
  });

  console.log('');

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const defaultChoice = '1';
    rl.question(`Select platform ${chalk.gray(`(1-${platforms.length}, default: ${defaultChoice})`)}: `, (answer) => {
      rl.close();

      const idx = parseInt(answer.trim() || defaultChoice, 10) - 1;
      if (idx >= 0 && idx < platforms.length) {
        const [selectedName] = platforms[idx];
        resolve(selectedName);
      } else {
        console.log(chalk.red(`Invalid choice. Defaulting to ${platforms[0][0]}.`));
        resolve(platforms[0][0]);
      }
    });
  });
}

/**
 * Ensures current_platform is set. If not, prompts the user interactively
 * and persists the choice to config.yaml.
 * Returns the resolved platform name.
 */
async function ensureCurrentPlatform(optionsPlatform) {
  // 1. CLI --platform flag takes highest priority
  if (optionsPlatform) {
    return optionsPlatform;
  }

  // 2. Check config current_platform
  let currentPlatform = getCurrentPlatform();

  if (currentPlatform) {
    return currentPlatform;
  }

  // 3. First run — prompt user to choose
  console.log('');
  console.log(chalk.yellow('No platform configured yet.'));
  const chosen = await promptPlatformChoice();
  setCurrentPlatform(chosen);

  const osType = process.platform === 'win32' ? 'windows' : 'mac';
  const userConfig = loadUserConfig();
  const installMode = userConfig.platforms?.[chosen]?.install_mode || 'workspace';
  let installPath;
  if (installMode === 'global' && userConfig.platforms?.[chosen]?.install_to) {
    const override = userConfig.platforms[chosen].install_to;
    installPath = expandPath(typeof override === 'string' ? override : override[osType]);
  } else {
    const platforms = [...getAvailablePlatforms()];
    const platformEntry = platforms.find(([n]) => n === chosen);
    installPath = platformEntry?.[1]?.workspace_install_to || `~/.${chosen}/skills`;
  }

  console.log('');
  console.log(chalk.green(`Platform set to: ${chalk.bold(chosen)}`));
  console.log(chalk.gray(`Skills will be installed to: ${installPath}`));
  console.log(chalk.gray(`To change: f2chub config switch <name>`));
  console.log(chalk.gray(`To customize path: edit ~/.f2chub/config.yaml`));
  console.log('');

  return chosen;
}

export default async function install(skillName, options = {}) {
  const spinner = ora();

  try {
    ensureConfig();

    // 1. Determine platform (prompt if first run)
    const platformName = await ensureCurrentPlatform(options.platform);

    // 2. Determine install directory
    let installDir;
    try {
      installDir = getPlatformPath(platformName);
    } catch (err) {
      const available = [...getAvailablePlatforms()].map(([n]) => n).join(', ');
      console.error(chalk.red(`Unknown platform: ${platformName}`));
      console.log(chalk.gray(`Available platforms: ${available}`));
      console.log(chalk.gray('Use: f2chub config switch <name>'));
      process.exit(1);
    }

    // User config override: only apply in global mode
    const userConfig = loadUserConfig();
    const installMode = userConfig.platforms?.[platformName]?.install_mode || 'workspace';
    if (installMode === 'global' && userConfig.platforms?.[platformName]?.install_to) {
      const osType = process.platform === 'win32' ? 'windows' : 'mac';
      const override = userConfig.platforms[platformName].install_to;
      // install_to can be a string (simple) or object (mac/windows)
      installDir = expandPath(typeof override === 'string' ? override : override[osType]);
    }

    // 3. Check if already installed
    if (storage.isInstalled(skillName, installDir) && !options.force) {
      const version = storage.getInstalledVersion(skillName, installDir);
      console.log(chalk.yellow(`Skill "${skillName}" is already installed (v${version}).`));
      console.log(chalk.gray('Use --force to reinstall.'));
      return;
    }

    // Ensure target directory exists
    if (!fs.existsSync(installDir)) {
      fs.mkdirSync(installDir, { recursive: true });
    }

    const skillDir = path.join(installDir, skillName);

    // --local mode: install from a local zip or directory
    if (options.local) {
      await installLocal(skillName, skillDir, installDir, platformName, spinner);
      return;
    }

    // 4. Try fetching manifest
    let manifest = null;
    try {
      spinner.start('Fetching skill info...');
      manifest = await api.getSkillManifest(skillName);
      spinner.succeed(`Got: ${manifest.name} v${manifest.version}`);
    } catch {
      spinner.info('No manifest found, will detect dependencies after extraction');
    }

    // 5. Download skill package
    spinner.start('Downloading skill package...');
    const data = await api.downloadSkill(skillName);
    const zipPath = await storage.saveSkill(skillName, data, installDir);
    spinner.succeed('Download complete');

    // 6. Extract to target path
    spinner.start('Extracting...');
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }
    await extractZip(zipPath, { dir: skillDir });
    fs.rmSync(zipPath);

    // Auto-flatten nested directories
    flattenIfNeeded(skillDir);

    spinner.succeed('Extracted');

    // 7. Auto-detect and install dependencies
    await installDeps(skillDir, spinner);

    // 8. Record installation
    const recordData = manifest || { name: skillName, version: 'unknown' };
    storage.recordInstall(skillName, recordData, installDir);
    await api.recordInstall(skillName);

    printSuccess(skillName, skillDir, installDir, platformName);
  } catch (err) {
    spinner.fail(chalk.red(`Install failed: ${err.message}`));
    process.exit(1);
  }
}

/**
 * Install from a local path (zip file or directory).
 * skillName is interpreted as a file path when --local is used.
 */
async function installLocal(localPath, skillDir, installDir, platformName, spinner) {
  const resolvedPath = path.resolve(localPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Path not found: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);

  if (stat.isFile() && resolvedPath.endsWith('.zip')) {
    // Install from zip
    spinner.start('Extracting from local zip...');
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }
    await extractZip(resolvedPath, { dir: skillDir });
    flattenIfNeeded(skillDir);
    spinner.succeed('Extracted');
  } else if (stat.isDirectory()) {
    // Install from directory — copy files
    spinner.start('Copying from local directory...');
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }
    copyDirRecursive(resolvedPath, skillDir);
    spinner.succeed('Copied');
  } else {
    throw new Error(`--local requires a .zip file or a directory, got: ${resolvedPath}`);
  }

  // Try to read manifest from the skill directory
  let manifest = null;
  const manifestPath = path.join(skillDir, 'SKILL.md');
  if (fs.existsSync(manifestPath)) {
    manifest = { name: path.basename(skillDir), version: 'local' };
  }

  // Auto-detect and install dependencies
  await installDeps(skillDir, spinner);

  // Record installation
  const recordData = manifest || { name: path.basename(skillDir), version: 'local' };
  storage.recordInstall(path.basename(skillDir), recordData, installDir);

  printSuccess(path.basename(skillDir), skillDir, installDir, platformName);
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function installDeps(skillDir, spinner) {
  spinner.start('Checking dependencies...');
  const deps = detectDependencies(skillDir);
  if (deps.length > 0) {
    spinner.succeed(`Found dependencies: ${deps.join(', ')}`);
    for (const dep of deps) {
      spinner.start(`Installing ${dep}...`);
      installDep(skillDir, dep);
      spinner.succeed(`${dep} installed`);
    }
  } else {
    spinner.succeed('No dependencies to install');
  }
}

function printSuccess(skillName, skillDir, installDir, platformName) {
  const isWorkspace = installDir === path.resolve('./skills');
  const locationHint = isWorkspace ? ' (workspace)' : ' (global)';

  console.log('');
  console.log(chalk.green(`Successfully installed ${skillName}`));
  console.log(chalk.gray(`Platform:  ${platformName}`));
  console.log(chalk.gray(`Location:  ${skillDir}${locationHint}`));
}

function flattenIfNeeded(skillDir) {
  let maxDepth = 5;
  while (maxDepth-- > 0) {
    const entries = fs.readdirSync(skillDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory());
    const files = entries.filter(e => e.isFile());

    if (dirs.length === 1 && files.length === 0) {
      const nestedDir = path.join(skillDir, dirs[0].name);
      const nestedEntries = fs.readdirSync(nestedDir);

      for (const entry of nestedEntries) {
        const src = path.join(nestedDir, entry);
        const dest = path.join(skillDir, entry);
        fs.renameSync(src, dest);
      }

      fs.rmdirSync(nestedDir);
    } else {
      break;
    }
  }
}

function detectDependencies(skillDir) {
  const deps = [];
  if (fs.existsSync(path.join(skillDir, 'package.json'))) {
    deps.push('node');
  }
  return deps;
}

function installDep(skillDir, type) {
  if (type === 'node') {
    execSync('npm install --production --registry https://registry.npmmirror.com/', { cwd: skillDir, stdio: 'inherit' });
  }
}
