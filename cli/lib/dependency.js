import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function hasPackageJson(skillDir) {
  return fs.existsSync(path.join(skillDir, 'package.json'));
}

function isBundled(manifest) {
  return manifest.bundled === true;
}

function installNodeDeps(skillDir) {
  if (!hasPackageJson(skillDir)) return;
  execSync('npm install --production --registry https://registry.npmmirror.com/', {
    cwd: skillDir,
    stdio: 'inherit',
  });
}

function installDependencies(skillDir, manifest) {
  if (isBundled(manifest)) return;
  installNodeDeps(skillDir);
}

function checkRuntime(manifest) {
  const runtime = manifest.runtime;
  if (!runtime) return true;

  if (runtime === 'node') {
    try {
      execSync('node --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  return true;
}

export default {
  installDependencies,
  isBundled,
  checkRuntime,
};
