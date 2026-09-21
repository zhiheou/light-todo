import type { Mode } from "../types";

/**
 * 轻宜「助手能力」分级（v3.9）
 *
 * 参考业界（Claude Code / Cursor / Copilot / OpenHands）的共识：
 *  - 默认中档保守
 *  - 高危操作（删除）默认要确认
 *  - 查询永不确认；增/改/完成默认直接执行
 *
 * 三档 + 一个独立开关（"所有操作都确认"）。
 * 按空间分仓（工作/个人可以不同），存本机 localStorage。
 */

export type AbilityLevel = "readonly" | "standard" | "full";

export interface AbilityInfo {
  key: AbilityLevel;
  name: string;
  desc: string;
  example: string;
}

export const ABILITIES: AbilityInfo[] = [
  {
    key: "readonly",
    name: "只读陪聊",
    desc: "只回答和查询，不改动你的任何数据。",
    example: "你说「删掉开会」，它只会说「我目前是只读模式，需要你手动删」",
  },
  {
    key: "standard",
    name: "标准（推荐）",
    desc: "建待办、完成、改时间直接执行；删除会先问你一句。",
    example: "你说「删掉开会」，它先问「确定删「开会」吗？」再动手",
  },
  {
    key: "full",
    name: "全权",
    desc: "增删改都直接执行，不再逐次确认（像开着全权限的助手）。",
    example: "你说「删掉开会」，它直接删，并给一个可撤销提示",
  },
];

const KEY_PREFIX = "lighttodo:ability:v1:";

export function loadAbility(mode: Mode): AbilityLevel {
  try {
    const v = localStorage.getItem(`${KEY_PREFIX}${mode}`);
    if (v === "readonly" || v === "standard" || v === "full") return v;
  } catch {
    /* ignore */
  }
  return "standard";
}

export function saveAbility(mode: Mode, level: AbilityLevel): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${mode}`, level);
  } catch {
    /* ignore */
  }
}

/** 独立开关：打开后连"建/改/完成"也要确认（谨慎型用户） */
const CONFIRM_ALL_PREFIX = "lighttodo:confirm-all:v1:";

export function loadConfirmAll(mode: Mode): boolean {
  try {
    return localStorage.getItem(`${CONFIRM_ALL_PREFIX}${mode}`) === "1";
  } catch {
    return false;
  }
}

export function saveConfirmAll(mode: Mode, on: boolean): void {
  try {
    localStorage.setItem(`${CONFIRM_ALL_PREFIX}${mode}`, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/**
 * 判断某类操作在当前档位下是否需要"先确认"。
 * @param op 操作类别
 * @param level 当前档位
 * @param confirmAll 是否开启"全部都确认"
 */
export function needsConfirm(
  op: "query" | "create" | "update" | "delete",
  level: AbilityLevel,
  confirmAll: boolean,
): boolean {
  if (op === "query") return false; // 查询永不确认
  if (level === "readonly") return true; // 只读档：一切改动都先确认（其实会被拒，见 canDo）
  if (op === "delete") return level !== "full"; // 标准档删除要确认；全权档不用
  // create / update
  return confirmAll;
}

/** 只读档下，改动类操作是否被禁止（直接拒绝执行，而不是确认） */
export function isBlocked(op: "create" | "update" | "delete", level: AbilityLevel): boolean {
  void op; // 只读档下所有改动类操作一律禁止（op 保留以便未来按操作细分）
  return level === "readonly";
}
