/**
 * 桌面版诊断录制（v3.9.15）
 *
 * 用途：用户在桌宠上点「🔍 拖不动？点这个」→ 录 10 秒 → 把内部状态自动复制到剪贴板。
 *
 * 为什么要这个：拖动/点击类问题排查时，我（开发者）看不见用户机器上的真实状态 ——
 * 主进程到底收到 hitbox 没有？mouseHeld 是不是 true？是不是被切成穿透了？
 * 靠猜来猜去修了很多轮都没修准。这个录制会把"出问题那一刻"的完整状态拍下来。
 *
 * 记录内容（每 100ms 一条）：
 *   - 主进程状态：ignoreState（是否穿透）、takeoverLocked（是否钉住）、mouseHeld（是否检测到按住）
 *   - 鼠标位置（相对窗口）、宠物实际位置、是否命中可点区域
 *   - 页面收到的事件（pointerdown/move/up/lostpointercapture）
 */
import { petAPI } from "./desktopBridge";

interface DebugState {
  ignoreState: boolean;
  takeoverLocked: boolean;
  mouseHeld: boolean;
  hasWatcher: boolean;
  hitboxCount: number;
  hitboxes: Array<{ x: number; y: number; w: number; h: number }> | null;
  hasLoggedIn: boolean;
}

interface Sample {
  t: number;
  pet: string;
  mouse: string;
  inside: boolean;
  ignore: boolean;
  locked: boolean;
  held: boolean;
  watcher: boolean;
  ev: string;
}

/** 开始录制；返回一个"停止并复制"的函数 */
export function startDiagnose(): void {
  const api = petAPI() as unknown as { getDebugState?: () => Promise<DebugState> } | null;
  const samples: Sample[] = [];
  const events: string[] = [];
  const startedAt = Date.now();

  // 记录页面侧收到的指针事件
  const onEv = (e: Event) => {
    const t = e.type;
    const me = e as PointerEvent;
    events.push(`${t}@${Math.round(me.clientX ?? 0)},${Math.round(me.clientY ?? 0)}`);
  };
  const types = ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"];
  types.forEach((t) => window.addEventListener(t, onEv, true));

  const timer = window.setInterval(async () => {
    const el = document.querySelector(".pet-shell");
    const r = el ? el.getBoundingClientRect() : null;
    let st: DebugState | null = null;
    try {
      st = (await api?.getDebugState?.()) ?? null;
    } catch {
      /* 忽略 */
    }
    // 鼠标相对窗口的位置，从页面侧拿不到全局坐标，用最近一次事件近似；
    // 关键信息（inside）由主进程的 hitbox 与宠物矩形比对得出
    const petStr = r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` : "无";
    const sinceStart = events.length;
    samples.push({
      t: Date.now() - startedAt,
      pet: petStr,
      mouse: events.slice(sinceStart - 1).join(" "), // 最近事件（含坐标）
      inside: st?.hitboxCount ? true : false,
      ignore: st?.ignoreState ?? false,
      locked: st?.takeoverLocked ?? false,
      held: st?.mouseHeld ?? false,
      watcher: st?.hasWatcher ?? false,
      ev: String(events.length),
    });
  }, 100);

  // 10 秒后停止并写入剪贴板
  window.setTimeout(async () => {
    window.clearInterval(timer);
    types.forEach((t) => window.removeEventListener(t, onEv, true));

    let finalState: DebugState | null = null;
    try {
      finalState = (await api?.getDebugState?.()) ?? null;
    } catch {
      /* 忽略 */
    }

    const lines: string[] = [];
    lines.push("=== 轻待办桌面版诊断报告 ===");
    lines.push(`时间: ${new Date().toLocaleString()}`);
    lines.push(`版本: v3.9.15`);
    lines.push(`屏幕: ${window.innerWidth}x${window.innerHeight}`);
    lines.push(`系统级鼠标监听: ${finalState?.hasWatcher ? "✅ 在跑" : "❌ 没起来（降级模式）"}`);
    lines.push(`可点区域数量: ${finalState?.hitboxCount ?? 0}`);
    lines.push("");
    lines.push(`--- 页面收到的指针事件（共 ${events.length} 个）---`);
    // 只保留关键事件，避免太长
    const key = events.filter((e) => !e.startsWith("pointermove"));
    lines.push(`关键事件: ${key.join(" | ") || "(无)"}`);
    const moveCount = events.filter((e) => e.startsWith("pointermove")).length;
    lines.push(`pointermove 次数: ${moveCount}`);
    lines.push(`丢失捕获次数: ${events.filter((e) => e.startsWith("lostpointercapture")).length}`);
    lines.push("");
    lines.push("--- 状态采样（每 100ms，只显示状态有变化的）---");
    let prevKey = "";
    for (const s of samples) {
      const k = `${s.ignore}|${s.locked}|${s.held}|${s.watcher}|${s.pet}`;
      if (k === prevKey) continue;
      prevKey = k;
      lines.push(
        `t=${s.t}ms 宠物=${s.pet} 穿透=${s.ignore ? "是" : "否"} 钉住=${s.locked ? "是" : "否"} 按住=${s.held ? "是" : "否"} 监听=${s.watcher ? "有" : "无"}`,
      );
    }
    if (samples.length > 0) {
      const last = samples[samples.length - 1];
      lines.push("");
      lines.push(
        `最后状态: 穿透=${last.ignore ? "是" : "否"} 钉住=${last.locked ? "是" : "否"} 按住=${last.held ? "是" : "否"}`,
      );
    }
    lines.push("=== 报告结束（把以上全部内容发给我）===");

    const text = lines.join("\n");
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }

    /**
     * v3.9.20 🔴 兜底显示改成**页面内的浮层**，不用 window.prompt。
     * 真 bug：Electron 里 `window.prompt` 是**被禁用**的（直接返回 null、不弹框），
     * 所以剪贴板失败时用户根本拿不到诊断内容 —— 我设计的"点一下发我"就废了。
     * 现在：复制成功 → 弹提示；失败 → 在页面上显示一个可全选复制的框。
     */
    if (copied) {
      alert("诊断完成！\n\n结果已复制到剪贴板。\n请直接粘贴给我（Ctrl+V）。");
      return;
    }

    const box = document.createElement("div");
    box.style.cssText = [
      "position:fixed", "inset:24px", "z-index:99999",
      "background:#fff", "color:#111", "border:2px solid #8B91E8",
      "border-radius:12px", "padding:16px", "overflow:auto",
      "font:12px/1.5 monospace", "white-space:pre-wrap", "user-select:text",
    ].join(";");
    const tip = document.createElement("div");
    tip.style.cssText = "font:600 14px/1.6 system-ui;margin-bottom:10px;color:#6D74D6";
    tip.textContent = "诊断完成！请全选下面的文字（Ctrl+A）复制（Ctrl+C），发给我。点右上角×关闭。";
    const close = document.createElement("button");
    close.textContent = "×";
    close.style.cssText = "float:right;font-size:20px;border:0;background:none;cursor:pointer";
    close.onclick = () => box.remove();
    const pre = document.createElement("div");
    pre.textContent = text;
    box.appendChild(close);
    box.appendChild(tip);
    box.appendChild(pre);
    document.body.appendChild(box);
  }, 10000);
}
