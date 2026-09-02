import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Mode, PetBehaviorFlag, PetCoatKey, PetExpressionId, PetSkin } from "../types";
import { AvatarV2 } from "./AvatarV2";
import { staticFrame } from "../lib/petEngine";
import {
  PET_EXPRESSIONS,
  PET_EXPRESSIONS_BY_CATEGORY,
} from "../lib/petExpressions";
import { COAT_PALETTES } from "../lib/petPalettes";
import { clearPetDock } from "../lib/petSkin";

/**
 * 轻宜「表情动作馆 + 皮肤/行为设置」。
 * 表情馆：3 分组 tab + 特技，网格缩略；点某个 → onTryExpression(id) 在主角色上试玩。
 * 皮肤：8 coat swatch、4 体型、大小 s/m/l。
 * 行为：动画开关 chips + 位置（自由/右下/底部）+ 重置位置。
 */
export interface PetConfigPanelProps {
  mode: Mode;
  skin: PetSkin;
  onSkinChange: (patch: Partial<PetSkin>) => void;
  onTryExpression: (id: PetExpressionId) => void;
  onClose: () => void;
  /** 当前展示中的表情（用于标记/聚焦） */
  activeExpr?: PetExpressionId;
  /** 打开时初始 tab */
  initialTab?: "life" | "emotion" | "work" | "coat";
}

const COATS: PetCoatKey[] = ["teal", "amber", "azure", "coral", "violet", "rose", "graphite", "midnight"];
const BEHAVIOR_LABELS: Record<string, string> = {
  breathe: "呼吸",
  blink: "眨眼",
  look: "注视跟随",
  drift: "眼神游移",
  idleActs: "待机小动作",
  draggable: "可拖拽",
  follow: "跟随鼠标",
};

export function PetConfigPanel({
  mode,
  skin,
  onSkinChange,
  onTryExpression,
  onClose,
  activeExpr,
  initialTab,
}: PetConfigPanelProps) {
  const [tab, setTab] = useState<"life" | "emotion" | "work" | "coat">(initialTab ?? "life");
  const groups = PET_EXPRESSIONS_BY_CATEGORY;
  const active = activeExpr ? PET_EXPRESSIONS.find((e) => e.id === activeExpr) : null;
  const activeFrame = useMemo(
    () => (active ? staticFrame(active.id) : null),
    [active],
  );

  const showGrid = tab === "life" || tab === "emotion" || tab === "work";
  const grid = showGrid ? groups[tab] : [];

  return (
    <div className="pet-config">
      <div className="pet-config-head">
        <b>轻宜 · {mode === "personal" ? "暮暖" : "晨青"}</b>
        <span>表情动作馆 + 皮肤行为</span>
        <button type="button" className="icon-button" aria-label="关闭设置" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {/* 当前试玩表情大图 */}
      {active && activeFrame && (
        <div className="pet-config-preview">
          <AvatarV2 frame={activeFrame} size={72} coat={skin.coat} />
          <div>
            <b>{active.nameZh}</b>
            <span>{active.nameEn}</span>
            <button
              type="button"
              className="pet-try-btn"
              onClick={() => onTryExpression(active.id)}
            >
              试玩
            </button>
          </div>
        </div>
      )}

      <div className="pet-config-tabs" role="tablist">
        {[
          { key: "life" as const, label: "生命" },
          { key: "emotion" as const, label: "情绪" },
          { key: "work" as const, label: "工作" },
          { key: "coat" as const, label: "皮肤" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showGrid ? (
        <div className="pet-expr-grid">
          {grid.map((expr) => (
            <button
              key={expr.id}
              type="button"
              className="pet-expr-cell"
              onClick={() => onTryExpression(expr.id)}
              title={`${expr.nameZh} ${expr.nameEn}`}
            >
              <AvatarV2 frame={staticFrame(expr.id)} size={44} coat={skin.coat} />
              <span>{expr.nameZh}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="pet-skin-panel">
          {/* 身体配色 */}
          <label className="pet-set-label">身体配色</label>
          <div className="pet-swatches">
            {COATS.map((c) => (
              <button
                key={c}
                type="button"
                className={skin.coat === c ? "active" : ""}
                style={{ background: COAT_PALETTES[c].main }}
                onClick={() => onSkinChange({ coat: c })}
                aria-label={c}
                title={c}
              />
            ))}
          </div>

          {/* 身体形态 */}
          <label className="pet-set-label">身体形态</label>
          <div className="pet-chips">
            {(["ball", "egg", "blob", "cloud"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={skin.shape === s ? "active" : ""}
                onClick={() => onSkinChange({ shape: s })}
              >
                {{ ball: "球", egg: "蛋", blob: "小水滴", cloud: "云" }[s]}
              </button>
            ))}
          </div>

          {/* 大小 */}
          <label className="pet-set-label">大小</label>
          <div className="pet-chips">
            {(["s", "m", "l"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={skin.size === s ? "active" : ""}
                onClick={() => onSkinChange({ size: s })}
              >
                {{ s: "小", m: "中", l: "大" }[s]}
              </button>
            ))}
          </div>

          {/* 停靠位置 */}
          <label className="pet-set-label">位置</label>
          <div className="pet-chips">
            {(
              [
                { key: "corner" as const, label: "右下角" },
                { key: "free" as const, label: "自由拖拽" },
                { key: "bottom" as const, label: "底部停靠" },
              ]
            ).map((p) => (
              <button
                key={p.key}
                type="button"
                className={skin.position === p.key ? "active" : ""}
                onClick={() => onSkinChange({ position: p.key })}
              >
                {p.label}
              </button>
            ))}
          </div>
          {skin.position === "free" && (
            <button type="button" className="pet-reset-pos" onClick={clearPetDock}>
              重置到默认位置
            </button>
          )}

          {/* 行为 */}
          <label className="pet-set-label">动画与互动</label>
          <div className="pet-behaviors">
            {Object.entries(BEHAVIOR_LABELS).map(([flag, label]) => {
              const f = flag as PetBehaviorFlag;
              const on = skin.behaviors.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  className={on ? "on" : ""}
                  onClick={() =>
                    onSkinChange({
                      behaviors: on
                        ? skin.behaviors.filter((b) => b !== f)
                        : [...skin.behaviors, f],
                    })
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
