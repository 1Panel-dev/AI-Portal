import chalk from 'chalk';
import storage from '../lib/storage.js';
import { detectPlatform, expandPath } from '../lib/platform.js';
import { loadUserConfig } from '../lib/config-yaml.js';

export default function uninstall(skillName) {
  const detected = detectPlatform();
  let installDir = detected.path;
  const platformName = detected.name;

  const userConfig = loadUserConfig();
  if (userConfig.platforms?.[platformName]?.install_to) {
    installDir = expandPath(userConfig.platforms[platformName].install_to);
  }

  if (!storage.isInstalled(skillName, installDir)) {
    console.log(chalk.yellow(`Skill "${skillName}" is not installed.`));
    return;
  }

  storage.removeInstall(skillName, installDir);
  console.log(chalk.green(`Skill "${skillName}" has been uninstalled.`));
}
