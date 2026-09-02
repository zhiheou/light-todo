-- v3.7 脱敏交互日志：记录用户与桌宠的互动（为自训模型攒数据，不落明文内容）
CREATE TABLE IF NOT EXISTS pet_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_hash TEXT NOT NULL,          -- 脱敏账号标识（非明文 id）
  ts INTEGER NOT NULL,                 -- 毫秒时间戳
  kind TEXT NOT NULL,                  -- 行为类型: chat/chat_ai/try_state/act/throw/hit/settings...
  expr_state TEXT DEFAULT '',          -- 表情/形变态 id
  action TEXT DEFAULT '',              -- 动作名/意图
  ai_reply_len INTEGER DEFAULT 0,      -- AI 回复长度(无 AI 为 0)
  ok INTEGER DEFAULT 1                 -- 是否成功
);
CREATE INDEX IF NOT EXISTS idx_pet_interactions_ts ON pet_interactions (ts);
CREATE INDEX IF NOT EXISTS idx_pet_interactions_kind ON pet_interactions (kind);
