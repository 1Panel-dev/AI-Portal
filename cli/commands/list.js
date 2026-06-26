import chalk from 'chalk';
import storage from '../lib/storage.js';
import { detectPlatform, expandPath } from '../lib/platform.js';
import { loadUserConfig } from '../lib/config-yaml.js';

export default function list() {
  const detected = detectPlatform();
  let installDir = detected.path;
  const platformName = detected.name;

  const userConfig = loadUserConfig();
  if (userConfig.platforms?.[platformName]?.install_to) {
    installDir = expandPath(userConfig.platforms[platformName].install_to);
  }

  const skills = storage.listInstalled(installDir);

  if (skills.length === 0) {
    console.log(chalk.yellow('No skills installed.'));
    console.log(chalk.gray('Use "f2chub install <skill-name>" to install a skill.'));
    return;
  }

  console.log('');
  console.log(chalk.bold('Installed Skills:'));
  console.log('');

  skills.forEach((skill) => {
    const typeTag = skill.type === 'prompt'
      ? chalk.blue('prompt')
      : chalk.green('script');

    console.log(`  ${chalk.bold(skill.name)} ${chalk.gray(`v${skill.version}`)} [${typeTag}]`);
    if (skill.description) {
      console.log(`    ${chalk.gray(skill.description)}`);
    }
    console.log('');
  });

  console.log(chalk.gray(`Total: ${skills.length} skill(s)`));
}
