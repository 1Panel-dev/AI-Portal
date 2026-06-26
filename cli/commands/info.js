import chalk from 'chalk';
import api from '../lib/api.js';
import storage from '../lib/storage.js';

export default async function info(skillName) {
  try {
    const skill = await api.getSkillInfo(skillName);
    const installed = storage.isInstalled(skillName);
    const installedVersion = storage.getInstalledVersion(skillName);

    console.log('');
    console.log(chalk.bold(skill.name));
    console.log('');

    console.log(`  Description:   ${skill.description || 'No description'}`);
    console.log(`  Version:       v${skill.version || '0.0.0'}`);
    console.log(`  Type:          ${skill.type || 'unknown'}`);
    console.log(`  Runtime:       ${skill.runtime || 'N/A'}`);
    console.log(`  Author:        ${skill.author || 'unknown'}`);
    console.log(`  Tags:          ${(skill.tags || []).join(', ') || 'none'}`);
    console.log('');

    if (installed) {
      console.log(chalk.green(`  Status: Installed (v${installedVersion})`));
    } else {
      console.log(chalk.gray('  Status: Not installed'));
    }

    console.log('');
    console.log(chalk.gray(`  Install: f2chub install ${skillName}`));
    console.log('');
  } catch (err) {
    console.error(chalk.red(`Failed to get skill info: ${err.message}`));
    process.exit(1);
  }
}
