import { describe, it, expect } from "vitest";
import { isImeComposing } from "../src/lib/ime";

/**
 * 轻宜「考试系统」· 第 28 科：拼音打一半按回车，不许提交半成品
 *
 * 🔴 用户原话（2026-09-27 体检报告 ⑦）：
 *   中文输入法打字时，字母还在候选状态（比如刚敲了 `kaihui`），
 *   这时候按回车是「选中第一个候选」，但 keydown 照样到达处理函数 →
 *   一条叫「kaihui」的待办就被建出来了。
 *
 * 修法：所有「回车即提交」的地方都先过这道闸（见 src/lib/ime.ts）。
 * 这组测试锁住判据本身 —— 全 App 一共 10 处回车提交，靠的都是同一个函数。
 */

describe("输入法组字判据", () => {
  it("标准属性：正在组字 → 是输入法", () => {
    expect(isImeComposing({ isComposing: true })).toBe(true);
  });

  it("标准属性：没在组字 → 放行", () => {
    expect(isImeComposing({ isComposing: false })).toBe(false);
  });

  it("老浏览器/部分输入法只给 keyCode 229（组字的约定值）", () => {
    expect(isImeComposing({ keyCode: 229 })).toBe(true);
  });

  it("正常回车的 keyCode（13）→ 放行", () => {
    expect(isImeComposing({ keyCode: 13 })).toBe(false);
  });

  /**
   * React 的合成事件把原生事件藏在 `nativeEvent` 里。
   * 只读外层的话，在 React 里永远拿不到 isComposing —— 修了等于没修。
   */
  it("React 合成事件：要读进 nativeEvent 里", () => {
    expect(isImeComposing({ nativeEvent: { isComposing: true } })).toBe(true);
    expect(isImeComposing({ nativeEvent: { keyCode: 229 } })).toBe(true);
  });

  it("React 合成事件：正常回车 → 放行", () => {
    expect(isImeComposing({ nativeEvent: { isComposing: false, keyCode: 13 } })).toBe(false);
  });

  it("两个判据都缺（环境不支持）→ 放行走原逻辑，不把回车卡死", () => {
    expect(isImeComposing({})).toBe(false);
  });
});
