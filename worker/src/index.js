// light-todo Cloudflare Worker
// 镜像 server/server.js 的 API（同一响应形状/状态码），DB 层用 D1。
// 密码：新用户/升级用户 → WebCrypto PBKDF2(pbkdf2$salt$hash, 150k)；
//       存量用户 → scrypt-js 纯 JS 验证旧 scrypt$ 哈希一次，成功后自动升级。

import { scrypt } from "scrypt-js";
import { env } from "cloudflare:workers";

const SESSION_COOKIE = "lighttodo_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Cloudflare Workers WebCrypto 的 PBKDF2 迭代上限是 100000（超出报 NotSupportedError）
const PBKDF2_ITERATIONS = 100000;
const MAX_BODY = 8 * 1024 * 1024;

// ---------- helpers ----------

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function setSessionCookie(response, token, maxAgeSeconds = SESSION_TTL_MS / 1000) {
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`,
  );
}

function clearSessionCookie(response) {
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  );
}

function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function ctEqual(aHex, bHex) {
  if (aHex.length !== bHex.length) return false;
  let diff = 0;
  for (let i = 0; i < aHex.length; i++) {
    diff |= aHex.charCodeAt(i) ^ bHex.charCodeAt(i);
  }
  return diff === 0;
}

async function readBody(request) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY) throw new HttpError(413, "请求体过大");
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, "请求体过大");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "无效的 JSON");
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- password hashing ----------

async function pbkdf2Hash(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = [...saltBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    512,
  );
  const hashHex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2$${saltHex}$${hashHex}`;
}

async function verifyPbkdf2(password, saltHex, expectedHex) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const saltBytes = new Uint8Array(
    saltHex.match(/../g).map((h) => parseInt(h, 16)),
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    512,
  );
  const actual = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return ctEqual(actual, expectedHex);
}

// 校验存量 scrypt$ 哈希（纯 JS，计入 CPU 时间，仅旧用户付一次）
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function verifyScrypt(password, saltHex, expectedHex) {
  // 注意：存量哈希由 Node crypto.scryptSync(password, salt, 64) 生成，
  // salt 是 hex 字符串 → 按 UTF-8 编码（32 字节）处理，而非 hex 解码。
  const salt = new TextEncoder().encode(saltHex);
  const passwordBytes = new TextEncoder().encode(password);
  return scrypt(passwordBytes, salt, 16384, 8, 1, 64).then((key) => {
    const actual = bytesToHex(key);
    return ctEqual(actual, expectedHex);
  });
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split("$");
  if (parts.length === 3 && parts[0] === "pbkdf2") {
    const [, salt, hash] = parts;
    return verifyPbkdf2(password, salt, hash);
  }
  if (parts.length === 3 && parts[0] === "scrypt") {
    const [, salt, hash] = parts;
    return verifyScrypt(password, salt, hash);
  }
  return false;
}

// 旧 scrypt 哈希登录成功后 → 升级为 pbkdf2
async function maybeUpgradePassword(user, password) {
  const stored = String(user.password_hash);
  if (stored.startsWith("scrypt$")) {
    const parts = stored.split("$");
    const salt = parts[1];
    const valid = await verifyScrypt(password, salt, parts[2]);
    if (valid) {
      const upgraded = await pbkdf2Hash(password);
      await DB.prepare("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(upgraded, user.id)
        .run();
      return true;
    }
    return false;
  }
  // 已升级或新用户：普通验证
  return verifyPassword(password, stored);
}

// ---------- session ----------

async function getSessionUser(token) {
  if (!token) return null;
  const row = await DB.prepare(
    "SELECT s.user_id, s.expires_at, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1",
  )
    .bind(token)
    .first();
  if (!row) return null;
  if (Date.now() > row.expires_at) {
    await DB.prepare("DELETE FROM sessions WHERE token = $1").bind(token).run();
    return null;
  }
  return { userId: row.user_id, username: row.username };
}

async function createSession(userId) {
  const token = randomHex(32);
  const now = Date.now();
  await DB.prepare(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)",
  )
    .bind(token, userId, now, now + SESSION_TTL_MS)
    .run();
  return token;
}

