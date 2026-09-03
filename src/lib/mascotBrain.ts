import type { QuickAddParse, Task } from "../types";
import { isOverdue } from "./tasks";
import { parseQuickAdd } from "./nlp";

/**
 * 吉祥物本地小脑。
 *
 * 设计意图：当前阶段用「规则 + 复用 parseQuickAdd」先把壳做活（能建任务/备忘、
 * 能查今天明天、能操作确认），避免死板的同时也不接外部 API。
 *
 * 未来接真实模型（Claude / DeepSeek / 自托管 Qwen）时，只替换 `answer()` 的实现：
 * 它吃统一的 `BrainCtx`、吐统一的 `BrainReply`，动作交由调用方（MascotAssistant）执行。
 */

export type MascotPersona = "work" | "personal";

export interface BrainCtx {
  /** 当前空间任务（只含该空间数据，隐私隔离由 App 层保证） */
  tasks: Task[];
  persona: MascotPersona;
  now?: Date;
}

export type BrainAction =
  | { type: "addTask"; parsed: QuickAddParse }
  | { type: "addMemo"; text: string }
  | { type: "openTask"; id: string }
  | { type: "confirm"; candidateId: string }
  | { type: "deleteTask"; id: string };

export interface BrainReply {
  /** 给用户看的话 */
  text: string;
  /** 若有动作，由调用方执行 */
  action?: BrainAction;
  /** 是否在等待用户确认（配合 confirm 动作） */
  awaitingConfirm?: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtTask(t: Task): string {
  const when = t.dueDate ? `${t.dueDate}${t.dueTime ? " " + t.dueTime : ""}` : "未设日期";
  return `${t.completed ? "✓" : "·"} ${t.title}（${when}）`;
}

/** 展示日期：`09-02 今天` / `09-03 明天` 之类 */
function niceDay(d: Date, now: Date): string {
  const key = dateKey(d);
  const today = dateKey(now);
  if (key === today) return "今天";
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (key === dateKey(tomorrow)) return "明天";
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------- 主动搭话文案 ----------

/** 登录/刷新后的主动提醒：今天有什么、逾期几条、明天有什么 */
export function morningNudge(ctx: BrainCtx): string {
  const now = ctx.now ?? new Date();
  const today = dateKey(now);
  const openToday = ctx.tasks.filter((t) => !t.completed && (t.dueDate === today || isOverdue(t, now)));
  const overdue = ctx.tasks.filter((t) => isOverdue(t, now));
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tKey = dateKey(tomorrow);
  const tomorrowList = ctx.tasks.filter((t) => !t.completed && t.dueDate === tKey);

  const parts: string[] = [];
  const hour = now.getHours();
  const greet = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  if (openToday.length > 0) {
    const first = openToday[0];
    const t = first.dueTime ? ` ${first.dueTime}` : "";
    parts.push(`${greet}～今天你有 ${openToday.length} 件待办，最早的是「${first.title}」${t}。`);
  } else {
    parts.push(`${greet}～今天还没有安排，要不要给自己安排一件小事？`);
  }
  if (overdue.length > 0) parts.push(`另外有 ${overdue.length} 条已经逾期了，要处理吗？`);
  if (tomorrowList.length > 0) parts.push(`明天还有 ${tomorrowList.length} 件事，可以提前看看。`);
  return parts.join(" ");
}

/** 闲置时的随机搭话 */
export function idleChatter(ctx: BrainCtx): string {
  const now = ctx.now ?? new Date();
  const today = dateKey(now);
  const openToday = ctx.tasks.filter((t) => !t.completed && (t.dueDate === today || isOverdue(t, now)));
  const templates: Array<() => string> = [
    () => {
      const hour = now.getHours();
      return hour < 12 ? "我一直在哦～今天有什么想做、想记的吗？" : "累的话说一声，我帮你把待办理一理？";
    },
    () => {
      if (openToday.length === 0) return "看起来今天挺轻的，要我说说现在有什么能做的吗？";
      return `提醒你一下，今天还有 ${openToday.length} 件待办没收尾，要我列出来看看吗？`;
    },
    () => "有事随时叫我——'帮我记个事'、'建个待办'都可以。",
  ];
  const pick = templates[Math.floor(Math.random() * templates.length)];
  return pick();
}

/** 一段时间没操作时的贴心提醒（基于未来任务倒计时） */
export function lullChatter(ctx: BrainCtx): string {
  const now = ctx.now ?? new Date();
  // 未来 2 小时内有截止时间的未完成任务
  const soon = ctx.tasks.filter((t) => {
    if (t.completed || !t.dueDate) return false;
    const due = new Date(`${t.dueDate}T${t.dueTime || "23:59"}:59`).getTime();
    const gap = due - now.getTime();
    return gap > 0 && gap <= 2 * 60 * 60 * 1000;
  });
  if (soon.length > 0) {
    const t = soon[0];
    return `${t.dueTime || ""} 有「${t.title}」，要不要先准备一下？`;
  }
  return idleChatter(ctx);
}

// ---------- 对话 ----------

/** 判断文本是否意图"删除/清理某任务"：抽出候选标题关键字 */
function tryDelete(raw: string, ctx: BrainCtx): BrainReply | null {
  const del = /(删|删除|清掉|去掉|移除|划掉)/.test(raw);
  if (!del) return null;
  const kw = raw.replace(/(帮我|请|你|把|那|个|这条|这个|任务|待办|删掉|删除|清掉|去掉|移除|划掉|一下)/g, "").trim();
  // 找标题包含关键字的未完成任务
  const candidates = ctx.tasks.filter((t) => kw && t.title.includes(kw));
  if (candidates.length === 0) {
    return { text: "抱歉，我没找到要删的任务。能说得更具体一点吗？比如'删掉 开会'。" };
  }
  if (candidates.length === 1) {
    const t = candidates[0];
    return {
      text: `你确定要删除「${t.title}」吗？删除后可以撤销。`,
      awaitingConfirm: true,
      action: { type: "confirm", candidateId: t.id },
    };
  }
  // 多个候选：让用户确认是哪一个
  const list = candidates.map((t, i) => `${i + 1}. ${t.title}`).join("\n");
  return { text: `找到几个任务，你说哪一个？\n${list}` };
}

/** 判断文本是否"建备忘录" */
function tryAddMemo(raw: string): BrainReply | null {
  const m = raw.match(/(?:记到|写进|存到|加到|放进)?(?:备忘录|记事本|备注)(?:里|中|上面)?[:：]?\s*(.+)/);
  if (!m) return null;
  const text = m[1].trim();
  if (!text) return null;
  // 去掉结尾语气词
  const cleaned = text.replace(/^(帮我|请|麻烦)/, "").trim();
  return { text: `好，我记到备忘录里了：\n「${cleaned}」`, action: { type: "addMemo", text: cleaned } };
}

/** 判断是否"建待办/任务"（自然语言日期交给 parseQuickAdd） */
function tryAddTask(raw: string): BrainReply | null {
  // 命中"建/加/记一下/安排"等动作意图
  const trigger = /(建|添加|加个|记一下|记个|记下来|安排|提醒我|帮我约|帮我排|设个|新建|创建|放一个|存个)/.test(raw);
  if (!trigger) return null;
  // 抽取干净标题：去掉"帮我/建一个/待办"等引导词（保留时间词，交给 NLP 解析）
  const cleaned = raw
    .replace(/^(请|麻烦|你|好呀|好的|可以|那个|一下)/, "")
    .replace(/(建一个|建个|添加一个|添加|记一下|记个|记下来|安排一下|安排个|设个|新建|创建|提醒我|帮我记|帮我|请你|给我|替我)/g, " ")
    .replace(/(待办|任务|个会|会议|一个事项|事项)/g, " ")
    .replace(/[:：]\s*$/, "")
    .replace(/[，。！？\s]+/g, " ")
    .trim();
  // 抽取后没有实际内容（纯"帮我记个待办"）→ 引导补内容，不建空/无意义任务
  const fillers = /^(呢|啊|吧|呀|哦|嘛|吗|个|一下|了)*$/;
  if (!cleaned || fillers.test(cleaned)) {
    return { text: "想记什么待办呀？跟我说下内容就行，比如「明天下午3点交周报」。" };
  }
  // 判断是否有待办语义：待办标记词，或文本能解析出时间/日期
  const hasMarker = /(待办|任务|个会|会议|开会|约|安排|事件|事项|提醒|目标|行程|下午|上午|今晚|明天|今天|后天|周[一二三四五六日天]|月\d|点|号|日)/.test(raw);
  const probe = parseQuickAdd({ title: cleaned, notes: "", now: new Date() });
  const hasTime = probe.dueDate !== "" || probe.dueTime !== "";
  // 既不具待办语义、又解析不出时间 → 不当建任务（引导聚焦待办）
  if (!hasMarker && !hasTime) return null;
  // 交给 NLP：自动识别 明天/下午4点/每周一 等
  const parsed = parseQuickAdd({ title: cleaned, notes: "", now: new Date() });
  const nice = parsed.dueDate
    ? `${parsed.dueDate}${parsed.dueTime ? " " + parsed.dueTime : ""}`
    : "未设日期";
  return {
    text: `好，我帮你记下了：\n「${parsed.title}」\n⏰ ${nice}`,
    action: { type: "addTask", parsed },
  };
}

/** 判断是否"查询今天/明天/逾期安排"（必须有查询动词，避免把"建个待办明天开会"误判成查询） */
function tryQuery(raw: string, ctx: BrainCtx): BrainReply | null {
  const now = ctx.now ?? new Date();
  const today = dateKey(now);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tKey = dateKey(tomorrow);

  // 真正在"问"，而非"建/记"
  const ask = /(有什么|哪些|安排是|安排吧|查|列|看看|看下|盘点|汇总|忙什么|要做|待办是|有啥)/.test(raw) && !/(建|添加|加个|记下|记个|安排一个|安排个)/.test(raw);

  const askOverdue = ask && /(逾期|过期|拖欠|还没弄|没做完|未完成)/.test(raw);
  const askToday = ask && !/明天/.test(raw) && /(今天|今日|现在|当下|最近|本周)/.test(raw);
  const askTomorrow = ask && /明天/.test(raw);

  if (askOverdue) {
    const od = ctx.tasks.filter((t) => isOverdue(t, now));
    if (od.length === 0) return { text: "没有逾期的任务，很棒！" };
    const list = od.slice(0, 8).map(fmtTask).join("\n");
    return { text: `有 ${od.length} 条逾期了：\n${list}\n要我帮你逐个处理吗？` };
  }
  if (askToday) {
    const openToday = ctx.tasks.filter((t) => !t.completed && (t.dueDate === today || isOverdue(t, now)));
    if (openToday.length === 0) return { text: "今天没有安排，很轻松～要不要安排点小事？" };
    const done = ctx.tasks.filter((t) => t.completed);
    const list = openToday.slice(0, 8).map(fmtTask).join("\n");
    return { text: `今天有这些：\n${list}${done.length ? `\n已完成 ${done.length} 件` : ""}` };
  }
  if (askTomorrow) {
    const tomorrowList = ctx.tasks.filter((t) => !t.completed && t.dueDate === tKey);
    if (tomorrowList.length === 0) return { text: `明天（${niceDay(tomorrow, now)}）没有安排。` };
    const list = tomorrowList.slice(0, 8).map(fmtTask).join("\n");
    return { text: `明天（${niceDay(tomorrow, now)}）有 ${tomorrowList.length} 件：\n${list}` };
  }
  return null;
}

/** 判断是否问候/闲聊 */
function tryGreet(raw: string, ctx: BrainCtx): BrainReply | null {
  if (!/(你好|您好|嗨|hi|哈喽|hello|在吗|你是|你是谁|你叫什么|帮个忙)/i.test(raw)) return null;
  const now = ctx.now ?? new Date();
  const hour = now.getHours();
  const timeGreet = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  const persona = ctx.persona === "personal" ? "个人" : "工作";
  return {
    text: `${timeGreet}！我是你的${persona}助理，直接跟我说就行——比如「明天下午4点有个会，帮我记一下」，或者「把这段记到备忘录」。`,
  };
}

/** 用户对删除确认回答"是/删吧"：返回真正执行删除的动作 */
export function confirmDelete(ctx: BrainCtx, candidateId: string): BrainReply {
  const t = ctx.tasks.find((x) => x.id === candidateId);
  if (!t) return { text: "要删的任务已经不在了。" };
  return { text: `好的，我删掉「${t.title}」了。`, action: { type: "deleteTask", id: candidateId } };
}

/** 用户对删除确认回答"否/取消" */
export function cancelDelete(): BrainReply {
  return { text: "好，那我不动它。" };
}

/** 判断用户回复是否是针对待确认删除的"是/否"，返回确认方向或 null */
export function readConfirm(raw: string): { yes: boolean } | null {
  const yes = /^(是的?|是|确定|确认|删|删吧|好|好的|行|可以|去吧|嗯|对)/.test(raw.trim());
  const no = /^(不|不要|别|取消|算了|等等|先不了|嗯?不)/.test(raw.trim());
  if (yes) return { yes: true };
  if (no) return { yes: false };
  return null;
}

/** 明显偏离待办/备忘领域的话题（安全 & 省钱：不答、不发给 AI） */
const OFF_TOPIC = [
  "代码", "程序", "python", "javascript", "java", "写个函数", "debug", "bug",
  "帮我写", "生成图片", "画一幅", "写作文", "翻译一下", "网站", "爬虫",
  "加密货币", "股票预测", "彩票", "赌博", "违法", "破解", "黑客", "暴力",
  "色情", "成人", "毒品", "武器",
];
const OFF_TOPIC_RE = new RegExp(OFF_TOPIC.join("|"), "i");

/** 是否偏离领域（true = 不该答，只礼貌回绝并拉回待办） */
export function isOffTopic(raw: string): boolean {
  if (OFF_TOPIC_RE.test(raw)) return true;
  // 明显的"闲聊/问答"但完全没提任务备忘 → 不发给 AI 省 token（本地答兜底）
  return false;
}

/** 离题时的统一回绝话术（不消耗 AI） */
export function offTopicReply(): BrainReply {
  return {
    text: "这些我可答不上来——我是轻待办的小助理，只擅长帮你管待办和备忘。要不要试试「今天有什么安排」或「帮我记个待办」？",
  };
}

/** 主入口：把用户一句话变成回复（可带动作） */
export function answer(raw: string, ctx: BrainCtx): BrainReply {
  const text = raw.trim();
  if (!text) return { text: "嗯？我在听。你可以说'帮我建个待办'或'记到备忘录'。" };
  // 离题优先拦（不建任务不查询，直接拉回领域）
  if (isOffTopic(text)) return offTopicReply();
  const t = tryDelete(text, ctx);
  if (t) return t;
  const q = tryQuery(text, ctx);
  if (q) return q;
  const memo = tryAddMemo(text);
  if (memo) return memo;
  const task = tryAddTask(text);
  if (task) return task;
  const greet = tryGreet(text, ctx);
  if (greet) return greet;
  return {
    text: "嗯……我暂时没太懂这句。（当前我是本地小助手，还在学习更多玩法）你可以试试：\n• 「明天下午3点开会」→ 我帮你建待办\n• 「把这个记到备忘录」\n• 「今天有什么安排」",
  };
}
