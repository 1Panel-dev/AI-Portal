import chalk from 'chalk';
import api from '../lib/api.js';

export default async function search(query) {
  try {
    const results = await api.searchSkills(query);

    if (!results || results.length === 0) {
      console.log(chalk.yellow('No skills found.'));
      return;
    }

    console.log('');
    results.forEach((skill) => {
      const typeTag = skill.type === 'prompt'
        ? chalk.blue('[prompt]')
        : chalk.green('[script]');

      console.log(`  ${chalk.bold(skill.name)} ${typeTag}`);
      console.log(`    ${chalk.gray(skill.description || 'No description')}`);
      console.log(`    v${skill.version || '0.0.0'}  ${chalk.gray(skill.author || 'unknown')}`);
      console.log('');
    });

    console.log(chalk.gray(`Found ${results.length} skill(s).`));
  } catch (err) {
    console.error(chalk.red(`Search failed: ${err.message}`));
    process.exit(1);
  }
}
