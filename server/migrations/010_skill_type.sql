-- 010: 在 skills 表新增 type / runtime 列
-- 目的：审核通过时一次性探测 zip 包并落表，避免 CLI 每次 manifest 请求都重新下载 zip 解析。
-- 兼容性：两列均有默认值，旧数据(NULL/default)在 manifest 接口仍会走 zip 兜底逻辑。

ALTER TABLE skills ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'prompt';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS runtime VARCHAR(20);