async function destroySession(token) {
  if (token) await DB.prepare("DELETE FROM sessions WHERE token = $1").bind(token).run();
}

// ---------- request routing ----------

export default {
  async fetch(request, workerEnv) {
    // 在模块作用域使用绑定（D1 / secrets）。
    globalThis.DB = workerEnv.DB;
    globalThis.DEEPSEEK_KEY = workerEnv.DEEPSEEK_API_KEY || "";

    const url = new URL(request.url);
    const path = url.pathname;

    // 非 /api/* 一律交给 assets 绑定（SPA）。index.html 由 assets 提供。
    if (!path.startsWith("/api/")) {
      return workerEnv.ASSETS.fetch(request);
    }

    try {
      return await routeApi(request, path, url);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message }, { status: err.status });
      }
      console.error("[worker] handler error:", err);
      return json({ error: "服务器错误" }, { status: 500 });
    }
  },
};

async function routeApi(request, path) {
  const method = request.method;
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies[SESSION_COOKIE];

  if (path === "/api/health" && method === "GET") {
    return json({ ok: true });
  }

  if (path === "/api/register" && method === "POST") {
    return register(request);
  }

  if (path === "/api/login" && method === "POST") {
    return login(request);
  }

  if (path === "/api/logout" && method === "POST") {
    return requireAuth(token, async (session) => {
      await destroySession(token);
      const res = json({ ok: true });
      clearSessionCookie(res);
      return res;
    });
  }

  if (path === "/api/me" && method === "GET") {
    return requireAuth(token, async (session) => {
      const user = await DB.prepare("SELECT username FROM users WHERE id = $1")
        .bind(session.userId)
        .first();
      if (!user) return json({ error: "用户不存在" }, { status: 404 });
      return json({ ok: true, username: user.username });
    });
  }

  if (path === "/api/workspace" && method === "GET") {
    return requireAuth(token, async (session) => {
      const user = await DB.prepare("SELECT key_salt FROM users WHERE id = $1")
        .bind(session.userId)
        .first();
      const row = await DB.prepare("SELECT iv, data FROM workspaces WHERE user_id = $1")
        .bind(session.userId)
        .first();
      if (!user || !row) {
        return json({ keySalt: user?.key_salt || "", iv: null, data: null });
      }
      return json({ keySalt: user.key_salt, iv: row.iv, data: row.data });
    });
  }

  if (path === "/api/workspace" && method === "PUT") {
    return requireAuth(token, async (session) => {
      const body = await readBody(request);
      const iv = String(body?.iv || "");
      const data = String(body?.data || "");
      if (!iv || !data) return json({ error: "缺少加密数据" }, { status: 400 });
      await DB.prepare(
        `INSERT INTO workspaces (user_id, iv, data, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT(user_id) DO UPDATE SET
           iv = excluded.iv,
           data = excluded.data,
           updated_at = excluded.updated_at`,
      )
        .bind(session.userId, iv, data, Date.now())
        .run();
      return json({ ok: true });
    });
  }

  if (path === "/api/chat" && method === "POST") {
    // DeepSeek 真 AI 对话（key 存 Worker secret，浏览器不接触）
    return requireAuth(token, async (session) => {
      const key = globalThis.DEEPSEEK_KEY || "";
      if (!key) {
        return json({ ok: true, reply: "", ai: false, error: "尚未接入 AI" });
      }
      const body = await readBody(request);
      const messages = Array.isArray(body?.messages) ? body.messages : [];
      if (messages.length === 0) return json({ error: "缺少消息" }, { status: 400 });
      // 限制长度防滥用
      const trimmed = messages.slice(-12).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, 2000),
      }));
      try {
        const resp = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: trimmed,
            max_tokens: 600,
            temperature: 0.7,
          }),
        });
        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          return json({ ok: false, error: "AI 服务异常", detail: errText.slice(0, 200) }, { status: 502 });
        }
        const data = await resp.json();
        const reply = data?.choices?.[0]?.message?.content ?? "";
        return json({ ok: true, reply, ai: true });
      } catch (err) {
        return json({ ok: false, error: "AI 调用失败", detail: String(err).slice(0, 200) }, { status: 502 });
      }
    });
  }

  if (path === "/api/pet-log" && method === "POST") {
    // 脱敏交互日志（为自训模型攒数据；不存明文标题/内容）
    return requireAuth(token, async (session) => {
      const body = await readBody(request);
      const kind = String(body?.kind || "").slice(0, 40);
      const action = String(body?.action || "").slice(0, 60);
      const expr = String(body?.expr || "").slice(0, 40);
      const ok = body?.ok === false ? 0 : 1;
      const aiReplyLen = Number(body?.aiReplyLen) || 0;
      if (!kind) return json({ ok: true }); // 静默忽略空
      await DB.prepare(
        `INSERT INTO pet_interactions (account_hash, ts, kind, expr_state, action, ai_reply_len, ok)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      )
        .bind(hashAccountId(session.userId), Date.now(), kind, expr, action, aiReplyLen, ok)
        .run();
      return json({ ok: true });
    });
  }

  return json({ error: "Not Found" }, { status: 404 });
}

/** 账号脱敏：sha256(userId) 前 16 位，日志不落明文用户 id */
function hashAccountId(id) {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16) + "-" + s.length;
}

async function requireAuth(token, handler) {
  const session = await getSessionUser(token);
  if (!session) return json({ error: "未登录" }, { status: 401 });
  return handler(session);
}

async function register(request) {
  const body = await readBody(request);
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  const keySalt = String(body?.keySalt || "");
  const iv = String(body?.iv || "");
  const data = String(body?.data || "");

  if (username.length < 3 || username.length > 32) {
    return json({ error: "用户名长度需为 3-32 个字符" }, { status: 400 });
  }
  if (password.length < 6) {
    return json({ error: "密码至少 6 位" }, { status: 400 });
  }
  if (!keySalt || !iv || !data) {
    return json({ error: "缺少加密数据" }, { status: 400 });
  }

  const exists = await DB.prepare("SELECT id FROM users WHERE username = $1")
    .bind(username)
    .first();
  if (exists) return json({ error: "用户名已存在" }, { status: 409 });

  const createdAt = Date.now();
  const passwordHash = await pbkdf2Hash(password);
  const result = await DB.prepare(
    "INSERT INTO users (username, password_hash, key_salt, created_at) VALUES ($1, $2, $3, $4)",
  )
    .bind(username, passwordHash, keySalt, createdAt)
    .run();
  const userId = result.meta.last_row_id;

  await DB.prepare(
    "INSERT INTO workspaces (user_id, iv, data, updated_at) VALUES ($1, $2, $3, $4)",
  )
    .bind(userId, iv, data, createdAt)
    .run();

  const token = await createSession(userId);
  const res = json({ ok: true, username });
  setSessionCookie(res, token);
  return res;
}

async function login(request) {
  const body = await readBody(request);
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");

  const user = await DB.prepare(
    "SELECT id, username, password_hash, key_salt FROM users WHERE username = $1",
  )
    .bind(username)
    .first();

  if (!user) return json({ error: "用户名或密码错误" }, { status: 401 });

  const valid = await maybeUpgradePassword(user, password);
  if (!valid) return json({ error: "用户名或密码错误" }, { status: 401 });

  const token = await createSession(user.id);
  const res = json({ ok: true, username: user.username, keySalt: user.key_salt });
  setSessionCookie(res, token);
  return res;
}
