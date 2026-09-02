import type { PetCoatKey, PetDock, PetSkin } from "../types";

const SKIN_KEY = "lighttodo:pet-skin:v1";
const DOCK_KEY = "lighttodo:pet-dock:v1";

const ALL_COATS: PetCoatKey[] = [
  "teal",
  "amber",
  "azure",
  "coral",
  "violet",
  "rose",
  "graphite",
  "midnight",
  "mono",
];

const ALL_BEHAVIORS = ["breathe", "blink", "look", "drift", "idleActs", "draggable", "follow"];

/** 默认黑白（mono）—— 所有新用户默认黑白；闲置默认随机展示全部动作形态 */
export function defaultPetSkin(): PetSkin {
  return {
    shape: "blob",
    coat: "mono",
    size: "l",
    position: "corner",
    behaviors: ["breathe", "blink", "look", "drift", "idleActs", "draggable", "follow"],
    autoStates: [
      "idle", "egg", "hexagon", "play", "orbit", "burst", "comet",
      "exclaim", "alert", "thinking", "wide", "wink",
    ],
    hidden: false,
    chatter: true,
  };
}

function isValidSkin(v: unknown): v is PetSkin {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  const coatOk = typeof s.coat === "string" && (ALL_COATS as string[]).includes(s.coat);
  const shapeOk = typeof s.shape === "string" && ["ball", "egg", "blob", "cloud"].includes(s.shape);
  const sizeOk = typeof s.size === "string" && ["s", "m", "l"].includes(s.size);
  const posOk = typeof s.position === "string" && ["free", "bottom", "corner"].includes(s.position);
  return coatOk && shapeOk && sizeOk && posOk && Array.isArray(s.behaviors);
}

export function loadPetSkin(mode: "work" | "personal"): PetSkin {
  try {
    const raw = localStorage.getItem(`${SKIN_KEY}.${mode}`);
    if (raw) {
      const parsed = JSON.parse(raw) as PetSkin;
      if (isValidSkin(parsed)) {
        // 旧皮肤无 autoStates → 补默认（全勾），让老用户也有随机动作
        if (!Array.isArray(parsed.autoStates)) {
          const d = defaultPetSkin();
          return { ...parsed, autoStates: d.autoStates };
        }
        return parsed;
      }
    }
  } catch {
    /* fallthrough */
  }
  return defaultPetSkin();
}

export function savePetSkin(skin: PetSkin, mode: "work" | "personal"): void {
  try {
    localStorage.setItem(`${SKIN_KEY}.${mode}`, JSON.stringify(skin));
  } catch {
    /* storage unavailable */
  }
}

export function coatForMode(mode: "work" | "personal"): PetCoatKey {
  return mode === "work" ? "teal" : "amber";
}

/** 合并一次皮肤补丁 + 校验行为白名单 */
export function patchSkin(skin: PetSkin, patch: Partial<PetSkin>): PetSkin {
  const next = { ...skin, ...patch };
  if (patch.behaviors) {
    next.behaviors = patch.behaviors.filter((b) => (ALL_BEHAVIORS as string[]).includes(b));
  }
  return next;
}

export function loadPetDock(): PetDock | null {
  try {
    const raw = localStorage.getItem(DOCK_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as PetDock;
    if (typeof v?.x === "number" && typeof v?.y === "number") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function savePetDock(dock: PetDock | null): void {
  try {
    if (dock) localStorage.setItem(DOCK_KEY, JSON.stringify(dock));
    else localStorage.removeItem(DOCK_KEY);
  } catch {
    /* ignore */
  }
}

export function clearPetDock(): void {
  try {
    localStorage.removeItem(DOCK_KEY);
  } catch {
    /* ignore */
  }
}
