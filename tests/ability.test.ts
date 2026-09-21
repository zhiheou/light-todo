import { describe, it, expect } from "vitest";
import { needsConfirm, isBlocked, ABILITIES } from "../src/lib/assistantAbility";

/**
 * 轻宜「考试系统」· 第 4 科：助手权限分级
 * 业界共识：查询永不确认；增/改默认直接；删除默认确认；高危不随档位豁免。
 */
describe("权限：只读档", () => {
  it("查询不确认", () => expect(needsConfirm("query", "readonly", false)).toBe(false));
  it("增/改/删 都被禁止执行", () => {
    expect(isBlocked("create", "readonly")).toBe(true);
    expect(isBlocked("update", "readonly")).toBe(true);
    expect(isBlocked("delete", "readonly")).toBe(true);
  });
});

describe("权限：标准档（默认）", () => {
  it("建/改/完成 → 直接执行（不确认）", () => {
    expect(needsConfirm("create", "standard", false)).toBe(false);
    expect(needsConfirm("update", "standard", false)).toBe(false);
  });
  it("删除 → 要确认", () => {
    expect(needsConfirm("delete", "standard", false)).toBe(true);
  });
  it("查询永不确认", () => {
    expect(needsConfirm("query", "standard", false)).toBe(false);
  });
});

describe("权限：全权档", () => {
  it("删除也直接执行", () => {
    expect(needsConfirm("delete", "full", false)).toBe(false);
  });
  it("建/改直接执行", () => {
    expect(needsConfirm("create", "full", false)).toBe(false);
    expect(needsConfirm("update", "full", false)).toBe(false);
  });
});

describe("权限：'全部都确认'开关", () => {
  it("开启后 建/改 也要确认", () => {
    expect(needsConfirm("create", "standard", true)).toBe(true);
    expect(needsConfirm("update", "standard", true)).toBe(true);
  });
  it("但查询永不确认（开关也管不着）", () => {
    expect(needsConfirm("query", "standard", true)).toBe(false);
  });
});

describe("权限：档位定义完整", () => {
  it("正好 3 档，且每档有名字/说明/示例", () => {
    expect(ABILITIES.length).toBe(3);
    for (const a of ABILITIES) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.desc.length).toBeGreaterThan(0);
      expect(a.example.length).toBeGreaterThan(0);
    }
  });
});
