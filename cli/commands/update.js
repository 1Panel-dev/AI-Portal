import ora from 'ora';
import chalk from 'chalk';
import api from '../lib/api.js';
import storage from '../lib/storage.js';
import { detectPlatform, expandPath } from '../lib/platform.js';
import { loadUserConfig } from '../lib/config-yaml.js';
import install from './install.js';

export default async function update(skillName) {
  const spinner = ora();

  try {
    const detected = detectPlatform();
    let installDir = detected.path;
    const platformName = detected.name;

    const userConfig = loadUserConfig();
    if (userConfig.platforms?.[platformName]?.install_to) {
      installDir = expandPath(userConfig.platforms[platformName].install_to);
    }

    if (!storage.isInstalled(skillName, installDir)) {
      console.log(chalk.yellow(`Skill "${skillName}" is not installed.`));
      console.log(chalk.gray('Use "f2chub install <skill-name>" to install it.'));
      return;
    }

    // 获取最新版本
    spinner.start('Checking for updates...');
    const manifest = await api.getSkillManifest(skillName);
    const currentVersion = storage.getInstalledVersion(skillName, installDir);

    if (manifest.version === currentVersion) {
      spinner.succeed(`Already up to date (v${currentVersion})`);
      return;
    }

    spinner.succeed(`New version available: v${currentVersion} -> v${manifest.version}`);

    // 重新安装（强制覆盖）
    await install(skillName, { force: true });
  } catch (err) {
    spinner.fail(chalk.red(`Update failed: ${err.message}`));
    process.exit(1);
  }
}
