-- 053: 模型同步默认下架（修复同步新增模型默认公开）
-- 背景: portal_models.is_public 列默认 TRUE(046), 同步 UPSERT 的 INSERT 不携带 is_public,
--       1Panel 端新增 backend / backend 改名 / 全量下架后回归 -> 新行吃默认值直接进广场,
--       绕过管理员上架管控。实锤: 08-24 同步 8 个新行(磊博-日日新/东区-方舟)全部默认公开。
-- 修复: 默认值改为 FALSE, 同步进来的新模型一律先下架, 由管理员在模型管理里手动上架。
-- 兼容: ALTER DEFAULT 只改列默认值, 不触碰任何存量行; 幂等可重复执行; 老版本升级零风险。
-- 注: panel.js 的 INSERT 同时显式写 is_public=FALSE, 双保险(显式值不依赖列默认值)。

ALTER TABLE portal_models ALTER COLUMN is_public SET DEFAULT FALSE;
