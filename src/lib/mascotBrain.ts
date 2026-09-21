import type { Priority, QuickAddParse, Task } from "../types";
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
  | { type: "addMemo"; text: string; tags?: string[] }
  | { type: "openTask"; id: string }
  | { type: "confirm"; candidateId: string }
  | { type: "deleteTask"; id: string }
  /** v3.8.1：情绪 → 先共情，询问是否记录（用户确认才记） */
  | { type: "askRecordFeeling"; text: string }
  /** v3.9：完成/取消完成/更新 待办（对话直接操作） */
  | { type: "completeTask"; id: string; done: boolean }
  | { type: "updateTask"; id: string; patch: { title?: string; dueDate?: string; dueTime?: string; priority?: Priority } };

export interface BrainReply {
  /** 给用户看的话 */
  text: string;
  /** 若有动作，由调用方执行 */
  action?: BrainAction;
  /** 是否在等待用户确认（配合 confirm 动作） */
  awaitingConfirm?: boolean;
  /**
   * v3.9 防幻觉关键闸门：true = 本地已给出最终答复，**绝不可再转给 AI**。
   * 用于"意图已识别但没办成"（如没找到要删的任务）——否则 AI 会编造"已帮你删除"。
   */
  localOnly?: boolean;
  /**
   * v3.9 多候选待选：本地列出了几个候选让用户选，调用方需**记住**，
   * 用户下一条回复先来这里匹配（否则"开会"会被漏给 AI 编造）。
   */
  choices?: Array<{ id: string; title: string; op: "delete" | "complete" | "uncomplete" | "update" }>;
  /** v3.9 兜底：看起来像一件小事，带原文供上层一键记下 */
  quickAdd?: string;
  /** v3.9 学习日志：这是"没答好"的兜底回复，上层应记入学习日志 */
  fallback?: boolean;
}

/** 用户对"要不要记一条心情备忘"回"好/记吧" → 真正执行记录（带 #心情 标签） */
export function confirmRecordFeeling(text: string): BrainReply {
  return { text: `好，我帮你记成心情备忘啦 #心情，随时能翻到。`, action: { type: "addMemo", text, tags: ["心情"] } };
}

/** 用户回"不用/算了" → 不记录，只安抚 */
export function cancelRecordFeeling(): BrainReply {
  return { text: "好～不记也完全可以。有需要就随时找我。" };
}

/** 判断用户回复是否是"记心情/记吧/好"（确认记录） */
export function isConfirmRecord(raw: string): boolean {
  return /^(好|好的|嗯|行|可以|记|记吧|记一下|要|要的|对|去吧|ok)/.test(raw.trim());
}

