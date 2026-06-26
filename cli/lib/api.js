import config from './config.js';

async function request(endpoint, options = {}) {
  const baseUrl = config.get('registry');
  const token = config.get('token');

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${baseUrl}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API error ${response.status}: ${body}`);
  }

  return response;
}

async function getJSON(endpoint) {
  const res = await request(endpoint);
  return res.json();
}

async function getSkillManifest(skillName) {
  return getJSON(`/skills/${skillName}/manifest`);
}

async function searchSkills(query) {
  const params = query ? `?q=${encodeURIComponent(query)}` : '';
  return getJSON(`/skills/search${params}`);
}

async function getSkillInfo(skillName) {
  return getJSON(`/skills/${skillName}`);
}

async function downloadSkill(skillName) {
  const baseUrl = config.get('registry');
  const token = config.get('token');
  const url = `${baseUrl}/skills/${skillName}/download`;

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function recordInstall(skillName) {
  try {
    await request(`/skills/${skillName}/install`, { method: 'POST' });
  } catch {
    // 非关键操作，静默失败
  }
}

export default {
  getSkillManifest,
  searchSkills,
  getSkillInfo,
  downloadSkill,
  recordInstall,
};
