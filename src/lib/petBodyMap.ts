import type { PetExpressionId } from "../types";
import type { StateId } from "./bloub/states";

/**
 * 表情/动作 → bloub 形变态(state) 映射。
 *
 * bloub 的状态是「身体的形变表演」（idle 圆球、thinking 三点、sleep 小球、
 * egg 蛋、hexagon 六边形、play 三角+swoosh、orbit 旋转三角、burst 星爆、
 * comet 彗星、exclaim/alert 感叹号…），它们既是身体形状也是动作——这正是
 * 用户要的「能变形成各种形状」。
 *
 * 轻待办侧仍以 PetExpressionId 为唯一触发词（MascotAssistant 已深度绑定），
 * 这里把每个表情 id 映射到最贴合的 bloub state。映射后宠物会自动形变。
 */

/** 长时主导表情 → bloub state（不自动回 idle，持续展示该形变演出） */
export function expressionToState(expr: PetExpressionId): StateId {
  switch (expr) {
    // 生命周期
    case "sleep":
      return "sleep";
    case "curious":
      return "wide";
    case "daze":
      return "wide";
    case "excited":
      return "orbit";
    case "wave":
    case "wake":
      return "wide";
    case "peek":
      return "wink";
    // 情绪
    case "happy":
      return "burst";
    case "love":
      return "orbit";
    case "surprised":
      return "exclaim";
    case "thinking":
      return "thinking";
    case "angry":
      return "exclaim";
    case "proud":
    case "smug":
      return "egg";
    case "deadpan":
      return "hexagon";
    // 工作态
    case "working":
    case "onIt":
      return "wink";
    case "remind":
      return "notify";
    case "done":
      return "burst";
    case "error":
      return "alert";
    case "celebrate":
      return "burst";
    case "typing":
      return "thinking";
    case "waiting":
      return "wide";
    case "focus":
      return "egg";
    case "nope":
      return "hexagon";
    case "dance":
      return "orbit";
    case "spin":
      return "comet";
    case "pose":
      return "hexagon";
    // 其余 / 未知
    default:
      return "idle";
  }
}

/** 一次性动作 → 播完回 idle 的 state */
export function actionToState(act: PetExpressionId): StateId {
  return expressionToState(act);
}

/** 供表情馆/诊断用的可枚举形变态名 */
export const BLOUB_STATES: Array<{ id: StateId; label: string }> = [
  { id: "idle", label: "圆球" },
  { id: "egg", label: "蛋" },
  { id: "hexagon", label: "六边形" },
  { id: "play", label: "播放三角" },
  { id: "orbit", label: "旋转" },
  { id: "burst", label: "星爆" },
  { id: "comet", label: "彗星" },
  { id: "exclaim", label: "感叹号" },
  { id: "alert", label: "警示" },
  { id: "thinking", label: "思考" },
  { id: "sleep", label: "睡觉" },
  { id: "wide", label: "瞪眼" },
  { id: "wink", label: "眨眼" },
  { id: "notify", label: "通知" },
  { id: "swirl", label: "漩涡" },
];
