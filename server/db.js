const fs = require("fs");
const path = require("path");

const DATABASE_URL = process.env.DATABASE_URL;
const isPostgres = Boolean(DATABASE_URL);

let sqlite = null; // DatabaseSync | null
let pool = null; // pg Pool | null

const SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    key_salt TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workspaces (
    user_id INTEGER PRIMARY KEY,
    iv TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

const PG_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    key_salt TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workspaces (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    iv TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at BIGINT NOT NULL
  );
`;

async function init() {
  if (isPostgres) {
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // required for Supabase
    });
    pool.on("error", (err) => console.error("[pg] idle client error:", err.message));
    await pool.query(PG_SCHEMA);
  } else {
    const { DatabaseSync } = require("node:sqlite");
    const dataDir = path.join(__dirname, "..", "data");
    fs.mkdirSync(dataDir, { recursive: true });
    sqlite = new DatabaseSync(path.join(dataDir, "light-todo.db"));
    sqlite.exec(SQLITE_SCHEMA);
  }
}

async function close() {
  if (pool) await pool.end();
}

// ---- users ----

async function getUserByUsername(username) {
  if (pool) {
    const { rows } = await pool.query(
      "SELECT id, username, password_hash, key_salt, created_at FROM users WHERE username = $1",
      [username],
    );
    return rows[0];
  }
  return sqlite
    .prepare(
      "SELECT id, username, password_hash, key_salt, created_at FROM users WHERE username = ?",
    )
    .get(username);
}

async function getUsernameById(id) {
  if (pool) {
    const { rows } = await pool.query("SELECT username FROM users WHERE id = $1", [id]);
    return rows[0];
  }
  return sqlite.prepare("SELECT username FROM users WHERE id = ?").get(id);
}

async function getKeySaltById(id) {
  if (pool) {
    const { rows } = await pool.query("SELECT key_salt FROM users WHERE id = $1", [id]);
    return rows[0];
  }
  return sqlite.prepare("SELECT key_salt FROM users WHERE id = ?").get(id);
}

async function createUser({ username, passwordHash, keySalt, createdAt }) {
  if (pool) {
    const { rows } = await pool.query(
      "INSERT INTO users (username, password_hash, key_salt, created_at) VALUES ($1, $2, $3, $4) RETURNING id",
      [username, passwordHash, keySalt, createdAt],
    );
    return { id: Number(rows[0].id) };
  }
  const result = sqlite
    .prepare(
      "INSERT INTO users (username, password_hash, key_salt, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(username, passwordHash, keySalt, createdAt);
  return { id: Number(result.lastInsertRowid) };
}

// ---- workspaces ----

async function getWorkspace(userId) {
  if (pool) {
    const { rows } = await pool.query(
      "SELECT iv, data FROM workspaces WHERE user_id = $1",
      [userId],
    );
    return rows[0];
  }
  return sqlite.prepare("SELECT iv, data FROM workspaces WHERE user_id = ?").get(userId);
}

async function upsertWorkspace({ userId, iv, data, updatedAt }) {
  if (pool) {
    await pool.query(
      `INSERT INTO workspaces (user_id, iv, data, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET iv = EXCLUDED.iv, data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [userId, iv, data, updatedAt],
    );
    return;
  }
  sqlite
    .prepare(
      `INSERT INTO workspaces (user_id, iv, data, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET iv = excluded.iv, data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(userId, iv, data, updatedAt);
}

module.exports = {
  isPostgres,
  init,
  close,
  getUserByUsername,
  getUsernameById,
  getKeySaltById,
  createUser,
  getWorkspace,
  upsertWorkspace,
};