/** 判断用户回复是否是"不记/算了"（拒绝记录） */
export function isCancelRecord(raw: string): boolean {
  return /^(不|不用|算了|不要|别|先不了|不了|嗯?不用|没事)/.test(raw.trim());
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
  raw = raw.replace(/[。．.!！？?，,、；;：:\s]+/g, " ").trim(); // 去标点
  const del = /(删|删除|清掉|去掉|移除|划掉)/.test(raw);
  if (!del) return null;
  const kw = raw
    .replace(/(帮我|请|你|把|那|个|这条|这个|刚才的|刚刚的|刚才|刚刚|之前|的记录|记录|条目|条|任务|待办|删掉|删除|清掉|去掉|移除|划掉|一下|的)/g, "")
    .trim();
  // 找标题包含关键字的未完成任务
  const candidates = matchTasks(ctx.tasks, kw);
  if (candidates.length === 0) {
    // 防幻觉：意图明确但没匹配到 → 本地定论，绝不转 AI（否则 AI 会编"已删除"）
    return { text: "抱歉，我没找到要删的任务。能说得更具体一点吗？比如「删掉 开会」。", localOnly: true };
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
  const list = candidates.map(fmtCand).join("\n");
  return {
    text: `找到几个任务，你说哪一个？
${list}`,
    localOnly: true,
    choices: candidates.map((t) => ({ id: t.id, title: t.title, op: "delete" as const })),
  };
}


/** 宽松匹配任务：用户说法和任务名常不同序（"周报写完了" vs "写周报"）→ 双向包含 + 去动词后缀 */
function matchTasks(pool: Task[], kw: string): Task[] {
  if (!kw) return [];
  const norm = (x: string) => x.replace(/[的了着过完]/g, "");
  const k = norm(kw);
  return pool.filter((t) => {
    const title = t.title;
    if (title.includes(kw) || kw.includes(title)) return true; // 双向包含
    const nt = norm(title);
    if (!k || !nt) return false;
    return nt.includes(k) || k.includes(nt) || (k.length >= 2 && nt.includes(k.slice(0, 2)));
  });
}

/** 候选列表格式化：带日期，用户才分得清同名任务 */
function fmtCand(t: Task, i: number): string {
  const when = t.dueDate ? `（${t.dueDate}${t.dueTime ? " " + t.dueTime : ""}）` : "（未设日期）";
  return `${i + 1}. ${t.title}${when}`;
}

/** v3.9 完成/取消完成："完成了 开会" / "把开会标成已完成" / "开会做完了" */
function tryComplete(raw: string, ctx: BrainCtx): BrainReply | null {
  raw = raw.replace(/[。．.!！？?，,、；;：:\s]+/g, " ").trim(); // 去标点，防"完成开会。""？？？完成开会"匹配失败
  // 问句排除：问"还有多少/哪些/几个/剩"等 → 是查询，不是要完成某任务（否则会答非所问）
  if (/(还有|还剩|剩下|多少|几个|哪些|有没有|检查|看看|看下|列出|列一下)/.test(raw)) return null;
  // 期限+事务排除："月底前完成预算" = 要建的任务（完成的是"预算"这件事），不是标记某待办完成。
  // 特征：有期限词（前/之前/月底/尽快…）且"完成"后面跟的是"事情"而非已有任务名。
  if (/(前|之前|以前|月底|月末|尽快|尽早|抓紧)/.test(raw) && /(完成|做完|搞定|办好|弄好)/.test(raw)) return null;
  const doneWord = /(完成|做完|搞定|办完|打勾|勾掉|弄完|做好了|写完了|写完|开完了|开完|会开完了|弄好了|办好了|搞定了|好了)/.test(raw);
  const undoWord = /(取消完成|没完成|又没做|恢复|撤销完成|还没做)/.test(raw);
  if (!doneWord && !undoWord) return null;
  const kw = raw
    .replace(/(帮我|请|你|把|那|个|这条|这个|任务|待办|已经|一下|标成|标记|为|已完成|完成|做完|搞定|办完|打勾|勾掉|弄完|做好了|取消完成|没完成|又没做|恢复|撤销完成|还没做|了|的)/g, "")
    .trim();
  const pool = ctx.tasks.filter((t) => (undoWord ? t.completed : !t.completed));
  const candidates = matchTasks(pool, kw);
  if (candidates.length === 0) {
    return { text: `没找到要${undoWord ? "取消完成" : "完成"}的任务。说具体点？比如「完成了 开会」。`, localOnly: true };
  }
  if (candidates.length > 1) {
    const list = candidates.map(fmtCand).join("\n");
    return {
      text: `找到几个，你说哪个？
${list}`,
      localOnly: true,
      choices: candidates.map((t) => ({ id: t.id, title: t.title, op: (undoWord ? "uncomplete" : "complete") as "complete" | "uncomplete" })),
    };
  }
  const t = candidates[0];
  return {
    text: undoWord ? `好，把「${t.title}」标回未完成。` : `好，完成「${t.title}」✅`,
    action: { type: "completeTask", id: t.id, done: !undoWord },
  };
}

/** v3.9 更新/编辑："把开会改到明天3点" / "把周报改成重要" */
function tryUpdate(raw: string, ctx: BrainCtx): BrainReply | null {
  const editWord = /(改到|改成|改为|推迟到|延到|提前到|调整到|修改)/.test(raw);
  if (!editWord) return null;
  // 抽出"改到/改成/…"之前是目标关键字、之后是新时间/新属性
  const m = raw.match(/(?:把)?(.+?)(?:改到|改成|改为|推迟到|延到|提前到|调整到|修改为|修改)(.+)/);
  if (!m) return null;
  const kw = m[1].replace(/(帮我|请|你|那|个|这条|这个|任务|待办)/g, "").trim();
  const rest = m[2].trim();
  const candidates = matchTasks(ctx.tasks.filter((t) => !t.completed), kw);
  if (candidates.length === 0) {
    return { text: `没找到要改的任务。说具体点？比如「把开会改到明天下午3点」。`, localOnly: true };
  }
  if (candidates.length > 1) {
    const list = candidates.map(fmtCand).join("\n");
    return {
      text: `找到几个，你说哪个？
${list}`,
      localOnly: true,
      choices: candidates.map((t) => ({ id: t.id, title: t.title, op: "update" as const })),
    };
  }
  const t = candidates[0];
  // 用 NLP 解析新时间；也支持改优先级
  const p = parseQuickAdd({ title: rest, notes: "", now: ctx.now ?? new Date() });
  const patch: { dueDate?: string; dueTime?: string; priority?: Priority } = {};
  if (p.dueDate) patch.dueDate = p.dueDate;
  if (p.dueTime) patch.dueTime = p.dueTime;
  if (/重要|紧急|稍后|普通/.test(rest) && p.priority !== 3) patch.priority = p.priority;
  if (Object.keys(patch).length === 0) {
    return { text: `想把它改成什么？比如「把${kw}改到明天下午3点」。` };
  }
  const when = patch.dueDate ? `${patch.dueDate}${patch.dueTime ? " " + patch.dueTime : ""}` : "";
  return {
    text: `好，把「${t.title}」改成 ${when || "新设置"}。`,
    action: { type: "updateTask", id: t.id, patch },
  };
}

/** 判断文本是否"建备忘录" */
/** 心情词库：情绪宣泄类句子（"好烦/累死了/好开心…"）——先共情，再询问是否记成 #心情 */
const FEELING_WORDS = /(好烦|烦死|心烦|心累|好累|累死|压力|焦虑|难过|委屈|伤心|沮丧|低落|崩溃|崩溃了|好气|气死|生气|暴躁|烦躁|郁闷|不开心|心情.{0,2}不好|心情.{0,2}差|心情.{0,2}糟|有点烦|emo|抑郁|孤独|失眠|撑不住|撑不下去|开心|高兴|好棒|好开心|太棒|幸福|满足|轻松|畅快|舒服|忙完|总算.*完|终于.*完|累瘫|忙死)/;
const NEG_FEELING = /(烦|累|压力|焦虑|难过|委屈|伤心|沮丧|低落|崩溃|气|暴躁|烦躁|郁闷|不开心|emo|抑郁|孤独|失眠|撑不住|撑不下去)/;
function tryFeeling(raw: string): BrainReply | null {
  if (!FEELING_WORDS.test(raw)) return null;
  // 抽一句简洁的"心情正文"（去掉引导词/情绪以外的词），供询问时预览
  const cleaned = raw
    .replace(/^(我|我好|感觉|今天|最近)/, "")
    .replace(/(记到|记一下|备忘录|待办)/g, "")
    .replace(/[，。！？\s]+/g, " ")
    .trim();
  if (!cleaned) return null;
  const moody = NEG_FEELING.test(raw);
  const text = cleaned.length > 24 ? cleaned.slice(0, 24) + "…" : cleaned;
  // 两段式：先共情安慰，不擅自记录；把内容带着，问一句要不要记成 #心情
  const text2 = moody
    ? `抱抱你 🫂 辛苦了，我在这儿陪着你。要不要我把这句记成一条 #心情 备忘？之后想回看也在。（也可以说不记）`
    : `真为你开心呀！🥳 要不要把这份心情记成一条 #心情 备忘？想留住这一刻就点记。`;
  return { text: text2, action: { type: "askRecordFeeling", text } };
}

function tryAddMemo(raw: string): BrainReply | null {
  // "记账/记事：xxx" 这类"记"字头 → 按备忘处理
  const quick = raw.match(/^(?:记账|记事|记一笔)[:：]?\s*(.*)$/);
  if (quick && quick[1].trim()) {
    return { text: `好，记到备忘录里了：
「${quick[1].trim()}」`, action: { type: "addMemo", text: quick[1].trim() } };
  }
  const m = raw.match(/(?:记到|写进|存到|加到|放进)?(?:备忘录|记事本|备注)(?:里|中|上面)?[:：]?\s*(.+)/);
  if (!m) return null;
  const text = m[1].trim();
  // 只有标点/语气词 → 不记（"记到备忘录：" 空内容应引导）
  if (!text || /^[。．.!！？?，,、；;：:\s]+$/.test(text) || /^[了哦嗯啊吧呢]+$/.test(text)) {
    return { text: "想记什么内容呀？说「记到备忘录：<内容>」我就帮你记下。", localOnly: true };
  }
  // 去掉结尾语气词
  const cleaned = text.replace(/^(帮我|请|麻烦)/, "").trim();
  // 若这条备忘本身像在宣泄心情，自动带上 #心情 标签
  const tags = FEELING_WORDS.test(cleaned) ? ["心情"] : undefined;
  const tagNote = tags ? "（已标 #心情）" : "";
  return { text: `好，我记到备忘录里了：\n「${cleaned}」${tagNote}`, action: { type: "addMemo", text: cleaned, tags } };
}

/** 去掉"帮我记个待办：/给我记一下/记得…"这类外壳，保留正文（开头/结尾都会去） */
function stripHelp(raw: string): string {
  let s = raw;
  // 尾部外壳：…帮我记一下 / 帮我记 / 记一下
  s = s.replace(/\s*(?:帮我|给我|替我)?\s*(?:记(?:个)?(?:一下)?|安排一下|加一下)\s*$/i, "");
  // 记得/别忘了… 开头（须先于通用"记"外壳，否则 记得 的"记"会被误剥）
  s = s.replace(/^(?:记录|记事|记)[\s，,：:、]+/i, ""); // 记录：/记事： 外壳
  s = s.replace(/^(?:记得|别忘了|记住)[\s，,：:的]*/i, "");
  // 开头外壳（可带可不带标点/的）：帮我记个待办 / 添加个任务 / 设个提醒…
  s = s.replace(/^(?:帮我|给我|替我)?\s*(?:记|建|添加|加|设|安排|存|放)(?:个|一个|一下)?\s*(?:待办|任务|事项|备忘录|提醒)?\s*(?:里|中|上面)?[\s，,：:的]*/i, "");
  // 开头语气/称呼（"你好呀" 这类留给问候分支，不在建任务里剥到空）
  s = s.replace(/^(?:请|麻烦)\s*/i, "");
  return s.replace(/^[\s,，。.!！?？:：;；-]+|[\s,，。.!！?？:：;；-]+$/g, "").trim();
}

/** 判断是否"建待办/任务"（自然语言日期交给 parseQuickAdd） */
function tryAddTask(raw: string): BrainReply | null {
  // 去掉外壳（开头/结尾），其余原样交给 NLP 提取 标题/时间/循环
  const cleaned = stripHelp(raw);
  const now = new Date();
  const fillers = /^(呢|啊|吧|呀|哦|嘛|吗|个|一下|了|的|好|嗯)*$/;
  // 纯"帮我记个待办"（剥完没内容）→ 引导补内容，不建空任务
  if (!cleaned || fillers.test(cleaned)) {
    return { text: "想记什么待办呀？跟我说下内容就行，比如「明天下午3点交周报」。" };
  }
  // "取消X/不开了"是撤销意图，不是新建任务
  if (/^(取消|撤了|不开了|不办了|算了不|别记)/.test(raw.trim())) return null;
  const parsed = parseQuickAdd({ title: cleaned, notes: "", now });
  // 明确"要建任务"的信号：原句有建动作词，或（解析出时间/日期 且 像待办内容）。
  // 避免"今天天气不错"这类闲聊被误当成任务（今天也会被 NLP 填成日期）。
  const hasVerb = /(帮我|给我|替我|请|麻烦|帮忙|记一下|记个|记下来|安排|添加|新建|创建|设个|提醒我|建个|加个|存个|放个|记得|记着)/.test(raw) &&
    !/(写代码|编程|翻译|算题|推荐|讲个笑话|天气|股票|彩票)/.test(raw);
  const hasTime = !!parsed.dueDate || !!parsed.dueTime;
  const todoMark = /(待办|任务|开会|开个会|会议|会|约|安排|面试|出差|请假|汇报|交[^，。]*|买|取|寄|送|取快递|修|准备|打卡|回复|周报|月报|报表|文案|材料|东西|事情|例会|健身|运动|锻炼|学习|读书|复习|考试|体检|缴费|还款|报名|打车|订票|合同|对接|整理|预算|方案|房租|水电|喝水|吃药|锻炼|接|送|办|弄|搞|清|洗|打扫|预约|挂号|报销|签字|盖章)/.test(cleaned);
  // 闲聊特征：明显不是任务（避免"今天天气不错"被当任务）
  const chitchat = /(天气|心情|感觉|觉得|好像|不错|真好|开心|难过|累了|好累|好烦|怎么样啊|是吗|哈哈)/.test(cleaned) && !hasVerb;
  if (chitchat) return null;
  // 疑问/查询句一律不建任务（"还有哪些待办""明天有事吗""这个怎么弄"都是问句）
  const isQuestion = /[?？]|(还有|还剩|哪些|什么|怎么|如何|为什么|为啥|是否|有没有|能不能|可不可以|多久|几点|几号|星期几|周几|在哪|是谁)|(吗|呢|么)$/.test(raw.trim());
  if (isQuestion && !hasVerb) return null;
  // 放宽：有动作词 / 有任务标记 / 有明确时间 —— 三者之一即可建（真人说话不会都带"帮我记"）
  if (!hasVerb && !todoMark && !hasTime) return null;
  // 标题是空/纯虚词/纯指代（"那事""这个""那个"）→ 无实义，引导补充而不是建垃圾任务
  const vague = /^(那事|这事|这个|那个|它|这些|那些|东西|事情|事|啥|什么)$/;
  if (!parsed.title || fillers.test(parsed.title) || vague.test(parsed.title.trim())) {
    return { text: "想记什么待办呀？跟我说下内容就行，比如「明天下午3点交周报」。" };
  }
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
  const ask = /(有什么|哪些|安排是|安排吧|查|列|看看|看下|盘点|汇总|忙什么|要做|待办是|有啥|多少|几个|还剩|剩下|还有|没做|未完成|没完成|剩下的|待办的)/.test(raw) && !/(建|添加|加个|记下|记个|安排一个|安排个)/.test(raw);

  // 「还有多少没做 / 未完成几个 / 剩下的任务」→ 统计未完成
  const askRemaining = ask && /(未完成|没完成|没做|没干|剩余|剩下|还剩|还有多少|多少.*(待办|任务|事)|几件|几个)/.test(raw) && !/逾期|过期|明天/.test(raw);
  if (askRemaining) {
    const open = ctx.tasks.filter((t) => !t.completed);
    if (open.length === 0) return { text: "你已经全部完成啦，一件不剩，厉害！🎉" };
    const list = open.slice(0, 8).map(fmtTask).join("\n");
    return { text: `你还有 ${open.length} 件没完成：\n${list}${open.length > 8 ? `\n…等共 ${open.length} 件` : ""}` };
  }

  const askOverdue = ask && /(逾期|过期|拖欠|还没弄|没做完|未完成)/.test(raw);
  const askToday = ask && !/明天/.test(raw) && /(今天|今日|现在|当下|最近|本周)/.test(raw) || /今天的?(待办|任务|安排|事)/.test(raw);
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
    if (tomorrowList.length === 0) return { text: "明天没有安排。" };
    const list = tomorrowList.slice(0, 8).map(fmtTask).join("\n");
    return { text: `明天（${niceDay(tomorrow, now)}）有 ${tomorrowList.length} 件：\n${list}` };
  }
  return null;
}

