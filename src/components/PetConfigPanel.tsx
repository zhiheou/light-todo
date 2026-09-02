import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Mode, PetBehaviorFlag, PetCoatKey, PetSkin } from "../types";
import { BloubAvatar } from "./BloubAvatar";
import { BLOUB_STATES } from "../lib/petBodyMap";
import type { StateId } from "../lib/bloub/states";
import { COAT_PALETTES } from "../lib/petPalettes";
import { clearPetDock } from "../lib/petSkin";

/**
 * 轻宜「动作与设置」面板。
 * - 形态馆：展示 bloub 全部形变态，单击选+预览，双击应用到主角色并关闭，另有「随机连播」循环演示。
 * - 皮肤：8 coat swatch / 大小 / 位置 / 行为。
 */
export interface PetConfigPanelProps {
  mode: Mode;
  skin: PetSkin;
  onSkinChange: (patch: Partial<PetSkin>) => void;
  /** 让主角色试玩/应用一个 bloub 形变态 */
  onTryExpression: (id: string) => void;
  onClose: () => void;
}

const COATS: PetCoatKey[] = ["teal", "amber", "azure", "coral", "violet", "rose", "graphite", "midnight", "mono"];
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
  /** 形态馆：当前选中(用于大预览)，null=没选 */
  const [selected, setSelected] = useState<StateId | null>(null);
  /** 随机连播是否运行 */
  const [shuffling, setShuffling] = useState(false);
  const shuffleTimer = useRef<number | null>(null);

  // 关闭连播时清理定时器
  useEffect(() => {
    return () => {
      if (shuffleTimer.current) window.clearTimeout(shuffleTimer.current);
    };
  }, []);

  function applyShape(id: StateId) {
    onTryExpression(id);
    onClose();
  }

  function toggleShuffle() {
    if (shuffling) {
      // 停止连播 → 回到主宠 idle
      setShuffling(false);
      if (shuffleTimer.current) window.clearTimeout(shuffleTimer.current);
      onTryExpression("idle");
      setSelected(null);
      return;
    }
    setShuffling(true);
    const step = () => {
      const pick = BLOUB_STATES[Math.floor(Math.random() * BLOUB_STATES.length)].id;
      setSelected(pick);
      onTryExpression(pick);
      shuffleTimer.current = window.setTimeout(step, 1500);
    };
    step();
  }

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
        <>
          {/* 大预览 */}
          <div className="pet-config-preview">
            <BloubAvatar
              state={selected ?? "idle"}
              coat={skin.coat}
              size={84}
              frozenAt={shuffling ? undefined : 0.5}
            />
            <div>
              <b>{BLOUB_STATES.find((s) => s.id === (selected ?? "idle"))?.label ?? "待机"}</b>
              <span>
                {selected
                  ? shuffling
                    ? "正在随机连播…"
                    : "双击格子应用到轻宜 · 单击随机连播"
                  : "点击格子预览，双击应用到轻宜"}
              </span>
              {!shuffling && (
                <button type="button" className="pet-try-btn" onClick={toggleShuffle}>
                  🎲 随机连播
                </button>
              )}
              {shuffling && (
                <button type="button" className="pet-try-btn secondary" onClick={toggleShuffle}>
                  ⏹ 停止
                </button>
              )}
            </div>
          </div>
          {/* 形变格 */}
          <div className="pet-expr-grid">
            {BLOUB_STATES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`pet-expr-cell ${selected === s.id ? "active" : ""}`}
                onClick={() => {
                  setSelected(s.id);
                  onTryExpression(s.id);
                }}
                onDoubleClick={() => applyShape(s.id)}
                title={`${s.label} · 单击预览 / 双击应用`}
              >
                <BloubAvatar state={s.id} coat={skin.coat} size={52} frozenAt={0.5} />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
          <p className="pet-config-tip">单击看效果 · 双击立即应用并关闭 · 右上 🎲 随机连播</p>
        </>
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
            <button
              type="button"
              className={skin.chatter !== false ? "on" : ""}
              onClick={() => onSkinChange({ chatter: skin.chatter === false })}
              title="桌宠会主动找你说话/逗你玩；关掉后变纯桌宠，只在你点开对话框时才聊天"
            >
              {skin.chatter !== false ? "主动搭话" : "主动搭话（关）"}
            </button>
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

          <label className="pet-set-label">闲置时随机展示哪些动作（可多选，勾选才会随机变）</label>
          <div className="pet-behaviors">
            {BLOUB_STATES.map((s) => {
              const pool = skin.autoStates ?? [];
              const on = pool.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  className={on ? "on" : ""}
                  onClick={() =>
                    onSkinChange({
                      autoStates: on
                        ? pool.filter((x) => x !== s.id)
                        : [...pool, s.id],
                    })
                  }
                >
                  {s.label}
                </button>
              );
            })}
            <button
              type="button"
              className={(skin.autoStates ?? []).length === 0 ? "on" : ""}
              onClick={() => onSkinChange({ autoStates: [] })}
            >
              不自动
            </button>
          </div>
          <p className="pet-config-tip">桌宠空闲时会从勾选的形态里随机变换，展示不同动作</p>
        </div>
      )}
    </div>
  );
}

export type { StateId };
