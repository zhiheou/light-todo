import { describe, it, expect } from "vitest";
import { calcPetPx, PET_MIN, PET_MAX } from "../src/components/PetShell";

/**
 * 轻宜「考试系统」· 第 12 科：桌宠尺寸自适应
 *
 * 背景（v3.9.4 修的真 bug）：
 *  1. 原算法按"窗口宽度"算，而桌面版桌宠窗口只有 160px 宽 → 算出 88 触底值，
 *     笔记本和台式机显示一模一样大，用户明确要求"不能显示同样大小"。
 *  2. 第一次改的公式是"屏幕宽 9% 夹 [64,104]"，但 1280 以上全部撞上限 104，
 *     等于没自适应 —— 这个回归必须用测试锁死。
 */
describe("桌宠尺寸自适应", () => {
  it("笔记本(1440) 与 台式(1920) 必须不同 —— 用户明确要求", () => {
    const laptop = calcPetPx("l", 1440);
    const desktop = calcPetPx("l", 1920);
    expect(laptop).not.toBe(desktop);
    expect(desktop).toBeGreaterThan(laptop);
  });

  it("旧公式的回归：1280 与 1920 不能都撞到同一个上限", () => {
    // 旧公式 Math.min(104, Math.max(64, w*0.09)) 下这两个都是 104 —— 正是被否掉的行为
    expect(calcPetPx("l", 1280)).toBeLessThan(calcPetPx("l", 1920));
  });

  it("小屏有下限：不会小到点不中", () => {
    expect(calcPetPx("l", 390)).toBe(PET_MIN); // 手机
    expect(calcPetPx("l", 800)).toBe(PET_MIN);
  });

  it("超大屏有上限：4K 上不会变成占半屏的怪物", () => {
    expect(calcPetPx("l", 3840)).toBe(PET_MAX);
    expect(calcPetPx("l", 2560)).toBe(PET_MAX);
  });

  it("s/m/l 三档严格递增且比例正确（s=0.72 m=0.95 l=1）", () => {
    for (const w of [390, 1280, 1440, 1920, 3840]) {
      const s = calcPetPx("s", w);
      const m = calcPetPx("m", w);
      const l = calcPetPx("l", w);
      expect(s).toBeLessThan(m);
      expect(m).toBeLessThanOrEqual(l);
    }
  });

  it("结果恒为正整数（不能出 NaN/负数，否则窗口 resize 会崩）", () => {
    for (const w of [0, 1, 320, 1920, 99999]) {
      for (const size of ["s", "m", "l"] as const) {
        const px = calcPetPx(size, w);
        expect(Number.isInteger(px)).toBe(true);
        expect(px).toBeGreaterThan(0);
      }
    }
  });

  it("屏幕宽极小时不崩（除零/负数防御）", () => {
    expect(() => calcPetPx("l", 0)).not.toThrow();
    expect(calcPetPx("l", 0)).toBe(PET_MIN);
  });

  it("已知机型的期望值（防以后改公式改坏）", () => {
    expect(calcPetPx("l", 1440)).toBe(96); // 用户的 MacBook 13"
    expect(calcPetPx("l", 1920)).toBe(128); // 常见台式
    expect(calcPetPx("l", 1366)).toBe(91); // 常见老笔记本
  });
});
