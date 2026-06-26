/**
 * AI-Portal 后端 API 服务
 * PostgreSQL + Express
 */

if (process.platform === 'win32') {
  try { process.stdout.setDefaultEncoding?.('utf8'); } catch {}
}

// 必须先加载 app.js(dotenv 在其中加载),再加载其他模块,确保环境变量就位
const { app, PORT, SERVE_STATIC, STATIC_PATH } = require('./app');
const storage = require('./lib/storage');
const panelApi = require('./lib/1panel-api');
const downloadCounter = require('./lib/downloadCounter');
const modelSync = require('./lib/modelSync');
const skillsSync = require('./lib/skillsSync');
const { initDatabase } = require('./db');

// 从 system_config 读 panel_sync_enabled / panel_sync_interval_minutes
async function loadSyncConfig() {
  try {
    const result = await global.pool.query(
      "SELECT key, value FROM system_config WHERE key IN ('panel_sync_enabled', 'panel_sync_interval_minutes')"
    );
    const map = {};
    for (const row of result.rows) map[row.key] = row.value;
    return {
      enabled: map.panel_sync_enabled !== 'false', // 默认启用
      intervalMs: Math.max(1, parseInt(map.panel_sync_interval_minutes || '10', 10)) * 60 * 1000,
    };
  } catch {
    return { enabled: true, intervalMs: 10 * 60 * 1000 };
  }
}

async function startServer() {
  try {
    const dbReady = await initDatabase();
    if (!dbReady) {
      process.exit(1);
    }

    await storage.init(global.pool);
    // 1Panel API 客户端:从 DB 加载配置(覆盖 .env 中的默认值)
    await panelApi.init(global.pool);

    // 启动下载量缓冲计数器,定时把内存累计 flush 到 DB
    downloadCounter.start(global.pool);

    // 启动模型 / 技能同步调度器(读 DB 配置)
    const syncCfg = await loadSyncConfig();
    if (syncCfg.enabled) {
      modelSync.start(syncCfg.intervalMs);
      skillsSync.start(syncCfg.intervalMs);
    } else {
      console.log('⏸️ 1Panel 同步已在管理后台禁用,跳过启动');
    }

    // 1Panel 配置变更时,重启调度器
    panelApi.onConfigChange(async () => {
      const cfg = await loadSyncConfig();
      if (cfg.enabled) {
        modelSync.restart(cfg.intervalMs);
        skillsSync.restart(cfg.intervalMs);
        console.log('🔄 1Panel 配置已更新,同步调度器已重启');
      } else {
        modelSync.stop();
        skillsSync.stop();
        console.log('⏸️ 1Panel 同步已禁用');
      }
    });

    const server = app.listen(PORT, () => {
      console.log(`🚀 AI-Portal 服务运行在 http://localhost:${PORT}`);
      console.log('📊 API 文档:');
      console.log('   GET  /api/health          - 健康检查');
      console.log('   GET  /api/skills          - 获取技能列表');
      console.log('   GET  /api/skills/:slug    - 获取单个技能');
      console.log('   GET  /api/stats           - 获取统计数据');
      console.log('   POST /api/skills/:id/download - 增加下载量');
      console.log('   GET  /api/categories      - 获取分类列表');
      if (SERVE_STATIC) {
        console.log(`\n📁 静态文件服务: ${STATIC_PATH}`);
      }
    });

    // 优雅退出:先 flush 内存计数器 + 停止模型同步调度,再关 HTTP server
    const gracefulShutdown = async (signal) => {
      console.log(`\n收到 ${signal},准备优雅退出...`);
      modelSync.stop();
      skillsSync.stop();
      try {
        await downloadCounter.shutdown();
        console.log('✅ 下载量计数器已 flush');
      } catch (err) {
        console.error('❌ 下载量 flush 失败:', err.message);
      }
      server.close(() => {
        console.log('✅ HTTP server 已关闭');
        process.exit(0);
      });
      // 兜底:5 秒后强制退出,防止挂死连接拖住进程
      setTimeout(() => {
        console.error('⚠️ 优雅退出超时,强制退出');
        process.exit(1);
      }, 5000).unref();
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (err) {
    console.error('❌ 启动失败:', err.message);
    process.exit(1);
  }
}

startServer();
