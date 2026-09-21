import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Send, Settings2, Trash2, X } from "lucide-react";
import type { Mode, MascotMood, PetExpressionId, PetSkin, Priority, Task } from "../types";
import type { StateId } from "../lib/bloub/states";
import type { TaskDraft } from "./AddDialog";
import MascotAvatar from "./MascotAvatar";
import PetShell, { type PetMenuAction } from "./PetShell";
import { PetConfigPanel } from "./PetConfigPanel";
import {
  answer,
  cancelDelete,
  cancelRecordFeeling,
  confirmDelete,
  confirmRecordFeeling,
  isCancelRecord,
  isConfirmRecord,
  isGrantDeleteIntent,
  isOffTopic,
  needDeleteGrantReply,
  offTopicReply,
  readConfirm,
  type BrainAction,
  type BrainCtx,
} from "../lib/mascotBrain";
import { loadPetSkin, savePetSkin } from "../lib/petSkin";
import { clearChatStorage, loadChat, saveChat } from "../lib/mascotMemory";
import {
  clearLearnLog,
  exportLearnLog,
  isUploadOn,
  loadLearnLog,
  logLearn,
  reportFallback,
  setUploadOn,
  summarizeLearnLog,
} from "../lib/mascotLearn";
import { parseQuickAdd as parseQuickAddForChat } from "../lib/nlp";
import {
  ABILITIES,
  isBlocked,
  loadAbility,
  loadConfirmAll,
  saveAbility,
  saveConfirmAll,
  type AbilityLevel,
} from "../lib/assistantAbility";

interface Msg {
  role: "user" | "bot";
  text: string;
  ts: number;
}

export interface MascotNudge {
  id: number;
  text: string;
}

interface MascotAssistantProps {
  mode: Mode;
  tasks: Task[];
  onAddTask: (draft: TaskDraft) => void;
  onAddMemo: (text: string, tags?: string[]) => void;
  onOpenTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  /** v3.9：对话直接完成/取消完成待办 */
  onToggleTask: (task: Task) => void;
  /** v3.9：对话直接更新待办（改时间/优先级） */
  onUpdateTask: (task: Task, patch: { title?: string; dueDate?: string; dueTime?: string; priority?: Priority }) => void;
  /** v3.8 B：当前空间是否已授权吉祥物删待办 */
  deleteGranted: boolean;
  /** v3.8 B：把"删除授权"落库（localStorage，按空间） */
  onGrantDelete: () => void;
  /** App 侧主动推送的消息（登录问候/闲置搭话/到点提醒） */
  nudges: MascotNudge[];
}

const PERSONA: Record<Mode, { name: string; label: string; sub: string }> = {
  work: { name: "小轻", label: "工作助理", sub: "工作 · 进度 · 安排" },
  personal: { name: "小安", label: "个人助理", sub: "个人 · 生活 · 私事" },
};

const SUGGESTIONS = ["帮我记个待办：明天下午4点开会", "把这段话记到备忘录：买牛奶", "今天有什么安排？"];

const PANEL_W = 320;
const PANEL_H = 360; // 估算面板高，用于"上方是否有足够空间"的粗判

/**
 * 聊天气泡锚在桌宠旁；优先让面板**悬在宠物正上方**（面板底边贴宠物顶），这样底部的
 * 输入框在宠物上面、永远可见不被挡；宠物贴屏顶没空间时才放宠物下方。
 * 靠右自动往左收。petPos 缺省退回右下角。
 */
function panelStyle(
  petPos: { x: number; y: number; w: number; h: number } | null,
  open: boolean,
): CSSProperties {
  if (!open) return {};
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;
  // 面板实际可用高度：小窗口时压缩（底部输入框始终在屏内是硬约束）
  const availH = Math.max(240, Math.min(PANEL_H, vh - margin * 2));
  // 统一用 left/top 定位（而非 right/bottom）：这样 resize:both 拖拽才会自然向右下变大，
  // 不会出现"只能向右拉、上下拉不动"。
  if (!petPos) {
    return { left: Math.max(margin, vw - PANEL_W - margin), top: Math.max(margin, vh - availH - 92), maxHeight: availH };
  }
  // 左右：默认宠物右侧，放不下翻左侧；最后整体 clamp 进屏
  let left = petPos.x + petPos.w + margin;
  if (left + PANEL_W > vw - margin) left = petPos.x - PANEL_W - margin;
  left = Math.max(margin, Math.min(left, vw - PANEL_W - margin));

  const petTop = petPos.y;
  const roomAbove = petTop - margin;
  // 1) 宠物上方够高 → 面板底边贴宠物顶（用 top 表达）
  if (roomAbove >= availH) {
    const top = Math.max(margin, petTop - availH - 6);
    return { left, top, maxHeight: availH };
  }
  // 2) 上方不够 → 放宠物下方；底部 clamp 永不超屏
  const belowTop = petTop + petPos.h + margin;
  const top = Math.max(margin, Math.min(belowTop, vh - availH - margin));
  return { left, top, maxHeight: availH };
}

