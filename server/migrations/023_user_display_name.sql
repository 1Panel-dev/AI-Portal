-- 023: portal_users 增加 display_name 列，存储 1Panel 用户中文名
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
