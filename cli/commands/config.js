import chalk from 'chalk';
import { loadUserConfig, setConfig, resetConfig, addPlatform, removePlatform, getCurrentPlatform, setCurrentPlatform, setInstallMode } from '../lib/config-yaml.js';
import { getAvailablePlatforms } from '../lib/platform.js';

export default function configCmd(action, key, value) {
  if (action === 'list') {
    const config = loadUserConfig();
    console.log('');
    console.log(chalk.bold('User Configuration:'));
    console.log('');

    const currentPlatform = config.current_platform;
    if (currentPlatform) {
      console.log(`  ${chalk.green('current_platform')}: ${chalk.bold(currentPlatform)}`);
    } else {
      console.log(`  ${chalk.yellow('current_platform')}: ${chalk.gray('(not set — will prompt on first install)')}`);
    }

    if (config.platforms && Object.keys(config.platforms).length > 0) {
      console.log('');
      for (const [platform, settings] of Object.entries(config.platforms)) {
        const isCurrent = platform === currentPlatform;
        const marker = isCurrent ? chalk.green(' ← current') : '';
        console.log(`  ${chalk.cyan(platform)}:${marker}`);
        for (const [k, v] of Object.entries(settings)) {
          console.log(`    ${k} = ${JSON.stringify(v)}`);
        }
      }
    }

    console.log('');
    console.log(chalk.gray('Commands:'));
    console.log(chalk.gray('  f2chub config switch <name>     Switch current platform'));
    console.log(chalk.gray('  f2chub config add <name>        Add a custom platform'));
    console.log(chalk.gray('  f2chub config remove <name>     Remove a custom platform'));
    console.log(chalk.gray('  f2chub config platforms         List all available platforms'));
    console.log(chalk.gray('  f2chub config set <key> <value> Set a config value'));
    console.log(chalk.gray('  f2chub config reset <platform>  Reset to default'));
    console.log('');

  } else if (action === 'switch') {
    if (!key) {
      console.log(chalk.red('Usage: f2chub config switch <platform-name>'));
      console.log('');
      console.log(chalk.gray('Available platforms:'));
      const platforms = [...getAvailablePlatforms()].filter(([n]) => n !== 'universal');
      platforms.forEach(([name]) => {
        const marker = name === getCurrentPlatform() ? chalk.green(' (current)') : '';
        console.log(chalk.gray(`  ${name}${marker}`));
      });
      return;
    }

    // Validate platform exists
    const allPlatforms = [...getAvailablePlatforms()].map(([n]) => n);
    if (!allPlatforms.includes(key)) {
      console.log(chalk.red(`Unknown platform: ${key}`));
      console.log(chalk.gray(`Available: ${allPlatforms.filter(n => n !== 'universal').join(', ')}`));
      console.log(chalk.gray(`Add a new one: f2chub config add ${key}`));
      return;
    }

    setCurrentPlatform(key);
    console.log(chalk.green(`Switched to platform: ${chalk.bold(key)}`));

    // Show install path info
    const config = loadUserConfig();
    const installMode = config.platforms?.[key]?.install_mode || 'workspace';
    if (installMode === 'workspace') {
      console.log(chalk.gray(`Install mode: workspace → ./skills`));
    } else {
      const osType = process.platform === 'win32' ? 'windows' : 'mac';
      const installTo = config.platforms?.[key]?.install_to;
      if (installTo) {
        const installPath = typeof installTo === 'string' ? installTo : installTo[osType];
        console.log(chalk.gray(`Install mode: global → ${installPath}`));
      }
    }

  } else if (action === 'add') {
    if (!key) {
      console.log(chalk.red('Usage: f2chub config add <platform-name>'));
      console.log(chalk.gray('Example: f2chub config add myplatform'));
      console.log('');
      console.log(chalk.gray('After adding, edit ~/.f2chub/config.yaml to customize:'));
      console.log(chalk.gray('  install_mode        workspace (default) or global'));
      console.log(chalk.gray('  install_to.mac      Skill install path (mac, for global mode)'));
      console.log(chalk.gray('  install_to.windows  Skill install path (windows, for global mode)'));
      console.log(chalk.gray('  priority            Detection priority (lower = checked first, default 50)'));
      return;
    }

    try {
      addPlatform(key);
      console.log(chalk.green(`Added platform "${key}"`));
      console.log(chalk.gray(`Edit ~/.f2chub/config.yaml to customize install paths for "${key}".`));
    } catch (err) {
      console.log(chalk.red(err.message));
    }

  } else if (action === 'remove') {
    if (!key) {
      console.log(chalk.red('Usage: f2chub config remove <platform-name>'));
      console.log(chalk.gray('Example: f2chub config remove myplatform'));
      return;
    }

    try {
      removePlatform(key);
      console.log(chalk.green(`Removed platform "${key}"`));
    } catch (err) {
      console.log(chalk.red(err.message));
    }

  } else if (action === 'platforms') {
    console.log('');
    console.log(chalk.bold('Available Platforms:'));
    console.log('');

    const currentPlatform = getCurrentPlatform();

    for (const [name, platform] of getAvailablePlatforms()) {
      if (name === 'universal') continue;
      const osType = process.platform === 'win32' ? 'windows' : 'mac';
      const config = loadUserConfig();
      const installMode = config.platforms?.[name]?.install_mode || 'workspace';
      let install;
      if (installMode === 'workspace') {
        install = platform.workspace_install_to || './skills';
      } else {
        install = platform.install_to?.[osType] || platform.install_to || '(unknown)';
      }
      const isCurrent = name === currentPlatform;
      const marker = isCurrent ? chalk.green(' ← current') : '';
      console.log(`  ${chalk.cyan(name)}${marker}`);
      console.log(`    mode:     ${chalk.gray(installMode)}`);
      console.log(`    install:  ${chalk.gray(typeof install === 'string' ? install : install[osType] || '(unknown)')}`);
    }

    console.log('');
    console.log(chalk.gray('Switch:  f2chub config switch <name>'));
    console.log(chalk.gray('Add:     f2chub config add <name>'));
    console.log('');

  } else if (action === 'set') {
    if (!key || value === undefined) {
      console.log(chalk.red('Usage: f2chub config set <platform>.path <value>'));
      console.log(chalk.gray('Example: f2chub config set openclaw.path ~/my-skills'));
      return;
    }

    const parts = key.split('.');
    if (parts.length !== 2 || parts[1] !== 'path') {
      console.log(chalk.red('Invalid key format. Use: <platform>.path'));
      console.log(chalk.gray('Example: openclaw.path'));
      return;
    }

    setConfig(key, value);
    console.log(chalk.green(`Set ${key} = ${value}`));

  } else if (action === 'mode') {
    if (!key || !value) {
      console.log(chalk.red('Usage: f2chub config mode <platform> <workspace|global>'));
      console.log(chalk.gray('Example: f2chub config mode openclaw workspace'));
      console.log('');
      console.log(chalk.gray('  workspace  Install to ./skills in current directory (default)'));
      console.log(chalk.gray('  global     Install to ~/.<platform>/skills'));
      return;
    }

    if (!['workspace', 'global'].includes(value)) {
      console.log(chalk.red(`Invalid mode: "${value}". Use "workspace" or "global".`));
      return;
    }

    // Validate platform exists
    const allPlatforms = [...getAvailablePlatforms()].map(([n]) => n);
    if (!allPlatforms.includes(key)) {
      console.log(chalk.red(`Unknown platform: ${key}`));
      console.log(chalk.gray(`Available: ${allPlatforms.filter(n => n !== 'universal').join(', ')}`));
      return;
    }

    try {
      setInstallMode(key, value);
      const modeLabel = value === 'workspace' ? './skills (workspace)' : `~/.${key}/skills (global)`;
      console.log(chalk.green(`Install mode for ${chalk.bold(key)} set to: ${chalk.bold(value)}`));
      console.log(chalk.gray(`Skills will be installed to: ${modeLabel}`));
    } catch (err) {
      console.log(chalk.red(err.message));
    }

  } else if (action === 'reset') {
    if (!key) {
      console.log(chalk.red('Usage: f2chub config reset <platform>'));
      console.log(chalk.gray('Example: f2chub config reset openclaw'));
      return;
    }

    resetConfig(key);
    console.log(chalk.green(`Reset ${key} to built-in default`));

  } else {
    console.log(chalk.gray('Usage:'));
    console.log(chalk.gray('  f2chub config list              Show user configuration'));
    console.log(chalk.gray('  f2chub config switch <name>     Switch current platform'));
    console.log(chalk.gray('  f2chub config mode <p> <m>      Set install mode (workspace|global)'));
    console.log(chalk.gray('  f2chub config add <name>        Add a custom platform'));
    console.log(chalk.gray('  f2chub config remove <name>     Remove a custom platform'));
    console.log(chalk.gray('  f2chub config platforms         List all available platforms'));
    console.log(chalk.gray('  f2chub config set <key> <value> Set a config value'));
    console.log(chalk.gray('  f2chub config reset <platform>  Reset to default'));
    console.log('');
    console.log(chalk.gray('Examples:'));
    console.log(chalk.gray('  f2chub config switch openclaw'));
    console.log(chalk.gray('  f2chub config mode openclaw workspace'));
    console.log(chalk.gray('  f2chub config add myplatform'));
    console.log(chalk.gray('  f2chub config set openclaw.path ~/my-skills'));
    console.log('');
    console.log(chalk.gray('Config file: ~/.f2chub/config.yaml'));
  }
}
