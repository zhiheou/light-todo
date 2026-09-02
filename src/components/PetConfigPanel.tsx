import { useState } from "react";
import { X } from "lucide-react";
import type { Mode, PetBehaviorFlag, PetCoatKey, PetSkin } from "../types";
import { BloubAvatar } from "./BloubAvatar";
import { BLOUB_STATES } from "../lib/petBodyMap";
import type { StateId } from "../lib/bloub/states";
import { COAT_PALETTES } from "../lib/petPalettes";
import { clearPetDock } from "../lib/petSkin";

/**
 * 轻宜「皮肤与行为」面板（bloub 版）。
 * - 形态馆：展示 bloub 全部形变态（圆球/蛋/六边形/三角/星爆/彗星/感叹号/思考/睡觉…），点某态试玩。
 * - 皮肤：8 coat swatch。
 * - 行为/位置/大小。
 */
export interface PetConfigPanelProps {
  mode: Mode;
  skin: PetSkin;
  onSkinChange: (patch: Partial<PetSkin>) => void;
  /** 让主角色试玩一个 bloub 形变态 */
  onTryExpression: (id: string) => void;
  onClose: () => void;
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
}: PetConfigPanelProps) {
  const [tab, setTab] = useState<"shapes" | "coat">("shapes");

  return (
    <div className="pet-config">
      <div className="pet-config-head">
        <b>轻宜 · {mode === "personal" ? "暮暖" : "晨青"}</b>
        <span>形态与皮肤</span>
        <button type="button" className="icon-button" aria-label="关闭设置" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="pet-config-tabs" role="tablist">
        <button
          type="button"
          className={tab === "shapes" ? "active" : ""}
          onClick={() => setTab("shapes")}
        >
          形态馆
        </button>
        <button
          type="button"
          className={tab === "coat" ? "active" : ""}
          onClick={() => setTab("coat")}
        >
          皮肤行为
        </button>
      </div>

      {tab === "shapes" ? (
        <div className="pet-expr-grid">
          {BLOUB_STATES.map((s) => (
            <button
              key={s.id}
              type="button"
              className="pet-expr-cell"
              onClick={() => onTryExpression(s.id)}
              title={`${s.label} (${s.id})`}
            >
              <BloubAvatar state={s.id} coat={skin.coat} size={52} frozenAt={0.5} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="pet-skin-panel">
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
                onClick={() => {
                  onSkinChange({ position: p.key });
                  // 回到固定位时清除拖拽落点
                  if (p.key === "corner" || p.key === "bottom") clearPetDock();
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" className="pet-reset-pos" onClick={clearPetDock}>
            回到默认位置
          </button>

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

export type { StateId };
