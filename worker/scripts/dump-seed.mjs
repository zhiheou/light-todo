// 一次性脚本：把本地 SQLite (data/light-todo.db) 的行导出为 worker/seed.sql，
// 供 `wrangler d1 execute --remote --file=seed.sql` 导入 D1。
// 只读打开数据库，INSERT OR IGNORE 幂等，原 id 保留。

import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const DB = new DatabaseSync("../data/light-todo.db", { readOnly: true });
const esc = (s) => String(s).replaceAll("'", "''");

const users = DB.prepare(
  "SELECT id, username, password_hash, key_salt, created_at FROM users ORDER BY id",
).all();
const workspaces = DB.prepare(
  "SELECT user_id, iv, data, updated_at FROM workspaces ORDER BY user_id",
).all();
DB.close();

// 注意：D1 的 execute 不支持 BEGIN/COMMIT 事务语句，直接输出裸 INSERT（幂等）。
const lines = [];

lines.push(
  "INSERT OR IGNORE INTO users (id, username, password_hash, key_salt, created_at) VALUES",
);
lines.push(
  users
    .map(
      (u) =>
        `  (${u.id}, '${esc(u.username)}', '${esc(u.password_hash)}', '${esc(u.key_salt)}', ${u.created_at})`,
    )
    .join(",\n") + ";",
);

lines.push("INSERT OR IGNORE INTO workspaces (user_id, iv, data, updated_at) VALUES");
lines.push(
  workspaces
    .map((w) => `  (${w.user_id}, '${esc(w.iv)}', '${esc(w.data)}', ${w.updated_at})`)
    .join(",\n") + ";",
);

writeFileSync("seed.sql", lines.join("\n") + "\n");
console.log(`seed.sql written: ${users.length} users, ${workspaces.length} workspaces`);
