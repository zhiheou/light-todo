import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildLock,
  localLock,
  localLockMatches,
  localLockOwner,
  verifyLockAgainst,
  writeLocalLock,
  clearPersonalLock,
} from "../src/lib/personalLock";

/**
 * 轻宜「考试系统」· 第 30 科：访问码不许"换个设备就重设一个"
 *
 * 🔴 用户原话（2026-09-27）：
 *   「个人空间密码看能不能锁定成一个，不要换个设备就设置一个」
 *
 * 事实：老版本的访问码**只写在 localStorage 里**（`lighttodo:personal-lock:v1`），
 * 而 localStorage 是本机的、不跟着账号走 —— 换台电脑/换个浏览器就得重设一个。
 *
 * 修法：权威副本搬进**账号加密数据**（`AppData.personalLock`），
 * 于是它跟着账号走到每一台设备。本机那份降级成两件事：
 *   ① 记「这份码属于哪个账号」（防同机换账号串码）
 *   ② 当升级前的遗产，首次进个人空间时**自动迁移**进账号（不让老用户重设）
 */

// ---------- 假 localStorage ----------
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", makeStorage());
  vi.stubGlobal("btoa", (s: string) => Buffer.from(s, "binary").toString("base64"));
  vi.stubGlobal("atob", (s: string) => Buffer.from(s, "base64").toString("binary"));
});

// ────────────────────────────────────────────────────────────
// ① 基础：设了能验，验错了不认
// ────────────────────────────────────────────────────────────
describe("① 访问码基本盘", () => {
  it("设好的码能验过", async () => {
    const lock = await buildLock("1234");
    expect(await verifyLockAgainst("1234", lock)).toBe(true);
  });

  it("错的码验不过", async () => {
    const lock = await buildLock("1234");
    expect(await verifyLockAgainst("9999", lock)).toBe(false);
    expect(await verifyLockAgainst("12345", lock)).toBe(false);
  });

  it("🔴 存的只有 salt + 摘要，**没有明文**", async () => {
    const lock = await buildLock("1234");
    expect(Object.keys(lock).sort()).toEqual(["hash", "salt"]);
    expect(JSON.stringify(lock)).not.toContain("1234");
  });

  it("同一个码两次设，salt 不同 → 摘要不同（防彩虹表）", async () => {
    const a = await buildLock("1234");
    const b = await buildLock("1234");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});

// ────────────────────────────────────────────────────────────
// ② 核心诉求：跟着账号走，换设备不用重设
// ────────────────────────────────────────────────────────────
describe("② 换设备（本地空、账号里有）", () => {
  it("【本次修复】新设备上本机什么都没有，但账号里带着那份码 → 照样能验", async () => {
    // 设备 A：设码，存进「账号数据」
    const lock = await buildLock("4321");
    const accountData = { personalLock: lock };

    // 设备 B：全新 localStorage，什么都没设过
    localStorage.clear();
    expect(localLock()).toBeNull();

    // 登录同一账号 → 账号数据里的那份就是权威副本
    expect(await verifyLockAgainst("4321", accountData.personalLock)).toBe(true);
    expect(await verifyLockAgainst("1111", accountData.personalLock)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// ③ 同机换账号：绝不能串码
// ────────────────────────────────────────────────────────────
describe("③ 同一台电脑换账号", () => {
  it("【本次修复】本机那份会标注归属，能认出「这不是当前账号的」", async () => {
    const lock = await buildLock("5678");
    writeLocalLock(lock, "alice");
    expect(localLockOwner()).toBe("alice");
    expect(localLockMatches("alice")).toBe(true);
    // 🔴 换个账号就是**不匹配** —— 不能拿 alice 的码去要求 bob 输入
    expect(localLockMatches("bob")).toBe(false);
  });

  it("🔴 旧版本的记录没有 owner → 归为空字符串（才允许被迁移）", () => {
    // 模拟升级前留下的旧格式：直接是 {salt, hash}，没有 owner 外壳
    localStorage.setItem(
      "lighttodo:personal-lock:v1",
      JSON.stringify({ salt: "c2FsdA==", hash: "aGFzaA==" }),
    );
    expect(localLockOwner()).toBe("");
    expect(localLock()).toEqual({ salt: "c2FsdA==", hash: "aGFzaA==" });
  });

  it("🔴 别人的码不许被当成自己的迁走", async () => {
    const lock = await buildLock("5678");
    writeLocalLock(lock, "alice");
    // bob 登录：owner 是 alice ≠ bob → 不能匹配（迁移判据要看这个）
    expect(localLockMatches("bob")).toBe(false);
    // 而 alice 自己登录时匹配
    expect(localLockMatches("alice")).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// ④ 升级迁移：老用户不用重设
// ────────────────────────────────────────────────────────────
describe("④ 老用户升级（本机有旧码、账号里没有）", () => {
  it("【本次修复】旧码能被读出来当迁移来源", async () => {
    const legacy = await buildLock("2468");
    writeLocalLock(legacy, "alice");

    // 账号数据里还没有 personalLock（老账号）
    const accountData: { personalLock?: { salt: string; hash: string } } = {};
    expect(accountData.personalLock).toBeUndefined();

    // 迁移判据：本机那份存在，且 owner 为空（旧记录）或就是当前账号
    const owner = localLockOwner();
    const canMigrate = localLock() !== null && (owner === "" || owner === "alice");
    expect(canMigrate).toBe(true);

    // 迁过去之后，用户输原来的码仍然能进
    const migrated = localLock()!;
    expect(await verifyLockAgainst("2468", migrated)).toBe(true);
  });

  it("迁移来的码和原码等价（不是换个 salt 重新设）", async () => {
    const legacy = await buildLock("2468");
    writeLocalLock(legacy, "alice");
    const migrated = localLock()!;
    expect(migrated.salt).toBe(legacy.salt);
    expect(migrated.hash).toBe(legacy.hash);
  });
});

// ────────────────────────────────────────────────────────────
// ⑤ 清空 / 异常输入
// ────────────────────────────────────────────────────────────
describe("⑤ 清空与脏数据", () => {
  it("清掉之后读不到", async () => {
    writeLocalLock(await buildLock("1234"), "alice");
    expect(localLock()).not.toBeNull();
    clearPersonalLock();
    expect(localLock()).toBeNull();
    expect(localLockOwner()).toBe("");
  });

  it("🔴 脏数据（不是 JSON / 结构不对）一律当作「没有」，不许抛错", () => {
    localStorage.setItem("lighttodo:personal-lock:v1", "这不是 JSON");
    expect(localLock()).toBeNull();
    expect(localLockOwner()).toBe("");

    localStorage.setItem("lighttodo:personal-lock:v1", JSON.stringify({ owner: "alice" }));
    expect(localLock()).toBeNull();

    localStorage.setItem(
      "lighttodo:personal-lock:v1",
      JSON.stringify({ owner: "alice", lock: { salt: 1, hash: 2 } }),
    );
    expect(localLock()).toBeNull();
  });
});
