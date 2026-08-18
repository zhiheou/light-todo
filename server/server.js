const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const db = require("./db");

const app = express();

// Express 4 does not catch rejections from async handlers; wrap them explicitly.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const PORT = Number(process.env.PORT || 1450);
const SESSION_COOKIE = "lighttodo_session";
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const sessions = new Map();

app.use(express.json({ limit: "8mb" }));
app.use(cookieParser());

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(test, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, userId);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_TTL,
    path: "/",
  });
}

function requireAuth(req, res, next) {
  const token = req.cookies[SESSION_COOKIE];
  const userId = token ? sessions.get(token) : undefined;
  if (!userId) {
    res.status(401).json({ error: "未登录" });
    return;
  }
  req.userId = userId;
  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/register", asyncHandler(async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const keySalt = String(req.body?.keySalt || "");
  const iv = String(req.body?.iv || "");
  const data = String(req.body?.data || "");

  if (username.length < 3 || username.length > 32) {
    res.status(400).json({ error: "用户名长度需为 3-32 个字符" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "密码至少 6 位" });
    return;
  }
  if (!keySalt || !iv || !data) {
    res.status(400).json({ error: "缺少加密数据" });
    return;
  }

  const exists = await db.getUserByUsername(username);
  if (exists) {
    res.status(409).json({ error: "用户名已存在" });
    return;
  }

  const createdAt = Date.now();
  const { id: userId } = await db.createUser({
    username,
    passwordHash: hashPassword(password),
    keySalt,
    createdAt,
  });
  await db.upsertWorkspace({ userId, iv, data, updatedAt: createdAt });

  createSession(userId, res);
  res.json({ ok: true, username });
}));

app.post("/api/login", asyncHandler(async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const user = await db.getUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: "用户名或密码错误" });
    return;
  }
  createSession(user.id, res);
  res.json({ ok: true, username: user.username, keySalt: user.key_salt });
}));

app.post("/api/logout", requireAuth, asyncHandler(async (req, res) => {
  const token = req.cookies[SESSION_COOKIE];
  if (token) sessions.delete(token);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
}));

app.get("/api/me", requireAuth, asyncHandler(async (req, res) => {
  const user = await db.getUsernameById(req.userId);
  if (!user) {
    res.status(404).json({ error: "用户不存在" });
    return;
  }
  res.json({ ok: true, username: user.username });
}));

app.get("/api/workspace", requireAuth, asyncHandler(async (req, res) => {
  const user = await db.getKeySaltById(req.userId);
  const row = await db.getWorkspace(req.userId);
  if (!user || !row) {
    res.json({ keySalt: user?.key_salt || "", iv: null, data: null });
    return;
  }
  res.json({ keySalt: user.key_salt, iv: row.iv, data: row.data });
}));

app.put("/api/workspace", requireAuth, asyncHandler(async (req, res) => {
  const iv = String(req.body?.iv || "");
  const data = String(req.body?.data || "");
  if (!iv || !data) {
    res.status(400).json({ error: "缺少加密数据" });
    return;
  }
  await db.upsertWorkspace({ userId: req.userId, iv, data, updatedAt: Date.now() });
  res.json({ ok: true });
}));

const distDir = path.join(__dirname, "..", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

// Central error middleware: turn async handler rejections into a JSON 500.
app.use((err, _req, res, _next) => {
  console.error("[server] handler error:", err);
  res.status(500).json({ error: "服务器错误" });
});

(async () => {
  await db.init();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`light-todo server listening on ${PORT}`);
  });
})().catch((err) => {
  console.error("[server] DB init failed:", err.message);
  process.exit(1);
});
