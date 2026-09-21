-- v3.9 轻宜"没答好"汇总：所有账号的兜底/未识别句汇总到服务端，供统一优化
--
-- 隐私设计（重要）：
--   - 只存**用户说的那句话**（兜底/未识别时才上报），不存任务内容、不存标题、不存回复全文
--   - account_hash 脱敏（不落明文用户 id）
--   - 长度截断（最长 120 字），防止塞大段文本
--   - 客户端可关（设置开关），默认开
CREATE TABLE IF NOT EXISTS mascot_fallback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_hash TEXT NOT NULL,
  ts INTEGER NOT NULL,
  text TEXT NOT NULL,          -- 用户原话（截断 120）
  kind TEXT DEFAULT 'fallback', -- fallback=兜底 / unclear=未识别
  reply_len INTEGER DEFAULT 0,  -- 回复长度（不存回复内容）
  mode TEXT DEFAULT 'work'      -- 空间
);
CREATE INDEX IF NOT EXISTS idx_mascot_fallback_ts ON mascot_fallback (ts);
CREATE INDEX IF NOT EXISTS idx_mascot_fallback_text ON mascot_fallback (text);