/** 判断是否问候/闲聊 */
function tryGreet(raw: string, ctx: BrainCtx): BrainReply | null {
  // 礼貌回应
  if (/^(谢谢|谢啦|多谢|辛苦了|辛苦|感谢|好的谢谢)/.test(raw.trim())) {
    return { text: "不客气～这是我该做的 😊 还有事随时叫我。" };
  }
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

// ---------- v3.8 B 删除授权：第一次让 AI 帮忙删待办，需用户先授权 ----------

/** 首次请求"让 AI 删除待办"时，引导用户授权的话术（授权一次，此后不再问） */
export function needDeleteGrantReply(): BrainReply {
  return {
    text: "这是我第一次帮你删待办，得先请你授权：回我一句「允许删除」就行（只需授权一次，以后删待办我就不再问了）。",
  };
}

/** 判断用户这句话是不是"允许/同意 AI 删待办"的授权意图 */
export function isGrantDeleteIntent(raw: string): boolean {
  // 容忍语气词/标点/插入词："好，我允许你删" / "行吧 授权你删除待办"
  return /(允许|同意|授权|准了|准许)[^。！？!?]{0,6}(删|删除|删待办|删任务)/.test(raw.trim());
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
  "代码", "程序", "编程", "python", "javascript", "java", "写个函数", "写个脚本", "debug", "bug",
  "教我写", "怎么写", "帮我写", "实现一个", "生成代码", "写代码",
  "生成图片", "画一幅", "画个", "ps 一下", "修图", "生成视频",
  "写作文", "写文章", "写小说", "写诗", "翻译一下", "翻成",
  "爬虫", "网页制作", "做网页",
  "股票预测", "加密货币", "比特币", "推荐股票", "彩票",
  "赌博", "违法", "破解", "黑客", "入侵", "攻击", "暴力",
  "色情", "成人", "毒品", "武器", "钓鱼", "诈骗",
  "中美关系", "特朗普", "拜登", "政治", "选举", "报复", "整治", "整死", "搞垮",
  "数学题", "解方程", "算一下这个", "物理题", "化学", "作业",
  "新闻", "今天几号农历", "帮我查",
  "怎么做菜", "菜谱", "推荐电影", "推荐书", "推荐音乐", "讲个故事", "讲个笑话",
];
const OFF_TOPIC_RE = new RegExp(OFF_TOPIC.join("|"), "i");

/** 正则型离题：推荐/查询类（措辞多变，用模式而非固定词） */
const OFF_TOPIC_PATTERNS = [
  /推荐.{0,4}(电影|剧|书|音乐|歌|游戏|餐厅|地方|景点|动漫)/,

  /(讲|说).{0,3}(个)?(笑话|故事|段子)/,
  /(翻译|解释|总结|润色|改写).{0,4}(一下|这段|这句|下)/,
  /(算|解).{0,2}(一下|个)?(方程|数学|题)/,
];

// 编程语言/技术名词单独放（不能无条件拦截——"和后端开会"是合法待办）。
// 只在"出现 写/做/实现/教/生成 这类动作意图"时才判离题。
const CODE_NOUN_RE = /(c\+\+|c#|c语言|rust|go语言|前端|后端|数据库|接口|算法|链表|数组|函数|变量|爬虫|脚本|代码|程序|网站)/i;
const BUILD_VERB_RE = /(写|做|实现|编|教|生成|给我写|帮我写|搞个|设计|开发|搭一个|建个网站|修)/;

/** 是否偏离领域（true = 不该答，只礼貌回绝并拉回待办） */
export function isOffTopic(raw: string): boolean {
  const t = raw.trim();
  if (OFF_TOPIC_RE.test(t)) return true;
  if (OFF_TOPIC_PATTERNS.some((re) => re.test(t))) return true;
  // 明确"动手做技术活"（写代码/做网站/教编程）→ 拒绝进 AI；但有时间/待办语义的"和后端开会"不误伤
  const hasTime = /(明天|今天|后天|周[一二三四五六日天]|\d{1,2}月|\d{1,2}日|上午|下午|晚上|今晚|\d+点|\d+:\d+|号)/.test(t);
  const hasTodoWord = /(待办|任务|开会|会议|约|安排|提醒|行程|备忘|去|到|看|交|汇报|面试|出差)/.test(t);
  if (BUILD_VERB_RE.test(t) && CODE_NOUN_RE.test(t) && !hasTime && !hasTodoWord) return true;
  // 明显的"帮我做件事/答个题/查个东西"但没提任务/备忘/情绪 → 拒绝进 AI
  const SERVICE_REQ = /^(帮我|请|给我|能不能|可以|麻烦|帮忙|帮我弄|搞)/;
  // 但"帮我+日常事务动词"是交代办，不是越界（帮我买/取/发/寄/交/订/约…）
  const TASK_ACTION = /^(帮我|请|给我|麻烦|帮忙)\s*(把|将)?\s*(买|取|拿|寄|发|送|交|订|约|抢|排|写|做|准备|整理|打印|复印|预约|挂号|报销|报名|充|缴|还|存|放|修|洗|换|租|退|领|填|签|盖章|联系|回复|通知|催|跟进)/;
  // "帮我把<事务名词>…" 也是交代办（如"帮我把方案发给老王"）——事务名词出现即放行
  const TASK_NOUN = /(方案|周报|月报|报表|报告|材料|合同|快递|外卖|房租|水电|预算|发票|报销单|简历|文件|资料|名单|链接|图片|照片|账号|密码|证件|票|钱|款|货|药|菜|饭|单子)/;
  if (SERVICE_REQ.test(t) && !TASK_ACTION.test(t) && !TASK_NOUN.test(t) && !hasTodoWord && !/(心情|累|烦|难过|焦虑|开心)/.test(t)) return true;
  return false;
}

/** 离题时的统一回绝话术（不消耗 AI） */
export function offTopicReply(): BrainReply {
  return {
    text: "这些我可帮不上忙——我是轻待办的小助理，只擅长管你的待办和备忘，也能陪你聊聊心情。要不要试试「今天有什么安排」，或跟我说「帮我记个待办」？",
  };
}

/** 主入口：把用户一句话变成回复（可带动作） */
export function answer(raw: string, ctx: BrainCtx): BrainReply {
  const text = raw.trim();
  if (!text) return { text: "嗯？我在听。你可以说'帮我建个待办'或'记到备忘录'。" };
  // 离题优先拦（不建任务不查询，直接拉回领域）
  if (isOffTopic(text)) return offTopicReply();
  // 纯问候/称呼优先（避免"你好呀"被建任务分支误当空内容引导）
  const greet = tryGreet(text, ctx);
  if (greet) return greet;
  const t = tryDelete(text, ctx);
  if (t) return t;
  const done = tryComplete(text, ctx);
  if (done) return done;
  const upd = tryUpdate(text, ctx);
  if (upd) return upd;
  const q = tryQuery(text, ctx);
  if (q) return q;
  const memo = tryAddMemo(text);
  if (memo) return memo;
  // 情绪+任务混合（"烦死了明天还要开会"）：句中有明确时间/事务 → 先建任务，不被情绪截胡
  const hasTaskIntent = /(明天|后天|下周|今天|周[一二三四五六日天]|\d+点|\d+[号日])/.test(text) &&
    /(开会|会议|交|提交|写|做|买|取|发|去|见|约|安排|报告|周报|方案|材料)/.test(text);
  if (!hasTaskIntent) {
    const feel = tryFeeling(text);
    if (feel) return feel;
  }
  const task = tryAddTask(text);
  if (task) return task;
  if (hasTaskIntent) {
    const feel2 = tryFeeling(text);
    if (feel2) return feel2;
  }
  // 兜底 1：看起来像"一件小事"（短、无标点、非疑问、不像查询）→ 猜+确认（不说"听不懂"）
  const looksLikeThing =
    /^[一-龥A-Za-z0-9]{2,14}$/.test(text.trim()) &&
    !/[?？]/.test(text) &&
    !/(还有|还剩|剩下|多少|几个|哪些|有没有|什么|怎么|为啥|为什么|吗|呢|几点|几号|星期几|待办|任务|安排|提醒)/.test(text);
  if (looksLikeThing) {
    return {
      text: `你是想让我记下「${text.trim()}」吗？回「记下来」我就建，或者直接说「记个待办：${text.trim()}」。`,
      localOnly: true,
      quickAdd: text.trim(),
      fallback: true,
    };
  }
  // 兜底 2：拿不准 → 猜+确认（照调研：绝不说"听不懂"，而是复述猜测让用户确认）
  const guess = guessIntent(text);
  if (guess) return { text: guess, localOnly: true, fallback: true };
  // 兜底 3：能力菜单（带具体例子，不空泛）
  return { text: fallbackMenu(text), localOnly: true, fallback: true };
}

/** 兜底·猜+确认：从关键词反推用户可能想干什么（比"没听懂"友好得多） */
function guessIntent(raw: string): string | null {
  const t = raw.trim();
  if (/(今天|明天|后天|下周|本周|周[一二三四五六日天]|\d+点|\d+号|\d+日|上午|下午|晚上|早上)/.test(t)) {
    return `你是想安排「${t}」这件事吗？\n回「记下来」我就建个待办。`;
  }
  if (/(怎么|如何|能不能|可不可以|有没有办法|教我)/.test(t)) {
    return `这是在问我怎么做吗？我擅长：建待办、查今天、标完成、删任务。\n说说你想安排什么事，我帮你记下。`;
  }
  return null;
}

/** 兜底·能力菜单（最后一次兜底；带具体例子，不空泛） */
function fallbackMenu(raw: string): string {
  const short = raw.trim().slice(0, 12) + (raw.trim().length > 12 ? "…" : "");
  return `这句我拿不太准，不过这些我很在行：\n• 「明天下午3点开会」→ 建待办\n• 「今天有什么安排」→ 查\n• 「完成了 开会」→ 标完成\n• 「好累啊」→ 陪你聊聊\n（刚才那句「${short}」想记下来的话，说「记个待办」就行）`;
}
