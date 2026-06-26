import fs from 'fs';
import path from 'path';
import config from './config.js';

function getSkillsDir(skillsDir) {
  return skillsDir || path.join(process.cwd(), 'skills');
}

function getSkillDir(skillName, skillsDir) {
  return path.join(getSkillsDir(skillsDir), skillName);
}

function getManifestPath(skillsDir) {
  return path.join(getSkillsDir(skillsDir), '.installed.json');
}

function loadInstalled(skillsDir) {
  const manifestPath = getManifestPath(skillsDir);
  if (!fs.existsSync(manifestPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    return {};
  }
}

function saveInstalled(manifest, skillsDir) {
  const dir = getSkillsDir(skillsDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(getManifestPath(skillsDir), JSON.stringify(manifest, null, 2), 'utf-8');
}

function isInstalled(skillName, skillsDir) {
  const installed = loadInstalled(skillsDir);
  return !!installed[skillName];
}

function getInstalledVersion(skillName, skillsDir) {
  const installed = loadInstalled(skillsDir);
  return installed[skillName]?.version || null;
}

function recordInstall(skillName, manifest, skillsDir) {
  const installed = loadInstalled(skillsDir);
  installed[skillName] = {
    version: manifest.version,
    name: manifest.name,
    description: manifest.description,
    type: manifest.type,
    installedAt: new Date().toISOString(),
  };
  saveInstalled(installed, skillsDir);
}

function removeInstall(skillName, skillsDir) {
  const installed = loadInstalled(skillsDir);
  delete installed[skillName];
  saveInstalled(installed, skillsDir);

  const skillDir = getSkillDir(skillName, skillsDir);
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true });
  }
}

function listInstalled(skillsDir) {
  const installed = loadInstalled(skillsDir);
  return Object.entries(installed).map(([name, info]) => ({
    name,
    ...info,
  }));
}

function ensureDirs(skillsDir) {
  const dir = getSkillsDir(skillsDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function saveSkill(skillName, data, skillsDir) {
  ensureDirs(skillsDir);
  const skillDir = getSkillDir(skillName, skillsDir);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  const zipPath = path.join(skillDir, `${skillName}.zip`);
  fs.writeFileSync(zipPath, data);
  return zipPath;
}

function getSkillDirPath(skillName, skillsDir) {
  return getSkillDir(skillName, skillsDir);
}

export default {
  isInstalled,
  getInstalledVersion,
  recordInstall,
  removeInstall,
  listInstalled,
  saveSkill,
  getSkillDirPath,
  ensureDirs,
  getSkillsDir,
};
