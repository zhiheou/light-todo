// 一次性迁移脚本：把本地 SQLite 用户/工作区迁移到 Postgres。
// 用法：
//   DATABASE_URL="postgresql://..." node server/migrate-sqlite-to-pg.js
// 幂等：已存在的用户名会跳过（可安全重复运行）。

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("缺少 DATABASE_URL 环境变量");
  process.exit(1);
}

const SQLITE_DB = path.join(__dirname, "..", "data", "light-todo.db");
if (!fs.existsSync(SQLITE_DB)) {
  console.error(`SQLite 数据库不存在：${SQLITE_DB}`);
  process.exit(1);
}

async function main() {
  const { Pool } = require("pg");

  // 只读打开 SQLite
  const sqlite = new DatabaseSync(SQLITE_DB, { readOnly: true });
  const users = sqlite
    .prepare("SELECT id, username, password_hash, key_salt, created_at FROM users ORDER BY id")
    .all();
  const workspaces = sqlite
    .prepare("SELECT user_id, iv, data, updated_at FROM workspaces")
    .all();
  sqlite.close();

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  let migrated = 0;
  let skipped = 0;

  for (const user of users) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const exists = await client.query("SELECT 1 FROM users WHERE username = $1", [
        user.username,
      ]);
      if (exists.rows.length > 0) {
        await client.query("ROLLBACK");
        console.log(`skipped  user_id=${user.id} "${user.username}" (已存在)`);
        skipped += 1;
        continue;
      }

      const inserted = await client.query(
        "INSERT INTO users (username, password_hash, key_salt, created_at) VALUES ($1, $2, $3, $4) RETURNING id",
        [user.username, user.password_hash, user.key_salt, user.created_at],
      );
      const newId = Number(inserted.rows[0].id);

      const ws = workspaces.find((w) => w.user_id === user.id);
      if (ws) {
        await client.query(
          "INSERT INTO workspaces (user_id, iv, data, updated_at) VALUES ($1, $2, $3, $4)",
          [newId, ws.iv, ws.data, ws.updated_at],
        );
      }

      await client.query("COMMIT");
      console.log(`migrated user_id=${user.id} -> ${newId} "${user.username}"${ws ? "" : " (无工作区)"}`);
      migrated += 1;
    } catch (err) {
      await client.query("ROLLBACK");
      client.release();
      console.error(`失败 user_id=${user.id} "${user.username}": ${err.message}`);
      process.exit(1);
    }
    client.release();
  }

  await pool.end();
  console.log(`\n完成：${migrated} 迁移，${skipped} 跳过`);
}

main().catch((err) => {
  console.error("迁移失败:", err.message);
  process.exit(1);
});