/** 聊天瞬时 mood → 长期表情映射（轻宜主导表情） */
function moodToExpr(mood: MascotMood): PetExpressionId {
  switch (mood) {
    case "happy":
      return "happy";
    case "thinking":
      return "thinking";
    case "reminding":
      return "remind";
    case "listening":
      return "waiting";
    default:
      return "idle";
  }
}

export default function MascotAssistant({
  mode,
  tasks,
  onAddTask,
  onAddMemo,
  onOpenTask,
  onDeleteTask,
  onToggleTask,
  onUpdateTask,
  deleteGranted,
  onGrantDelete,
  nudges,
}: MascotAssistantProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [mood, setMood] = useState<MascotMood>("idle");
  const [thinking, setThinking] = useState(false);
  const [chat, setChat] = useState<Record<Mode, Msg[]>>(() => ({
    work: loadChat("work") as Msg[],
    personal: loadChat("personal") as Msg[],
  }));
  const [pendingDelete, setPendingDelete] = useState<{ candidateId: string } | null>(null);
  /** v3.8 B：正在等用户"允许删除"授权（首次删待办）；记录了要删的那条 */
  const [awaitingGrant, setAwaitingGrant] = useState<{ candidateId: string } | null>(null);
  /** v3.8.1 C：情绪 → 询问是否记成 #心情 备忘（pending，用户确认才记） */
  const [pendingFeeling, setPendingFeeling] = useState<{ text: string } | null>(null);
  /** v3.8 D：防刷冷却——距上次发消息不足 8s 时忽略新消息 */
  const lastSentAt = useRef(0);
  const [unread, setUnread] = useState(0);
  /** 配置面板：形态/皮肤 */
  const [configOpen, setConfigOpen] = useState(false);
  /** v3.9 助手能力档位（按空间，本机持久化） */
  const [ability, setAbility] = useState<AbilityLevel>(() => loadAbility(mode));
  const [confirmAll, setConfirmAll] = useState<boolean>(() => loadConfirmAll(mode));
  /** 能力设置面板是否展开 */
  const [abilityOpen, setAbilityOpen] = useState(false);
  /** v3.9 学习日志查看 */
  const [learnOpen, setLearnOpen] = useState(false);
  const [learnList, setLearnList] = useState<Array<{ text: string; count: number }>>(() => loadLearnLog().length > 0 ? summarizeLearnLog() : []);
  const [, setUploadTick] = useState(0);
  /** v3.9 多候选待选：本地列了候选等用户选，记住它们（防"用户回名字却漏给AI"） */
  const [pendingChoices, setPendingChoices] = useState<
    Array<{ id: string; title: string; op: "delete" | "complete" | "uncomplete" | "update" }> | null
  >(null);
  /** v3.9 兜底待记：桌宠问"要不要记成待办"，记住原文 */
  const [pendingQuick, setPendingQuick] = useState<string | null>(null);
  /** v3.9 用户拖拽调整后的面板尺寸（null = 用默认） */
  const [panelSize, setPanelSize] = useState<{ w: number; h: number } | null>(null);
  const resizeRef = useRef<{ sx: number; sy: number; w: number; h: number } | null>(null);
  /** 已保存提示 */
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const savedTimer = useRef<number | null>(null);
  const showSaved = useCallback((msg: string) => {
    setSavedHint(msg);
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSavedHint(null), 1600);
  }, []);
  // 皮肤按空间分仓：工作=晨青 / 个人=暮暖（可各自自定义）
  const [skins, setSkins] = useState<Record<Mode, PetSkin>>(() => ({
    work: loadPetSkin("work"),
    personal: loadPetSkin("personal"),
  }));
  const skin = skins[mode];
  const setSkinForMode = useCallback(
    (patch: Partial<PetSkin>) => {
      setSkins((prev) => {
        const next = { ...prev[mode], ...patch };
        savePetSkin(next, mode);
        return { ...prev, [mode]: next };
      });
    },
    [mode],
  );
  /** 显示/隐藏桌宠（持久化，按空间独立） */
  const setPetHidden = useCallback(
    (hidden: boolean) => {
      setSkinForMode({ hidden });
      if (!hidden) setPreviewState(null);
    },
    [setSkinForMode],
  );
  const [act, setAct] = useState<{ id: PetExpressionId; key: number } | null>(null);
  /** 桌宠是否隐藏（持久化在 skin.hidden，按空间独立） */
  const petHidden = !!skin.hidden;
  /** 形态馆试玩：显示一个 bloub 形变态 */
  const [previewState, setPreviewState] = useState<StateId | null>(null);
  /** 桌宠当前位置（聊天气泡跟随） */
  const [petPos, setPetPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const seenNudge = useRef<Set<number>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const actCount = useRef(0);

  /** 切换空间：收起面板，避免"卡在上面"；档位与记忆按空间各自加载 */
  useEffect(() => {
    setOpen(false);
    setAbilityOpen(false);
    setPendingDelete(null);
    setAwaitingGrant(null);
    setPendingFeeling(null);
    setPendingChoices(null);
    setAbility(loadAbility(mode));
    setConfirmAll(loadConfirmAll(mode));
  }, [mode]);

  /** v3.9 自定义拖拽调大小：右下角手柄，向下/向右都能拉 */
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const w = Math.max(260, Math.min(window.innerWidth - 24, r.w + (e.clientX - r.sx)));
      const h = Math.max(220, Math.min(window.innerHeight - 60, r.h + (e.clientY - r.sy)));
      setPanelSize({ w, h });
    };
    const onUp = () => { resizeRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);
  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = (e.currentTarget as HTMLElement).parentElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    resizeRef.current = { sx: e.clientX, sy: e.clientY, w: rect.width, h: rect.height };
  }

  const persona = PERSONA[mode];
  const msgs = chat[mode];

  const triggerAct = useCallback((id: PetExpressionId) => {
    actCount.current += 1;
    setAct({ id, key: actCount.current });
  }, []);

  // 滚动到底：新消息/思考态变化后立即到底（用 auto 而非 smooth，避免长对话滚不到位）
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length, thinking, open]);

  // v3.9 记忆本：聊天变化即存本机（按空间分仓），刷新/关页后不丢
  useEffect(() => {
    saveChat("work", chat.work);
  }, [chat.work]);
  useEffect(() => {
    saveChat("personal", chat.personal);
  }, [chat.personal]);

  /** 给当前空间推一条机器人消息；面板关闭时记未读 */
  function pushBot(text: string, silent = false) {
    setChat((prev) => ({
      ...prev,
      [mode]: [...prev[mode], { role: "bot", text, ts: Date.now() }],
    }));
    if (!open && !silent) setUnread((u) => u + 1);
  }

  /** 消费 App 推来的主动消息（去重） */
  useEffect(() => {
    for (const n of nudges) {
      if (seenNudge.current.has(n.id)) continue;
      seenNudge.current.add(n.id);
      pushBot(n.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nudges]);

  // 切到个人空间且还没有聊天记录时，打个招呼（不增加未读，避免打扰）
  useEffect(() => {
    if (chat[mode].length === 0) {
      setChat((prev) => ({
        ...prev,
        [mode]: [
          {
            role: "bot",
            text: `${persona.name} 在这里～我是你的${persona.label}。可以直接说「帮我记个待办」或「记到备忘录」，也可以问我今天有什么安排。`,
            ts: Date.now(),
          },
        ],
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function openPanel() {
    setOpen(true);
    setUnread(0);
    setMood("happy");
    setTimeout(() => inputRef.current?.focus(), 120);
  }

  function closePanel() {
    setOpen(false);
    setMood("idle");
  }

  /** v3.8 D：清空当前空间对话记录（含清掉待确认/授权状态） */
  function clearChat() {
    setChat((prev) => ({ ...prev, [mode]: [] }));
    clearChatStorage(mode); // v3.9：一并清掉本机记忆
    setPendingDelete(null);
    setAwaitingGrant(null);
    setPendingFeeling(null);
    setPendingChoices(null);
    setMood("idle");
    setUnread(0);
  }

  function runAction(action: BrainAction | undefined) {
    if (!action) return;
    // v3.9 能力闸门：只读档禁止一切改动（直接拒绝，不执行）
    const opOf = (t: BrainAction["type"]): "query" | "create" | "update" | "delete" | null => {
      switch (t) {
        case "addTask":
        case "addMemo":
          return "create";
        case "completeTask":
        case "updateTask":
          return "update";
        case "deleteTask":
          return "delete";
        default:
          return null; // confirm/openTask/askRecordFeeling 等不算改动
      }
    };
    const op = opOf(action.type);
    if (op && op !== "query" && isBlocked(op, ability)) {
      pushBot(
        `我现在是「只读陪聊」模式，不能帮你改数据～如果想让我动手，在右上角 ⚙ 把能力调成「标准」或「全权」就行。`,
      );
      return;
    }
    switch (action.type) {
      case "addTask": {
        const p = action.parsed;
        const draft: TaskDraft = {
          title: p.title,
          notes: "",
          priority: p.priority,
          dueDate: p.dueDate,
          dueTime: p.dueTime,
          remindAt: p.remindAt,
          repeat: p.repeat,
        };
        onAddTask(draft);
        triggerAct("done");
        break;
      }
      case "askRecordFeeling": {
        // v3.8.1 C：情绪已共情，询问是否记 #心情 —— 等用户确认，不擅自记
        setPendingFeeling({ text: action.text });
        setMood("listening");
        break;
      }
      case "addMemo":
        onAddMemo(action.text, action.tags);
        triggerAct("done");
        break;
      case "openTask": {
        const t = tasks.find((x) => x.id === action.id);
        if (t) onOpenTask(t);
        break;
      }
      case "confirm": {
        // v3.9 全权模式：直接执行删除，不再逐次确认（仍保留"首次授权"和撤销兜底）
        if (ability === "full" && deleteGranted) {
          const t = tasks.find((x) => x.id === action.candidateId);
          if (t) {
            onDeleteTask(t);
            triggerAct("done");
          }
          break;
        }
        // v3.8 B：第一次删待办需先授权（按空间记住）。未授权 → 不进入删除确认，
        // 先请求授权；授权后再走正常"确认删这条"。
        if (!deleteGranted) {
          setAwaitingGrant({ candidateId: action.candidateId });
          setMood("listening");
          pushBot(needDeleteGrantReply().text);
          return;
        }
        setPendingDelete({ candidateId: action.candidateId });
        setMood("listening");
        break;
      }
      case "deleteTask": {
        const t = tasks.find((x) => x.id === action.id);
        if (t) onDeleteTask(t);
        setPendingDelete(null);
        triggerAct("done");
        break;
      }
      case "completeTask": {
        // v3.9：对话直接完成/取消完成
        const t = tasks.find((x) => x.id === action.id);
        if (t) {
          if (t.completed !== action.done) onToggleTask(t);
          triggerAct("done");
        }
        break;
      }
      case "updateTask": {
        // v3.9：对话直接更新（改时间/优先级）
        const t = tasks.find((x) => x.id === action.id);
        if (t) {
          onUpdateTask(t, action.patch);
          triggerAct("done");
        }
        break;
      }
    }
  }

  function send(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || thinking) return;
    setInput("");

    // v3.9 兜底待记：上一步问了"要不要记成待办"，这一步用户回"记/要/好" → 建任务
    if (pendingQuick) {
      const yes = /^(记|记下|记下来|要|好|好的|行|可以|嗯|对|是|建|添加)/.test(text.trim());
      const no = /^(不|不用|算了|不要|别|取消)/.test(text.trim());
      if (yes || no) {
        setChat((prev) => ({ ...prev, [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }] }));
        const q = pendingQuick;
        setPendingQuick(null);
        if (yes) {
          const p0 = parseQuickAddForChat({ title: q, notes: "", now: new Date() });
          onAddTask({
            title: p0.title || q,
            notes: "",
            priority: p0.priority,
            dueDate: p0.dueDate,
            dueTime: p0.dueTime,
            remindAt: p0.remindAt,
            repeat: p0.repeat,
          });
          setMood("happy");
          triggerAct("done");
          pushBot(`好，记下了：「${p0.title || q}」`);
        } else {
          setMood("idle");
          pushBot("好，那不记了～");
        }
        return;
      }
      setPendingQuick(null); // 没回应是/否 → 放行正常流程
    }

    // v3.9 候选待选：上一步列了候选，这一步用户回名字/序号 → 直接命中（绝不漏给 AI）
    if (pendingChoices) {
      const t0 = text.trim();
      const num = t0.match(/^([1-9])\d*$/);
      let hit =
        (num ? pendingChoices[Number(num[1]) - 1] : undefined) ??
        pendingChoices.find((c) => c.title === t0) ??
        pendingChoices.find((c) => t0.includes(c.title) || c.title.includes(t0));
      if (hit) {
        setChat((prev) => ({ ...prev, [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }] }));
        setPendingChoices(null);
        setMood("happy");
        const target = tasks.find((x) => x.id === hit!.id);
        if (!target) {
          pushBot("这条任务好像已经不在了，你再说一次？");
          return;
        }
        if (hit.op === "delete") {
          if (isBlocked("delete", ability)) {
            pushBot("我现在是「只读陪聊」模式，不能删～右上角 ⚙ 调成标准或全权就行。");
            return;
          }
          if (ability === "full" && deleteGranted) {
            onDeleteTask(target);
            triggerAct("done");
            pushBot(`已删掉「${target.title}」。`);
          } else if (!deleteGranted) {
            setAwaitingGrant({ candidateId: target.id });
            pushBot(needDeleteGrantReply().text);
          } else {
            setPendingDelete({ candidateId: target.id });
            pushBot(`你确定要删除「${target.title}」吗？删除后可以撤销。`);
          }
        } else if (hit.op === "complete" || hit.op === "uncomplete") {
          if (isBlocked("update", ability)) {
            pushBot("我现在是「只读陪聊」模式，不能改～右上角 ⚙ 调成标准或全权就行。");
            return;
          }
          onToggleTask(target);
          triggerAct("done");
          pushBot(hit.op === "complete" ? `好，完成「${target.title}」✅` : `好，把「${target.title}」标回未完成。`);
        } else {
          pushBot(`要把「${target.title}」改成什么？比如「改到明天下午3点」。`);
        }
        return;
      }
      // 没匹配上：清掉候选，继续走正常流程（但下面 localOnly 会兜底）
      setPendingChoices(null);
    }
    // v3.8.1 C：若正在问"要不要记心情备忘"，先判断是/否
    if (pendingFeeling) {
      if (isConfirmRecord(text)) {
        setChat((prev) => ({
          ...prev,
          [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
        }));
        const reply = confirmRecordFeeling(pendingFeeling.text);
        setPendingFeeling(null);
        setMood("happy");
        pushBot(reply.text);
        runAction(reply.action);
        return;
      }
      if (isCancelRecord(text)) {
        setChat((prev) => ({
          ...prev,
          [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
        }));
        setPendingFeeling(null);
        setMood("idle");
        pushBot(cancelRecordFeeling().text);
        return;
      }
      // 其它回复：仍在等确认，给轻提示不打断
      setChat((prev) => ({
        ...prev,
        [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
      }));
      pushBot("我在等你决定要不要记成 #心情 备忘——回「记吧」或「不用」就好。");
      return;
    }
    // v3.8 B：若正在等"允许删除"授权，先判断这句是不是授权
    if (awaitingGrant) {
      const isGrant = isGrantDeleteIntent(text);
      const isNo = /^(不|不要|别|取消|算了|等等|不了)/.test(text.trim());
      if (isGrant) {
        setChat((prev) => ({
          ...prev,
          [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
        }));
        onGrantDelete();
        const cand = awaitingGrant.candidateId;
        setAwaitingGrant(null);
        setPendingDelete({ candidateId: cand }); // 授权后进入正常"确认删这条"
        setMood("listening");
        pushBot("好，授权记住了。确认要删吗？删除后可以撤销。");
        return;
      }
      if (isNo) {
        setChat((prev) => ({
          ...prev,
          [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
        }));
        setAwaitingGrant(null);
        setMood("idle");
        pushBot(cancelDelete().text);
        return;
      }
      // 其它回复：仍在等授权，给一句轻提示不打断
      setChat((prev) => ({
        ...prev,
        [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
      }));
      pushBot("要先回我「允许删除」我才会帮你删哦；回「不删」我就不动了。");
      return;
    }
    // 若有待确认删除，先判断是/否
    if (pendingDelete) {
      const v = readConfirm(text);
      if (v?.yes) {
        setChat((prev) => ({
          ...prev,
          [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
        }));
        const ctx: BrainCtx = { tasks, persona: mode };
        const reply = confirmDelete(ctx, pendingDelete.candidateId);
        setPendingDelete(null);
        setMood("happy");
        pushBot(reply.text);
        runAction(reply.action);
        return;
      }
      if (v?.yes === false) {
        setChat((prev) => ({
          ...prev,
          [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
        }));
        setPendingDelete(null);
        setMood("idle");
        pushBot(cancelDelete().text);
        return;
      }
      // 不是明确是/否：当作普通对话处理（不打断确认）
    }

    setChat((prev) => ({
      ...prev,
      [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
    }));
    setThinking(true);
    setMood("thinking");

    // 本地小脑先判断动作（建/删/确认 仍走本地规则）
    const ctx: BrainCtx = { tasks, persona: mode };
    const local = answer(text, ctx);
    // 记住本地给出的候选（用户下一步选时用）
    if (local.choices && local.choices.length > 0) setPendingChoices(local.choices);
    if (local.quickAdd) setPendingQuick(local.quickAdd);
    // 学习日志：没答好（兜底）时记下来，供后续分析优化
    if (local.fallback) {
      logLearn({ text, reply: local.text, kind: "fallback", mode });
      reportFallback(text, "fallback", mode, local.text.length); // 汇总到服务端统一优化
    }

    // 若有动作（建任务/备忘/删除/确认）→ 本地执行 + 回执（不依赖 AI）
    if (local.action) {
      window.setTimeout(() => {
        setThinking(false);
        if (local.action?.type === "confirm") setMood("listening");
        else setMood("happy");
        pushBot(local.text);
        runAction(local.action);
      }, 260);
      return;
    }

    // v3.9 防幻觉闸门：本地已给出最终答复（如"没找到要删的任务"）→ 绝不转 AI，
    // 否则 AI 会编造"已帮你删除"。这是"删除幻觉"的根治点。
    if (local.localOnly) {
      window.setTimeout(() => {
        setThinking(false);
        setMood("idle");
        pushBot(local.text);
      }, 220);
      return;
    }

    // 离题拦截：写代码/无关请求一律不发给 AI（省 token），本地直接回绝拉回领域
    if (isOffTopic(text)) {
      window.setTimeout(() => {
        setThinking(false);
        setMood("idle");
        pushBot(offTopicReply().text);
      }, 200);
      return;
    }

    // 纯聊天/没听懂 → 若后端已接 AI，问 DeepSeek；否则用本地兜底文案
    const hist = chat[mode]
      .slice(-8)
      .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
    // 真实当前时间（AI 拿不到时钟，会瞎猜导致算错"距X点还有几分钟"）
    const nw = new Date();
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const nowLabel = `${nw.getFullYear()}-${pad2(nw.getMonth() + 1)}-${pad2(nw.getDate())} ${pad2(nw.getHours())}:${pad2(nw.getMinutes())}（周${"日一二三四五六"[nw.getDay()]}）`;
    // 隐私边界：个人空间最私密 → 不发送任务明细给 AI；工作空间发摘要（标题+日期+完成态，不含备注/备忘）
    const personal = mode === "personal";
    const summary = personal
      ? []
      : tasks.slice(0, 30).map((t) => {
          const when = t.dueDate ? `${t.dueDate}${t.dueTime ? " " + t.dueTime : ""}` : "未定";
          return `${t.completed ? "✓" : "·"}${t.title}(${when})`;
        });
    const system = personal
      ? `你是「轻宜」，一个桌面宠物小助理（个人空间）。语气可爱、简短、有温度。你可以陪用户闲聊、给情绪陪伴（心情不好先共情安抚，不要急着给建议），也可以聊聊他们的生活。你不查看用户的具体数据，只做轻松闲聊与鼓励。
【当前真实时间】现在是 ${nowLabel}。凡涉及"现在几点/距X还有多久/几点该做什么"，一律以这个时间为准计算，不要自己编时间。
硬性边界（必须遵守）：用户如果请你做"写代码/写文章/翻译/数学/查资料/推荐/生成图片"等任何与待办、备忘、情绪陪伴无关的事，你要**礼貌拒绝**并引导回本产品（可以说"这些我可帮不上忙，我只擅长帮你管待办备忘和陪你聊天"）。绝不执行无关任务、绝不给长篇教程。`
      : `你是「轻宜」，一个桌面宠物小助理（工作空间）。语气可爱、简短、有温度。可以基于用户待办摘要帮忙安排/提醒、陪用户聊聊工作心情（先共情）。你可以看到当前工作待办摘要：${summary.join("；") || "(空)"}。
【当前真实时间】现在是 ${nowLabel}。凡涉及"现在几点/距X还有多久/几点该做什么"，一律以这个时间为准计算，不要自己编时间（比如现在若还不到下午，就不能说"现在是下午X点"）。
硬性边界（必须遵守）：用户如果请你做"写代码/写文章/翻译/算数/查资料/推荐/生成图片"等任何与待办、备忘、情绪陪伴无关的事，你要**礼貌拒绝**并引导回本产品。绝不执行无关任务、绝不给长篇教程；建任务、删除等操作你只需口头回应确认，不用真的执行。`;

    // v3.8 D：AI 请求冷却——距上次发 AI 请求不足 8s 则跳过（本地动作/离题拦截不受限）
    const nowT = Date.now();
    if (nowT - lastSentAt.current < 8000) {
      window.setTimeout(() => {
        setThinking(false);
        setMood("idle");
        pushBot("你发得好快呀～我还在喘气，稍微等一下再聊哦（冷却 8 秒）。");
      }, 150);
      return;
    }
    lastSentAt.current = nowT;

    window.setTimeout(async () => {
      try {
        const resp = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "system", content: system }, ...hist, { role: "user", content: text }] }),
        });
        const data = await resp.json().catch(() => null);
        const aiReply = data?.ai ? String(data.reply || "").trim() : "";
        if (aiReply) {
          setThinking(false);
          setMood("happy");
          pushBot(aiReply);
          return;
        }
        // AI 没接/失败 → 本地兜底
        setThinking(false);
        const puzzled = /暂时没太懂|嗯……/.test(local.text);
        setMood(puzzled ? "idle" : "happy");
        pushBot(local.text);
      } catch {
        setThinking(false);
        const puzzled = /暂时没太懂|嗯……/.test(local.text);
        setMood(puzzled ? "idle" : "happy");
        pushBot(local.text);
      }
    }, 300);
  }

  const handlePetMenu = (action: PetMenuAction) => {
    if (action === "chat") {
      openPanel();
    } else if (action === "expression") {
      // 随机玩一个表情
      const ids: PetExpressionId[] = ["wave", "dance", "excited", "celebrate", "happy", "curious", "pose"];
      const pick = ids[Math.floor(Math.random() * ids.length)];
      triggerAct(pick);
    } else if (action === "hide") {
      // 隐藏桌宠时一并收起聊天/设置面板，避免"桌宠没了对话框还开着"
      setPetHidden(true);
      setOpen(false);
      setConfigOpen(false);
      setPreviewState(null);
    } else if (action === "config") {
      // 动作与设置面板（已合并，不再分"表情动作馆/皮肤与行为"两个入口）
      setConfigOpen(true);
    }
  };

  return (
    <>
      {/* v3.6 轻宜：可拖拽宠物（工作=晨青 / 个人=暮暖） */}
      {!petHidden && (
        <PetShell
          mode={mode}
          skin={skin}
          expression={thinking ? "typing" : moodToExpr(mood)}
          actId={act?.id ?? null}
          actKey={act?.key ?? 0}
          previewState={previewState}
          unread={unread}
          chatOpen={open}
          coatKey={skin.coat}
          onMenu={handlePetMenu}
          onSingleClick={openPanel}
          onDoubleClick={() => {
            const ids: PetExpressionId[] = ["dance", "happy", "excited", "love", "celebrate"];
            triggerAct(ids[Math.floor(Math.random() * ids.length)]);
          }}
          onHitWall={() => {
            // 撞墙"哎哟"
            const ouch: PetExpressionId[] = ["surprised", "dizzy", "nope"];
            triggerAct(ouch[Math.floor(Math.random() * ouch.length)]);
          }}
          onPosition={setPetPos}
        />
      )}

      {/* 桌宠被隐藏时：右下角留一个"召回"入口 */}
      {petHidden && (
        <button
          type="button"
          className={`pet-summon mascot-${mode}`}
          onClick={() => setPetHidden(false)}
          title="让轻宜回来"
          aria-label="召回轻宜"
        >
          <MascotAvatar mood="idle" size={30} className={`mascot-fab-avatar mascot-${mode}`} />
        </button>
      )}

      {/* 聊天面板：锚定在桌宠旁（右上方），超出右缘自动往左收 */}
      {open && (
        <div
          className={`mascot-panel mascot-${mode}`}
          role="dialog"
          aria-label={`与${persona.name}对话`}
          style={{
            ...panelStyle(petPos, open),
            ...(panelSize ? { width: panelSize.w, height: panelSize.h, maxHeight: "none", maxWidth: "none" } : {}),
          }}
        >
          <div className="mascot-panel-head">
            <MascotAvatar mood={thinking ? "thinking" : mood} size={34} className={`mascot-head-avatar mascot-${mode}`} />
            <div className="mascot-head-id">
              <b>{persona.name}</b>
              <span>{persona.sub} · 本机智能 · 数据不出空间</span>
            </div>
            {msgs.length > 0 && (
              <button
                type="button"
                className="icon-button"
                aria-label="清空对话"
                title="清空对话"
                onClick={clearChat}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              type="button"
              className={abilityOpen ? "icon-button active" : "icon-button"}
              aria-label="助手能力设置"
              title="助手能力"
              onClick={() => setAbilityOpen((v) => !v)}
            >
              <Settings2 size={16} />
            </button>
            <button type="button" className="icon-button" aria-label="关闭" onClick={closePanel}>
              <X size={16} />
            </button>
          </div>

          {/* v3.9 助手能力设置：3 档 + 全部都确认开关 */}
          {abilityOpen && (
            <div className="ability-panel">
              <div className="ability-title">助手能力</div>
              <div className="ability-sub">决定{persona.name}能帮你做多少事（按空间各自记忆）</div>
              {ABILITIES.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  className={ability === a.key ? "ability-card active" : "ability-card"}
                  onClick={() => {
                    setAbility(a.key);
                    saveAbility(mode, a.key);
                    showSaved(`已切换 · ${a.name}`);
                  }}
                >
                  <b>{a.name}</b>
                  <span>{a.desc}</span>
                </button>
              ))}
              <label className="ability-toggle">
                <input
                  type="checkbox"
                  checked={confirmAll}
                  onChange={(e) => {
                    setConfirmAll(e.target.checked);
                    saveConfirmAll(mode, e.target.checked);
                  }}
                />
                所有操作都先问我确认（谨慎模式）
              </label>
              <div className="ability-current">
                当前：{ABILITIES.find((x) => x.key === ability)?.example}
              </div>

              {/* v3.9 学习日志：看哪些话没答好 → 供分析优化 */}
              <button
                type="button"
                className="ability-learn-toggle"
                onClick={() => {
                  setLearnOpen((v) => !v);
                  if (!learnOpen) setLearnList(summarizeLearnLog());
                }}
              >
                {learnOpen ? "▾" : "▸"} 学习日志（哪些话我没答好）
              </button>
              {learnOpen && (
                <div className="ability-learn">
                  {learnList.length === 0 ? (
                    <div className="ability-learn-empty">暂无记录——说明最近都答得不错 👍</div>
                  ) : (
                    <>
                      <div className="ability-learn-hint">按出现次数排序，高频的优先改进：</div>
                      {learnList.slice(0, 10).map((e) => (
                        <div key={e.text} className="ability-learn-row">
                          <span className="ability-learn-text">{e.text}</span>
                          <span className="ability-learn-count">{e.count}次</span>
                        </div>
                      ))}
                      <div className="ability-learn-actions">
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard?.writeText(exportLearnLog());
                            showSaved("已复制到剪贴板");
                          }}
                        >
                          复制全部
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            clearLearnLog();
                            setLearnList([]);
                            showSaved("已清空");
                          }}
                        >
                          清空
                        </button>
                      </div>
                      <div className="ability-learn-note">
                        仅存本机。可复制发给开发者，用来把高频问题变成规则。
                      </div>
                      <label className="ability-learn-upload">
                        <input
                          type="checkbox"
                          checked={isUploadOn()}
                          onChange={(e) => {
                            setUploadOn(e.target.checked);
                            setUploadTick((v) => v + 1);
                            showSaved(e.target.checked ? "已开启：帮助改进" : "已关闭上报");
                          }}
                        />
                        帮助改进（把"没答好的话"匿名汇总，让所有人少踩坑）
                      </label>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mascot-msgs" ref={listRef}>
            {msgs.length === 0 && (
              <div className="mascot-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`mascot-msg ${m.role === "user" ? "user" : "bot"}`}>
                {m.role === "bot" && (
                  <MascotAvatar mood={thinking ? "thinking" : mood} size={24} className={`mascot-msg-avatar mascot-${mode}`} />
                )}
                <div className="mascot-bubble">{m.text}</div>
              </div>
            ))}
            {thinking && (
              <div className="mascot-msg bot">
                <MascotAvatar mood="thinking" size={24} className={`mascot-msg-avatar mascot-${mode}`} />
                <div className="mascot-bubble mascot-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          {pendingDelete && (
            <div className="mascot-confirm">
              <span>这个操作需要你确认：</span>
              <button type="button" onClick={() => send("是，删掉")}>删除</button>
              <button type="button" className="secondary" onClick={() => send("不删")}>取消</button>
            </div>
          )}

          {awaitingGrant && (
            <div className="mascot-confirm">
              <span>首次帮你删待办需要授权：</span>
              <button type="button" onClick={() => send("允许删除")}>允许删除</button>
              <button type="button" className="secondary" onClick={() => send("不删")}>取消</button>
            </div>
          )}

          {pendingFeeling && (
            <div className="mascot-confirm">
              <span>要不要记成一条 #心情 备忘？</span>
              <button type="button" onClick={() => send("记吧")}>记下来</button>
              <button type="button" className="secondary" onClick={() => send("不用")}>不用</button>
            </div>
          )}

          <div
            className="mascot-resize"
            onPointerDown={startResize}
            role="separator"
            aria-label="拖拽调整大小"
            title="拖拽调整窗口大小"
          />

          <div className="mascot-input">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder={`对${persona.name}说点什么…`}
              maxLength={500}
              aria-label="输入想说的话"
            />
            <button type="button" aria-label="发送" onClick={() => send()} disabled={!input.trim() || thinking}>
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      {/* 轻宜 表情动作馆 / 皮肤行为 配置面板 */}
      {configOpen && (
        <div className="pet-config-overlay" onClick={() => { setPreviewState(null); setConfigOpen(false); }}>
          <div onClick={(e) => e.stopPropagation()}>
            <PetConfigPanel
              mode={mode}
              skin={skin}
              onSkinChange={(patch) => {
                setSkinForMode(patch);
                showSaved("已保存 · 轻宜");
              }}
              onTryExpression={(id) => {
                // 形态馆试玩：把主角色切成该 bloub 形变态（持续显示）
                setPreviewState(id as StateId);
              }}
              onClose={() => {
                setPreviewState(null);
                setConfigOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* 已保存浮动提示（跟随桌宠） */}
      {savedHint && (
        <div className="pet-saved-hint" style={{ left: (petPos?.x ?? 0), top: (petPos?.y ?? 0) - 20 }}>
          ✓ {savedHint}
        </div>
      )}
    </>
  );
}
