/**
 * 文件存储抽象层
 *
 * 支持两种后端：
 * - local: 本地磁盘存储（默认）
 * - cos:   腾讯云 COS 对象存储
 *
 * 配置优先级：数据库 > 环境变量
 */

const fs = require('fs');
const path = require('path');

// ============ 配置管理 ============

let currentConfig = {
  storageType: process.env.STORAGE_TYPE || 'local',
  localPath: process.env.LOCAL_STORAGE_PATH || '',
  cosSecretId: process.env.COS_SECRET_ID || '',
  cosSecretKey: process.env.COS_SECRET_KEY || '',
  cosBucket: process.env.COS_BUCKET || '',
  cosRegion: process.env.COS_REGION || 'ap-guangzhou',
};

let activeBackend = null;

// 从数据库加载配置
async function loadFromDB(pool) {
  try {
    const result = await pool.query('SELECT key, value FROM system_config');
    if (result.rows.length > 0) {
      const dbConfig = {};
      for (const row of result.rows) {
        dbConfig[row.key] = row.value;
      }
      // 数据库配置覆盖环境变量
      if (dbConfig.storage_type) currentConfig.storageType = dbConfig.storage_type;
      if (dbConfig.local_path) currentConfig.localPath = dbConfig.local_path;
      if (dbConfig.cos_secret_id) currentConfig.cosSecretId = dbConfig.cos_secret_id;
      if (dbConfig.cos_secret_key) currentConfig.cosSecretKey = dbConfig.cos_secret_key;
      if (dbConfig.cos_bucket) currentConfig.cosBucket = dbConfig.cos_bucket;
      if (dbConfig.cos_region) currentConfig.cosRegion = dbConfig.cos_region;
    }
  } catch (err) {
    // 表可能还不存在，忽略
  }
}

// 根据当前配置初始化后端
function initBackend() {
  activeBackend = currentConfig.storageType === 'cos' ? cos : local;
  console.log(`📦 存储模式: ${currentConfig.storageType}`);
}

// ============ Local 存储 ============

const DEFAULT_UPLOAD_DIR = path.join(__dirname, '../../data/uploads/skills');

function getUploadDir() {
  return currentConfig.localPath || DEFAULT_UPLOAD_DIR;
}

function resolvePath(filePath) {
  if (filePath.startsWith('skills/')) {
    return path.join(getUploadDir(), filePath.replace('skills/', ''));
  }
  if (filePath.includes('data/uploads/skills/')) {
    const relative = filePath.split('data/uploads/skills/')[1];
    const resolved = path.join(getUploadDir(), relative);
    if (fs.existsSync(resolved)) return resolved;
    const projectRoot = path.join(__dirname, '../..');
    const byProjectRoot = path.join(projectRoot, filePath.replace(/^\//, ''));
    if (fs.existsSync(byProjectRoot)) return byProjectRoot;
    return resolved;
  }
  return filePath;
}

const local = {
  async upload(skillId, filePath, version) {
    const versionDir = version ? path.join(getUploadDir(), skillId, version) : path.join(getUploadDir(), skillId);
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }
    const dest = path.join(versionDir, `${skillId}.zip`);
    fs.copyFileSync(filePath, dest);
    return version ? `skills/${skillId}/${version}/${skillId}.zip` : `skills/${skillId}/${skillId}.zip`;
  },

  async download(filePath) {
    const fullPath = resolvePath(filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`文件不存在: ${fullPath}`);
    }
    return fs.readFileSync(fullPath);
  },

  async delete(filePath) {
    const fullPath = resolvePath(filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`🗑️ 已删除本地文件: ${fullPath}`);
      return true;
    }
    return false;
  },

  getLocalPath(filePath) {
    return resolvePath(filePath);
  },

  getSignedUrl() {
    return null;
  },

  exists(filePath) {
    const fullPath = resolvePath(filePath);
    return fs.existsSync(fullPath);
  },
};

// ============ COS 存储 ============

let cosClient = null;

function getCosClient() {
  if (cosClient) return cosClient;
  const COS = require('cos-nodejs-sdk-v5');
  cosClient = new COS({
    SecretId: currentConfig.cosSecretId,
    SecretKey: currentConfig.cosSecretKey,
  });
  return cosClient;
}

function getCosParams() {
  return {
    Bucket: currentConfig.cosBucket,
    Region: currentConfig.cosRegion,
  };
}

const cos = {
  async upload(skillId, filePath, version) {
    const client = getCosClient();
    const { Bucket, Region } = getCosParams();
    const key = version ? `skills/${skillId}/${version}/${skillId}.zip` : `skills/${skillId}/${skillId}.zip`;
    const fileBuffer = fs.readFileSync(filePath);

    await new Promise((resolve, reject) => {
      client.putObject(
        { Bucket, Region, Key: key, Body: fileBuffer },
        (err) => (err ? reject(err) : resolve())
      );
    });

    console.log(`✅ 已上传到 COS: ${key}`);
    return key;
  },

  async download(filePath) {
    const client = getCosClient();
    const { Bucket, Region } = getCosParams();

    const result = await new Promise((resolve, reject) => {
      client.getObject(
        { Bucket, Region, Key: filePath },
        (err, data) => (err ? reject(err) : resolve(data))
      );
    });

    return result.Body;
  },

  async delete(filePath) {
    const client = getCosClient();
    const { Bucket, Region } = getCosParams();

    await new Promise((resolve, reject) => {
      client.deleteObject(
        { Bucket, Region, Key: filePath },
        (err) => (err ? reject(err) : resolve())
      );
    });

    console.log(`🗑️ 已删除 COS 文件: ${filePath}`);
    return true;
  },

  getSignedUrl(filePath) {
    const client = getCosClient();
    const { Bucket, Region } = getCosParams();

    // getObjectUrl 同步返回 URL，也可用回调
    return client.getObjectUrl(
      { Bucket, Region, Key: filePath, Expires: 3600 },
      (err, data) => data?.Url
    );
  },

  exists(filePath) {
    const client = getCosClient();
    const { Bucket, Region } = getCosParams();

    return new Promise((resolve) => {
      client.headObject(
        { Bucket, Region, Key: filePath },
        (err) => resolve(!err)
      );
    });
  },
};

// ============ 公开方法 ============

// 初始化（启动时调用）
async function init(pool) {
  await loadFromDB(pool);
  initBackend();
}

// 热重载配置（管理后台保存后调用）
async function reload(pool) {
  // 重新加载数据库配置
  await loadFromDB(pool);
  // 重建 COS 客户端（密钥可能变了）
  cosClient = null;
  initBackend();
}

// 获取当前配置（脱敏）
function getConfig() {
  const key = currentConfig.cosSecretKey;
  let maskedKey = '';
  if (key) {
    maskedKey = key.length > 4 ? '****' + key.slice(-4) : '****';
  }
  return {
    storageType: currentConfig.storageType,
    localPath: currentConfig.localPath || DEFAULT_UPLOAD_DIR,
    cosSecretId: currentConfig.cosSecretId,
    cosSecretKey: maskedKey,
    cosBucket: currentConfig.cosBucket,
    cosRegion: currentConfig.cosRegion,
  };
}

// 获取原始配置（内部用）
function getRawConfig() {
  return { ...currentConfig };
}

// 导出
initBackend();

module.exports = {
  init,
  reload,
  getConfig,
  getRawConfig,
  get upload() { return activeBackend.upload; },
  get download() { return activeBackend.download; },
  get delete() { return activeBackend.delete; },
  getLocalPath: (fp) => activeBackend.getLocalPath(fp),
  getSignedUrl: (fp) => activeBackend.getSignedUrl(fp),
  exists: (fp) => activeBackend.exists(fp),
};
