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
  /**
   * v3.9.23 🔴 一句话多件事：「明天开会，另外记得买牛奶」。
   *
   * 本地小脑只**识别**多件事并给出逐条草稿（纯函数好测），
   * 真正的入库交给界面层用和单条完全相同的通道（能力闸门、同步、updatedAt 都在那边）。
   * 每条各自带自己的标题和日期 —— 旧行为是把两件事拼成一条、只认第一个日期。
   */
  | { type: "addTasks"; items: Array<{ title: string; dueDate: string; dueTime: string; remindAt: string }> }
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
  choices?: Array<{
    id: string;
    title: string;
    op: "delete" | "complete" | "uncomplete" | "update" | "confirmDone";
    /** op === "confirmDone" 时：true=标完成，false=标回未完成 */
    done?: boolean;
  }>;
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
  /**
   * v3.9.20 🔴 禁止删除的句子绝不能走到删除流程（**会真删数据**）。
   *
   * 实测真 bug（用户报"AI 智障"级别的危险行为）：
   *   「别删除交房租那条」→ 回"你确定要删除「交房租」吗？" → 用户回"好的" → **真删了**
   * 而"别"在**句中**，旧的否定防护（放在别处、且只认句首）没拦住。
   * 这里加第一道闸：句中出现任何禁止/否定词 → 直接回"好，不删"，不进删除流程。
   * （"删掉"本身也可能出现在否定句里："这个不用删掉"，同样要拦）
   */
  if (/(别|不要|不用|甭|不需要|先别|暂时别|取消|算了|不删|别删)/.test(raw)) {
    return { text: "好，那我不删。", localOnly: true };
  }
  // 疑问句也不能触发删除（"开会删了吗"是在问，不是在让删）
  if (/(吗|呢|么|了没)\s*$/.test(raw) || /(是否|是不是|有没有)/.test(raw)) return null;
  /**
   * v3.9.23 🔴 纯指代（「把它删了」「刚说的那条删了」「刚才那个删掉」）——
   * 剥掉指代词和外壳词后**一个任务名都没剩**。
   *
   * 改任务（tryUpdate）早就支持指代，删除一直没跟上 → 一律回"没找到要删的任务"，
   * 用户会觉得"这 AI 瞎了"，而那条任务就明晃晃躺在列表里。
   *
   * ⚠️ 只在**剥完为空**时才走这条路：「把会议纪要删了」剥完还剩"会议纪要"（真关键词），
   * 走正常匹配，绝不能被当成指代而误删别的任务。
   */
  const pronounKw = pronounKeyword(raw);
  /**
   * ⚠️ 纯指代只在**没点名任何任务**时才成立。
   * `pronounKeyword` 会把"交房租"里的"交"当外壳词剥掉、剩下"房租"（真关键词）→ 不是指代；
   * 而「把它删了」「刚说的那条删了」剥完是空的 → 才走指代通道。
   */
  if (!pronounKw || pronounKw.length < 2) {
    const sole = soleOpenTask(ctx);
    if (sole) {
      return {
        text: `你确定要删除「${sole.title}」吗？删除后可以撤销。`,
        awaitingConfirm: true,
        action: { type: "confirm", candidateId: sole.id },
      };
    }
    const open = ctx.tasks.filter((t) => !t.completed);
    if (open.length === 0) {
      return { text: "你现在没有未完成的任务，没有可删的啦。", localOnly: true };
    }
    // 多条：不能瞎猜删哪条（猜错就是真删数据）→ 列出来让用户选
    return {
      text: `你想删哪一个？\n${open.map(fmtCand).join("\n")}`,
      localOnly: true,
      choices: open.map((t) => ({ id: t.id, title: t.title, op: "delete" as const })),
    };
  }
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


/**
 * v3.9.23 🔴 指代说法：「把它删了」「刚说的那条删了」「刚才那个标完成」——
 * 用户根本没提任务名，全靠"指"。
 *
 * 改任务（tryUpdate）早就支持指代，**删除和完成没跟上**，
 * 于是这两句一律回"没找到要删的任务"，用户会觉得"这 AI 瞎了"。
 *
 * ⚠️ 判据要**窄**：只有把指代词和外壳词全部剥完、剩下的关键词是空的时候才算指代。
 * 否则「把会议纪要删了」会被当成指代（"纪要"是真关键词，不该走指代通道）。
 * 实现见 `pronounKeyword`：只删这些固定词，删完还剩东西就不是指代。
 */
/**
 * 指代/外壳词表。⚠️ **长词必须排在短词前面** —— JS 的 `|` 是有顺序的，
 * 写成 `那|那个` 的话"那个"永远匹配不上"那"（会剩一个"个"字）。
 * 第一版就是这么写的，实测「把刚说的那个标完成」剥完剩下"个标"，
 * 于是被判成"用户在说一个叫『个标』的任务"。
 */
const PRONOUN_WORDS =
  /(帮我|请|麻烦|你|把|将|他们|她们|它们|它|他|她|那个|这(?:个|条|些)|那些|那|这|刚才的|刚刚的|才说的|才说|刚说的|刚说|上面的|前面(?:的|那条|这个)?|上次的|之前的|最后一个|最后那条|刚才|刚刚|上面|前面|上次|之前|说的|提到|刚提|新加的|最新的|已完成|未完成|取消完成|撤销完成|的记录|记录|条目|任务|待办|删掉|删除|清掉|去掉|移除|划掉|删|完成|做完|搞定|办完|打勾|勾掉|弄完|标成|标记|标回|标|改成|恢复成|为|一下|条|个|的|了|吧|呢)/g;

/** 剥掉指代词后剩下的关键词；为空 = 这句话是**纯指代**（没提任务名） */
function pronounKeyword(raw: string): string {
  return raw.replace(PRONOUN_WORDS, "").replace(/\s+/g, "").trim();
}

/**
 * 纯指代时该操作哪一条：未完成任务只有一条 → 就是它；多条 → null（交给上层列候选让用户选）。
 * ⚠️ 多条时**绝不能瞎猜** —— 猜错就是真删/真改数据。
 */
function soleOpenTask(ctx: BrainCtx): Task | null {
  const open = ctx.tasks.filter((t) => !t.completed);
  return open.length === 1 ? open[0] : null;
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
  /**
   * v3.9.20 🔴 反问句必须排除（真 bug：用户只是在**问**，数据却被改了）。
   *
   * 实测："周报写完了吗" → completeTask{写周报,done:true} → 回"好，完成「写周报」✅"
   * 而用户只是在问进度。同类："开会开完了吗""体检做完了吗""周报完成了么"。
   * 判据：句尾是疑问语气（吗/呢/么/没有/了没），或含"是否/是不是/有没有"。
   */
  // 反问句（用户在**问**，不是在下指令）：
  //   "周报写完了吗" / "开会开完了吗" / "开会是不是做完了" / "开会做完了没有"
  if (/(吗|呢|么|了没|了没有|没有)\s*$/.test(raw) || /(是否|是不是|有没有)/.test(raw)) return null;
  // 期限+事务排除："月底前完成预算" = 要建的任务（完成的是"预算"这件事），不是标记某待办完成。
  // 特征：有期限词（前/之前/月底/尽快…）且"完成"后面跟的是"事情"而非已有任务名。
  if (/(前|之前|以前|月底|月末|尽快|尽早|抓紧)/.test(raw) && /(完成|做完|搞定|办好|弄好)/.test(raw)) return null;
  /**
   * v3.9.20 🔴 否定词改成"**任意位置**出现就拦"，不再只认句首。
   * 实测漏网：「别删除交房租那条」——"别"在句中，旧规则只测 `^(取消|不用|别|…)` → 没拦住 →
   * 变成了"确认删除"。凡是句子里出现禁止/否定词（别/不要/不用/取消/算了/不…了），
   * 都不是"完成/删除"这类正向操作。
   * 例外：「取消完成X」「撤销完成X」是**合法操作**（标回未完成），不能一起拦。
   */
  /**
   * v3.9.20 🔴 否定词拦截（只拦**真正的禁止语气**，不要过宽）。
   *
   * 教训：第一版我写成 `/(别|不要|不用|甭|取消|算了|不[去用做开参]|不[^，,。]{0,3}了)/`，
   * 结果把「把开会标回**未完成**」也拦了（里面有"不"字）——**修过头**。
   * 现在只认明确的禁止句式。
   * 合法的"标回未完成"操作（取消完成/撤销完成/标回未完成）单独放行。
   */
  const hasUndoPhrase = /(取消完成|撤销完成|标回未完成|标为未完成|改成未完成|恢复成未完成|还没做完|没做完)/.test(raw);
  const hasForbid = /(别|甭|不要|不用|不需要|先别|暂时别|不删|别删|不必)/.test(raw);
  if (!hasUndoPhrase && (hasForbid || /^\s*(取消|算了)/.test(raw))) return null;
  const doneWord = /(完成|做完|搞定|办完|打勾|勾掉|弄完|做好了|写完了|写完|开完了|开完|会开完了|弄好了|办好了|搞定了)/.test(raw);
  /**
   * v3.9.20 🔴 undo 词表补齐（真 bug：「把开会标回未完成」被**反向执行成"完成"**）。
   * 旧表只认"取消完成|没完成|又没做|恢复|撤销完成|还没做"，
   * 而"未完成"这个最直白的说法（标回未完成/改成未完成/恢复成未完成）一个都不认。
   */
  /**
   * v3.9.23 🔴 补「还没写完/没开完/没做好」这类**进度汇报**（真 bug，⭐高）。
   *
   * 实测：「周报还没写完」→ doneWord 认出了"写完"、undoWord 一个都不认 →
   * 用户只是汇报一下进度，**任务被直接划掉了**。
   * doneWord 里有的每个"X完"，undoWord 都得有对应的"没X完"：
   *   写完/开完/弄完/做完/搞定/办好/做好 → 没写完/没开完/没弄完/没做完/没搞定/没办好/没做好…
   * 统一用「还没？/没 + 动作 + 完」这条规律收口，比一个个列更不容易漏。
   */
  const undoWord =
    /(取消完成|没完成|未完成|又没做|恢复|撤销完成|还没做|还没弄|没弄完|还没写|没写完|还没开|没开完|还没做|没做完|没做完|还没弄好|没弄好|没做好|还没办好|没办好|还没搞定|没搞定|还没干完|没干完|还没搞完|没搞完|还没收尾)/.test(raw);
  if (!doneWord && !undoWord) return null;
  const kw = raw
    .replace(
      /(帮我|请|你|把|那|个|这条|这个|任务|待办|已经|一下|标成|标记|标回|改成|恢复成|为|已完成|完成|做完|搞定|办完|打勾|勾掉|弄完|做好了|写完了|写完|开完了|开完|没写完|还没写完|没开完|还没开完|没做好|还没做好|办好了|搞定了|取消完成|没完成|未完成|又没做|恢复|撤销完成|还没做|还没弄|没弄完|了|的)/g,
      "",
    )
    .trim();
  /**
   * v3.9.20 🔴 候选池要**放宽为全部任务**，不能只查已完成/未完成。
   *
   * 实测真 bug：「把开会标回未完成」→ 回"没找到要取消完成的任务"，
   * 而"开会"明明在库里的**未完成**列表 —— 因为旧逻辑在 undo 时只去 t.completed 里找。
   * 但这句话完全可能出现在任务已经被误标完成、或用户记错状态的情况下，
   * 直接说"没找到"会让用户以为 AI 瞎了。
   * 现在：所有任务都参与匹配；已经处于目标状态的，回复里明确说明（不撒谎说改过了）。
   */
  const pool = ctx.tasks;
  const open = ctx.tasks.filter((t) => !t.completed);
  const openSingle = open.length === 1 ? open[0] : null;
  /** 纯指代专用：候选池是**全部任务**；非指代时仍按"只有一条未完成"兜底问一句 */
  const allSingle = ctx.tasks.length === 1 ? ctx.tasks[0] : null;
  /**
   * v3.9.23 🔴 完成/取消完成也认**纯指代**（「把刚说的那个标完成」）——
   * 之前只有改任务认，这里一律回"没找到"，跟删除那边是同一类毛病。
   * 同样很窄：剥完只剩 ≤1 个字才算指代（"把会议纪要删了"剥完是"会议纪要"，走正常匹配）。
   */
  const pronounKwC = pronounKeyword(raw);
  const pronounTarget = !pronounKwC || pronounKwC.length < 2 ? (allSingle ?? openSingle) : null;
  const candidates = matchTasks(pool, kw);
  /**
   * v3.9.23 纯指代（「把刚说的那个标完成」）：剥完没剩关键词。
   * 一条 → 直接执行；多条 → 列出来让用户选（跟删除那边对齐，绝不瞎猜）。
   */
  if (pronounTarget === null && (!pronounKwC || pronounKwC.length < 2)) {
    if (open.length === 0 && ctx.tasks.length === 0) {
      return { text: "你现在还没有任务，先建一个吧～", localOnly: true };
    }
    if (open.length > 1) {
      return {
        text: `你说哪个？\n${open.map(fmtCand).join("\n")}`,
        localOnly: true,
        choices: open.map((t) => ({
          id: t.id,
          title: t.title,
          op: (undoWord ? "uncomplete" : "complete") as "uncomplete" | "complete",
        })),
      };
    }
    // open.length === 0（可能全都完成了）或恰好 1 条，都由 pronounTarget 兜住
  }
  if (candidates.length === 0) {
    /**
     * v3.9.23 🔴 找不到就**退一步问**，而不是干巴巴地"没找到"。
     *
     * 实测场景：「周报还没写完」—— 用户汇报进度，库里根本没有"周报"这条任务，
     * 旧回复是"没找到要完成的任务。说具体点？" → 用户只会觉得它又瞎了。
     * 库里只有一条未完成任务时，最可能的意图就是那条，问一句比报错强得多。
     * ⚠️ 只是**问**，不执行动作 —— 用户不说"是"就什么都不会改。
     */
    const fallbackTarget = pronounTarget ?? openSingle;
    if (fallbackTarget) {
      // 纯指代（用户压根没提任务名）时别回一句"没找到叫「刚说标」的任务"——那串词是剥剩下的渣
      const isPronoun = !pronounKwC || pronounKwC.length < 2;
      const lead = isPronoun ? "" : `我没找到叫「${kw}」的任务。`;
      return {
        text: `${lead}你是说「${fallbackTarget.title}」吗？（回「是」我就${undoWord ? "标回未完成" : "标完成"}，回「不是」就算了）`,
        localOnly: true,
        awaitingConfirm: true,
        choices: [{ id: fallbackTarget.id, title: fallbackTarget.title, op: "confirmDone" as const, done: !undoWord }],
      };
    }
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
  /**
   * v3.9.20 🔴 防幻觉：任务**已经处于目标状态**时，如实说明，不假装改过。
   * （候选池放宽后会出现这种情况：用户说"标回未完成"，而它本来就是未完成）
   */
  const targetDone = !undoWord;
  if (t.completed === targetDone) {
    return {
      text: undoWord
        ? `「${t.title}」本来就是未完成的，不用改～`
        : `「${t.title}」已经完成过了 ✅`,
      localOnly: true,
    };
  }
  return {
    text: undoWord ? `好，把「${t.title}」标回未完成。` : `好，完成「${t.title}」✅`,
    action: { type: "completeTask", id: t.id, done: targetDone },
  };
}

/**
 * v3.9.18 🔴 判断用户是不是在"新建/记录"（而不是"修改已有的"）。
 *
 * 修的 bug（用户实测反馈）：
 *   "记录待办，明天11点需要**修改**500promax的链接"
 *   → 被当成"改任务"，回"没找到要改的任务"
 * 原因是旧逻辑只要句子里出现「修改」两个字就判定为更新意图 ——
 * 可"修改"在这里是**任务内容的一部分**（要做的事就是"修改链接"），
 * 而"记录待办/帮我记"才是真正的新建意图。
 *
 * 判据（任一成立即认为是新建）：
 *   - 句首/冒号前有明确的"记/加/添加/新建/创建"动词（记录待办、帮我记个待办、添加任务：）
 *   - 有"记/加"类动词 + 待办/任务/备忘 名词
 *   - 「记一下」「帮我记」等口语开头
 */
const CREATE_INTENT = new RegExp(
  [
    // ① "记录待办，…" / "帮我记个待办：" / "添加任务：" —— 动词 + 名词组合
    "(记[录下]?|添加|新增|新建|创建|加)[^，,。]{0,6}(待办|任务|事项|备忘|提醒)",
    // ② 句首动词："记录…" "帮我记…" "添加…" "新建…"
    "^\\s*(帮我|请|麻烦|给我)?\\s*(记[录下]?|添加|新增|新建|创建|写[上下]?)",
    // ③ "记一下/记个/加一个"
    "(记一下|记一笔|记个|加个|加一个|帮我记|给我记|给我加)",
  ].join("|"),
);

/**
 * v3.9.18 🔴 "改"字后面还有别的事 → 大概率不是"改任务"，而是"要做的事里带个改字"。
 *
 * 用户实测那两句：
 *   "明天11点需要**修改**500promax的链接"     → 是**新建**（要做的事=改链接）
 *   "记录待办，明天11点需要**修改**500promax的链接" → 同上
 * 而真正的"改已有任务"长这样：
 *   "把开会改成明天下午3点" / "开会改到明天"    → 目标在前、"改到/改成"在后
 *
 * 判据：句子里出现「修改/改」但**没有**「改到/改成/改为/推迟到/调整到」这类
 * **明确的变更词** → 不当作"改任务"，交给新建流程。
 */
const UPDATE_INTENT = /(改到|改成|改为|推迟到|延到|提前到|调整到|修改为)/;

/** v3.9 更新/编辑："把开会改到明天3点" / "把周报改成重要" */
function tryUpdate(raw: string, ctx: BrainCtx): BrainReply | null {
  // v3.9.18：先排除"新建"意图 —— 否则"记录待办，明天要修改链接"会被误判成改任务
  if (CREATE_INTENT.test(raw)) return null;
  /**
   * v3.9.18 🔴 只有"修改/改"而没有"改到/改成/改为"这类**明确变更词**时，
   * 不当作改任务 —— 那种句子里的"修改"多半是**要做的事**（"明天要修改链接"），
   * 应该走新建流程，而不是回"没找到要改的任务"。
   * （用户实测："明天11点需要修改500promax的链接"被这句错误回复挡掉了）
   */
  if (!UPDATE_INTENT.test(raw)) return null;
  const editWord = /(改到|改成|改为|推迟到|延到|提前到|调整到|修改)/.test(raw);
  if (!editWord) return null;
  // 抽出"改到/改成/…"之前是目标关键字、之后是新时间/新属性
  const m = raw.match(/(?:把)?(.+?)(?:改到|改成|改为|推迟到|延到|提前到|调整到|修改为|修改)(.+)/);
  if (!m) return null;
  const kw = m[1].replace(/(帮我|请|你|那|个|这条|这个|任务|待办)/g, "").trim();
  const rest = m[2].trim();
  const open = ctx.tasks.filter((t) => !t.completed);
  /**
   * v3.9.19 🔴 用户用了**泛指**（"把这个任务改到明天"），剥完关键词是空的。
   * 旧逻辑：拿空关键词去匹配 → 匹配不到任何任务 → 回"没找到要改的任务"，
   * 而库里明明有任务，用户会觉得"这 AI 瞎了"。
   * 现在：泛指 + 库里只有一条 → 直接改那一条（最符合直觉）；
   *       泛指 + 多条 → 列出来让用户选（复用已有的 choices 通道）。
   */
  if (!kw) {
    if (open.length === 0) {
      return { text: "你现在没有未完成的任务，不用改啦。" };
    }
    if (open.length === 1) {
      const only = open[0];
      const p1 = parseQuickAdd({ title: rest, notes: "", now: ctx.now ?? new Date() });
      const patch1: { dueDate?: string; dueTime?: string; priority?: Priority } = {};
      if (p1.dueDate) patch1.dueDate = p1.dueDate;
      if (p1.dueTime) patch1.dueTime = p1.dueTime;
      if (Object.keys(patch1).length === 0) {
        return { text: `想把它改成什么？比如「把${only.title}改到明天下午3点」。` };
      }
      const when1 = `${patch1.dueDate ?? ""}${patch1.dueTime ? " " + patch1.dueTime : ""}`.trim();
      return {
        text: `好，把「${only.title}」改成 ${when1 || "新设置"}。`,
        action: { type: "updateTask", id: only.id, patch: patch1 },
      };
    }
    // 多条：让用户选（不能瞎猜改哪条）
    return {
      text: `你想改哪一个？\n${open.map(fmtCand).join("\n")}`,
      localOnly: true,
      choices: open.map((t) => ({ id: t.id, title: t.title, op: "update" as const })),
    };
  }
  const candidates = matchTasks(open, kw);
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
  /**
   * v3.9.23 🔴 「记下来」整体吃掉（真 bug，而且是**它自己教用户说的话**）。
   *
   * 兜底回复里写着「回『记下来』我就建」/「回『记下来』我就建个待办」，
   * 用户照着回「记下来」→ 下面那条规则只吃掉了"记"，"下来"留成正文 →
   * 建出一条名叫**「下来」**的任务；「帮我记下来，明天开会」→「下来， 开会」。
   *
   * 所以"记"后面跟"下来/下/一下/一笔/着/得"这类补语时，必须**连补语一起**吃掉。
   * （"记得/记住/别忘了"已在下面单独处理，这里不再重复。）
   */
  s = s.replace(
    /^(?:帮我|给我|替我|麻烦|请)?\s*(?:记录|记事|记)\s*(?:下来|下|一下|一笔|着|得|住)\s*[\s，,：:、的]*/i,
    "",
  );
  // 尾部外壳：…帮我记一下 / 帮我记 / 记一下
  s = s.replace(/\s*(?:帮我|给我|替我)?\s*(?:记(?:个)?(?:一下|下来)?|安排一下|加一下)\s*$/i, "");
  /**
   * v3.9.18 🔴 开头外壳（**必须整词匹配**）。
   *
   * 修的真 bug（用户实测）："记录待办，明天11点需要修改链接"
   * 旧写法 `^(?:记录|记事|记)[\s，,：:、]+` 要求"记"后面紧跟标点，
   * 而这里是"记录**待办**，"→ 匹配不上 → 走到下面那条只认"记"的规则 →
   * 把"记"剥掉、却留下"录待办" → **标题变成"录待办， 需要修改...链接"**。
   *
   * 现在：先把"记录/记事/记"**连同后面的待办/任务等名词一起**吃掉，
   * 再吃标点，避免剥一半。
   */
  /**
   * v3.9.20 🔴 顺序很关键：**"记得/别忘了/记住"必须先剥**。
   *
   * 实测真 bug：「记得明天要看看快递到没到」→ 标题变成「**得 要看看快递到没到**」。
   * 原因：下面那条"记"规则先执行，把"记得"的"记"剥掉了、留下"得"，
   * 等轮到"记得"规则时已经匹配不上。**长词优先**是这类剥离的通用原则。
   */
  s = s.replace(/^(?:记得|记住|别忘了|别忘记|记着)[\s，,：:、的]*/i, "");
  s = s.replace(
    /^(?:记录|记事|记)[\s]*(?:个|一下|一笔)?[\s]*(?:待办|任务|事项|备忘|提醒)?[\s，,：:、的]*/i,
    "",
  );
  // 开头外壳（可带可不带标点/的）：帮我记个待办 / 添加个任务 / 设个提醒…
  s = s.replace(/^(?:帮我|给我|替我)?\s*(?:记|建|添加|加|设|安排|存|放)(?:个|一个|一下)?\s*(?:待办|任务|事项|备忘录|提醒)?\s*(?:里|中|上面)?[\s，,：:的]*/i, "");
  // 开头语气/称呼（"你好呀" 这类留给问候分支，不在建任务里剥到空）
  s = s.replace(/^(?:请|麻烦)\s*/i, "");
  return s.replace(/^[\s,，。.!！?？:：;；-]+|[\s,，。.!！?？:：;；-]+$/g, "").trim();
}

/**
 * v3.9.23 🔴 一句话说两件事 —— 切分判据。
 *
 * 真 bug（用户实测）：
 *   「明天开会，另外记得买牛奶」→ 建成一条「开会，另外记得买牛奶」
 *   「明天开会，后天交材料」    → 只取了第一个日期，后天的信息直接丢了
 *
 * 只在两种情况下才切（宁可少切，也别把一件事硬拆成两条）：
 *   ① 逗号后面跟着**连接词**：另外/还有/顺便/以及/再/也…
 *   ② 逗号后面跟着**新的日期或钟点**：明天/后天/下周/周五/3号/下午3点…
 * 「开会，讨论预算」这种同一件事的补充说明，两条都不满足 → 不切，保持整句。
 */
const MULTI_LEAD =
  /^(?:另外一个|另一件|另一个|另外|还有|顺便|以及|外加|再有|再|也)\s*(?:帮我|给我|替我|麻烦|请)?\s*(?:记得|记住|别忘了|别忘记|记着|要|需要)?\s*[，,：:、]?\s*/;
const MULTI_SPLIT = new RegExp(
  [
    "[，,；;]\\s*(?=(?:另外一个|另一件|另一个|另外|还有|顺便|以及|外加|再有|再|也))",
    "[，,；;]\\s*(?=(?:今天|明天|后天|大后天|下周|这周|本周|周末|周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|\\d{1,2}[点号日]|上午|下午|晚上|中午|早上|傍晚|凌晨))",
  ].join("|"),
);
/** 切成 2~3 段才算"多件事"；更多段多半是误切，按原样当一条处理 */
export function splitMultiTasks(raw: string): string[] {
  const parts = raw
    .split(MULTI_SPLIT)
    .map((s) => s.replace(MULTI_LEAD, "").trim())
    .filter(Boolean);
  return parts.length >= 2 && parts.length <= 3 ? parts : [];
}

/** 像一件真待办的内容词（至少一段命中，整句才按"多件事"处理） */
const MULTI_TODO =
  /(待办|任务|开会|会议|面试|出差|汇报|周报|月报|交|买|取|寄|送|修|改|准备|打卡|回复|体检|缴费|还款|报名|合同|预算|房租|方案|材料|复习|考试|快递|药|饭|票|钱|班|约|见)/;

/** v3.9.23：「明天开会，另外记得买牛奶」→ 两条待办（各自的日期分别解析） */
function tryMultiTasks(raw: string, now: Date): BrainReply | null {
  const t = raw.trim();
  // 跟 tryAddTask 同一道闸：疑问句、撤销意图一律不建任务
  if (/[?？]/.test(t)) return null;
  if (/(吗|呢|么|了没|了没有|吧)\s*$/.test(t)) return null;
  if (/(是否|是不是|有没有|做了没有|完了没有)/.test(t)) return null;
  if (/(还有|还剩|哪些|什么|怎么|如何|为什么|为啥|能不能|可不可以|多久|几点|几号|星期几|周几|在哪|是谁)/.test(t)) return null;
  // ⚠️ 撤销/否定句不切：「明天不开会了，另外也不买牛奶了」是两句撤销，不是两件待办
  if (/(取消|别记|算了|不记了|不去了|取消了|不[\S]{0,4}了)/.test(t)) return null;
  const pieces = splitMultiTasks(t);
  if (pieces.length < 2) return null;
  // 至少一段像真待办 —— 否则可能只是闲聊里带了两个逗号，别硬拆
  if (!pieces.some((p) => MULTI_TODO.test(p))) return null;
  const items = pieces.map((p) => {
    const q = parseQuickAdd({ title: stripHelp(p), notes: "", now });
    return { title: q.title, dueDate: q.dueDate, dueTime: q.dueTime, remindAt: q.remindAt };
  });
  const bad = items.some(
    (it) => !it.title || it.title === "未命名任务" || /^[了哦嗯啊吧呢的]+$/.test(it.title),
  );
  if (bad) return null;
  const lines = items
    .map((it) => `「${it.title}」⏰ ${it.dueDate ? `${it.dueDate}${it.dueTime ? " " + it.dueTime : ""}` : "未设日期"}`)
    .join("\n");
  return { text: `好，我帮你记下这 ${items.length} 件事：\n${lines}`, action: { type: "addTasks", items } };
}

/** 判断是否"建待办/任务"（自然语言日期交给 parseQuickAdd） */
function tryAddTask(raw: string, now = new Date()): BrainReply | null {
  // 去掉外壳（开头/结尾），其余原样交给 NLP 提取 标题/时间/循环
  const cleaned = stripHelp(raw);
  const fillers = /^(呢|啊|吧|呀|哦|嘛|吗|个|一下|了|的|好|嗯)*$/;
  // 纯"帮我记个待办"（剥完没内容）→ 引导补内容，不建空任务
  if (!cleaned || fillers.test(cleaned)) {
    return { text: "想记什么待办呀？跟我说下内容就行，比如「明天下午3点交周报」。" };
  }
  /**
   * v3.9.20 🔴 撤销 / 否定意图 → 不能建成任务（"负向任务"入库是真 bug）。
   *
   * 实测漏网（旧规则只认句首那 6 个词）：
   *   「明天不开会了」    → 建成任务「不开会了」⏰明天
   *   「周一的会取消了」  → 建成「的会取消了」
   *   「明天的面试不去了」「明天的活动取消了」「这个任务不用做了」
   *   「明天不用提醒我交房租了」→ 建成「不用 我交房租了」（还自带 09:00 提醒！）
   * 规律：否定词**在句中**也算 —— "不去了/取消了/改期了/不用做了/不开会了/别提醒了"。
   */
  const CANCEL_INTENT = new RegExp(
    [
      // 句首直接撤销
      "^(取消|撤了|算了|不记了|别记)",
      // 句中"…不X了"（不去了/不开了/不办了/不做/不用做了/不参加）
      "不[去开办做参用][^，,。]{0,4}了",
      // 取消/改期 类
      "(取消了|已取消|被取消|改期了|延期了|推迟了|不来了)",
      // 别提醒
      "(别提醒|不用提醒|不要再提醒|不用再提醒)",
      // 统一否定收尾："…不用了/算了/作罢"
      "(不用了|算了|作罢)",
    ].join("|"),
  );
  if (CANCEL_INTENT.test(raw.trim())) {
    return {
      text: "好，那这条就不记了。（如果是要取消已有的待办，跟我说「把XX删掉」或者「把XX标回未完成」）",
      localOnly: true,
    };
  }
    const parsed = parseQuickAdd({ title: cleaned, notes: "", now });
  // 明确"要建任务"的信号：原句有建动作词，或（解析出时间/日期 且 像待办内容）。
  // 避免"今天天气不错"这类闲聊被误当成任务（今天也会被 NLP 填成日期）。
  /** 动作词：明确的"帮我记/添加/新建"这类（用户主动要求记录） */
  const hasVerb = /(帮我|给我|替我|请|麻烦|帮忙|记一下|记个|记下来|记录|安排|添加|新增|新建|创建|设个|提醒我|建个|加个|存个|放个|记得|记着)/.test(raw) &&
    !/(写代码|编程|翻译|算题|推荐|讲个笑话|天气|股票|彩票)/.test(raw);
  const hasTime = !!parsed.dueDate || !!parsed.dueTime;
  /**
   * v3.9.18 🔴 任务标记词：用于判断"这句话是不是在说一件要做的事"。
   *
   * 用户实测反馈："明天11点需要修改500promax的链接" —— 解析出了时间，
   * 但既没有"帮我记"这类动作词，内容里也没有旧清单里的词 → **被判成闲聊、不建任务**。
   * 而这句话明明是件很明确的待办（"修改链接"就是要做的事）。
   *
   * 补充两类常见说法：
   *   - 口语意愿词：需要 / 要 / 得 / 必须 / 记得要（"明天要交材料"）
   *   - 常见工作动作：改 / 修 / 核对 / 确认 / 更新 / 联系 / 跟进 / 提交 / 上传 / 链接…
   */
  const todoMark = /(待办|任务|开会|开个会|会议|会|约|安排|面试|出差|请假|汇报|交[^，。]*|买|取|寄|送|取快递|修|改|准备|打卡|回复|周报|月报|报表|文案|材料|东西|事情|例会|健身|运动|锻炼|学习|读书|复习|考试|体检|缴费|还款|报名|打车|订票|合同|对接|整理|预算|方案|房租|水电|喝水|吃药|接|送|办|弄|搞|清|洗|打扫|预约|挂号|报销|签字|盖章|需要|要[做办交发写改查确认]|得[去做办交发写改]|必须|链接|核对|确认|更新|修改|联系|跟进|提交|上传|下载|发布|上线|处理|检查|统计|汇总|通知|提醒|打电话|发消息|邮件|文件|文档|资料|表格|图片|视频|账号|密码|订单|付款|发货|收货)/.test(cleaned);
  // 闲聊特征：明显不是任务（避免"今天天气不错"被当任务）
  const chitchat = /(天气|心情|感觉|觉得|好像|不错|真好|开心|难过|累了|好累|好烦|怎么样啊|是吗|哈哈)/.test(cleaned) && !hasVerb;
  if (chitchat) return null;
  /**
   * v3.9.20 🔴 疑问句一律不建任务 —— **不再看有没有动作词**。
   *
   * 实测真 bug：`明天有安排吗` → 建成任务「有安排吗」；`早上有什么安排` 同样。
   * 根因：判据是 `isQuestion && !hasVerb`，而"安排"本身在 hasVerb 词表里
   * （本意是"帮我安排一下"），于是"有**安排**吗"里它被当成动作词 → 绕过问句拦截。
   *
   * 现在改成：只要句尾是疑问语气（吗/呢/么/了没/吧）或含疑问词，**一律**视为提问，
   * 交给查询分支回答，绝不建任务。
   * （"明天有安排吗"→查询能答；答不了的走兜底，也比建一个"有安排吗"的任务强）
   */
  const isQuestion =
    /[?？]/.test(raw) ||
    /(吗|呢|么|了没|了没有|吧)\s*$/.test(raw.trim()) ||
    /**
     * v3.9.20 🔴 补「是不是/是否/有没有」和「…了没有」——
     * 实测漏网：「开会是不是做完了」被建成了任务「开会是不是做完了」。
     * （之前只在 tryComplete 里加了这条，建任务分支没加）
     */
    /(是否|是不是|有没有|做了没有|完了没有|弄完了没有)/.test(raw.trim()) ||
    /(还有|还剩|哪些|什么|怎么|如何|为什么|为啥|能不能|可不可以|多久|几点|几号|星期几|周几|在哪|是谁)/.test(raw.trim());
  if (isQuestion) return null;
  // 放宽：有动作词 / 有任务标记 / 有明确时间 —— 三者之一即可建（真人说话不会都带"帮我记"）
  if (!hasVerb && !todoMark && !hasTime) return null;
  // 标题是空/纯虚词/纯指代（"那事""这个""那个"）→ 无实义，引导补充而不是建垃圾任务
  const vague = /^(那事|这事|这个|那个|它|这些|那些|东西|事情|事|啥|什么)$/;
  /**
   * v3.9.19 🔴 "未命名任务" 是 NLP 剥完只剩时间词时的占位符
   * （用户只说"明天"，剥掉"明天"就没内容了）。
   * 这种情况**不能建任务** —— 否则库里会出现一堆叫"未命名任务"的空壳。
   * 实测：输入"明天" → 建了一个「未命名任务」，用户完全不知道那是什么。
   */
  if (
    !parsed.title ||
    parsed.title === "未命名任务" ||
    fillers.test(parsed.title) ||
    vague.test(parsed.title.trim())
  ) {
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
  /**
   * v3.9.20 🔴 带"记一下/帮我记/记录"这类**明确新建动词**的句子，不能被查询劫走。
   *
   * 实测真 bug：
   *   「我明天要去医院复查，记一下」 → 回"明天没有安排。"，**医院复查根本没记**
   *   「帮我记一下，明天要去银行查账」 → 被"查账"里的"查"吸走
   *   「记得明天要看看快递到没到」 → 同上
   * 用户明明说了"记一下"，却因为句中有"查/看看"就被当成查询 —— 答非所问还丢任务。
   */
  if (/(记一下|记一笔|帮我记|给我记|替我记|记下来|记录一下|记个|加一个|添加个|新建个|存一下)/.test(raw)) {
    return null;
  }
  /**
   * v3.9.20 🔴 "记得…要看看/查查"这类也是**要记的事**，不是查询。
   * 实测漏网：「记得明天要看看快递到没到」→ 被"看看"吸进查询分支，任务没建。
   * 凡是以"记得/记住/别忘了"开头 → 是提醒自己做事，直接放行走新建。
   */
  if (/^\s*(记得|记住|别忘了|别忘记|记着)/.test(raw)) return null;
  const now = ctx.now ?? new Date();
  const today = dateKey(now);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tKey = dateKey(tomorrow);

  // 真正在"问"，而非"建/记"
  const ask = /(有什么|哪些|安排是|安排吧|查|列|看看|看下|盘点|汇总|忙什么|要做|待办是|有啥|多少|几个|还剩|剩下|还有|没做|未完成|没完成|剩下的|待办的)/.test(raw) && !/(建|添加|加个|记下|记个|安排一个|安排个)/.test(raw);

  // 「还有多少没做 / 未完成几个 / 剩下的任务」→ 统计未完成
  /**
   * v3.9.23 🔴 补「还有哪些待办 / 都有什么任务 / 有什么待办」这一类。
   *
   * 真 bug：旧判据要求出现"未完成/没做/剩下/多少/几个"之一，
   * 而「还有哪些待办」一个都不占（"哪些"和"待办"当时都不在表里）→ 落空 →
   * **掉进建任务分支，建出一条叫「还有哪些待办」的待办**（回归测试抓到的）。
   */
  const askRemaining =
    ask &&
    /(未完成|没完成|没做|没干|剩余|剩下|还剩|还有多少|多少.*(待办|任务|事)|几件|几个|哪些|都有什么|有什么|清单|列表)/.test(raw) &&
    // ⚠️ 带日期指向的问句归下面"今天/明天/逾期"三条管，
    //    否则「今天有什么安排」会被"统计未完成"抢先答成"你还有 N 件没完成"（实测踩过）
    !/逾期|过期|明天|今天|今日|现在|当下|本周|最近/.test(raw);
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
  /**
   * v3.9.23 🔴 「帮我查一下交房租」——查**某一条任务本身**。
   *
   * 真 bug：这句一度被离题拦截器当成"越界请求"回绝（已修，见 isOffTopic）。
   * 放行之后还需要有人真正接住它：上面四条查的都是"今天/明天/逾期/还剩"，
   * 没有一条认得出"查某条任务"。落空就会掉进建任务分支，建出一条叫
   * 「查一下交房租」的待办 —— 比拒绝还糟。
   *
   * ⚠️ 必须放在上面四条**之后**：否则「查一下明天的安排」会被这条当成
   * "查一个叫『明天』的任务"。
   */
  if (ask) {
    const lookupKw = raw
      .replace(/[。．.!！？?，,、；;：:\s]+/g, " ")
      .trim()
      .replace(/(帮我|请|麻烦|给我|查一下|查查|查询|查下|查|看一下|看看|看下|的|了|任务|待办|进度|状态)/g, "")
      .trim();
    if (lookupKw.length >= 2) {
      const hits = matchTasks(ctx.tasks, lookupKw);
      if (hits.length === 1) {
        const t = hits[0];
        const when = t.dueDate ? `${t.dueDate}${t.dueTime ? " " + t.dueTime : ""}` : "未设日期";
        return {
          text: `「${t.title}」${t.completed ? "已经完成 ✅" : "还没完成"}，时间：${when}。`,
        };
      }
      if (hits.length > 1) {
        return { text: `找到几条，你要看哪个？\n${hits.map(fmtCand).join("\n")}` };
      }
      return { text: `没找到叫「${lookupKw}」的任务。`, localOnly: true };
    }
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
/**
 * 判断用户对"要不要执行"的回复。
 *
 * v3.9.14 🔴 修误删（独立审查发现的真 bug，最危险的一类）：
 * 原来的 yes 正则**不锚定全句**，只要以"好/对/嗯"开头就算确认：
 *   「好的，先别删」→ yes:true → **任务被删了**
 *   「好，不用了」  → yes:true
 *   「对，不过先等等」→ yes:true
 * 而且否定词检查放在 yes 之后，永远轮不到。
 *
 * 现在：① 先查否定（"别/不用/不要/先不/等等"等一律算否定，优先于肯定）
 *      ② yes 必须**整句**就是肯定词（允许尾部标点），不接受"好 + 一堆别的话"
 */
export function readConfirm(raw: string): { yes: boolean } | null {
  const t = raw.trim();
  // ① 否定优先：出现任何"别/不用/不要/先不/等等/取消/算了/**不过**"等 → 一律算否
  const NEG = /别|不用|不要|不删|不记|不改|取消|算了|等等|等会|等一下|先不|暂时不|回头再|以后再说|不过|先缓缓|再说吧/;
  if (NEG.test(t)) return { yes: false };

  /**
   * ② 肯定：必须**整句**为肯定词（末尾可以有标点），不接受"好的，先别删"这类混合句。
   *
   * v3.9.23 🔴 补「是，删掉」——**确认气泡里那颗按钮发出去的原话**。
   * 它一直是 YES_FULL 的漏网之鱼：点按钮 → 返回 null → 落到"当普通对话处理"
   * → 回一句"抱歉，我没找到要删的任务"。结果就是：**按钮永远删不掉，只有手打"好"才行。**
   * 顺带把「确定删/确认删除/删掉吧/是的删掉」这类口语确认一起收进来。
   * ⚠️ 这条只放宽**肯定**的写法，否定仍然一律优先（上面①），三道防幻觉闸门没动。
   */
  const YES_FULL = /^(?:(?:是|对|嗯|好|行|可以|确定|确认)\s*[，,]?\s*)?(?:是的|是|确定|确认|删|删吧|删掉|删除|好|好的|行|可以|去吧|嗯|对|ok|OK|Ok)[。.!！~～\s]*$/;
  if (YES_FULL.test(t)) return { yes: true };
  if (/^(?:是的|对|嗯|好)?\s*[，,]?\s*(?:删掉吧|删除吧|确认删除|确定删除|就删吧|删了吧)[。.!！~～\s]*$/.test(t)) {
    return { yes: true };
  }

  const NO_FULL = /^(?:不|不要|别|取消|算了|先不|不了|no|No|NO)[。.!！~～\s]*$/;
  if (NO_FULL.test(t)) return { yes: false };

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
  "新闻", "今天几号农历",
  "怎么做菜", "菜谱", "推荐电影", "推荐书", "推荐音乐", "讲个故事", "讲个笑话",
];

/**
 * 「查」要**看宾语**，不能光看这两个字。
 *
 * v3.9.23 🔴 真 bug：「帮我查一下交房租」被回"这些我可帮不上忙" ——
 * 用户明明是在问自己的待办，却被当成越界请求挡在门外。
 * （不带"帮我"的「查一下明天的安排」反而是正常的，说明问题出在这个词条太秃。）
 *
 * 现在：只有当"查"的宾语是**外部世界的话题**（天气/股票/新闻/航班…）时才算离题；
 * 跟待办有关的（查一下交房租 / 查查今天的安排 / 帮我查下还有什么没做）一律放行。
 *
 * ⚠️ 判据只看**宾语**，不看有没有日期词：
 *   「查一下明天的安排」→ 宾语是"安排"（内部）→ 放行
 *   「查一下明天的股票」→ 宾语是"股票"（外部）→ 拦。日期不改变宾语的性质。
 */
const LOOKUP_EXT_RE =
  /(天气|气温|下雨|会不会下|股票|基金|汇率|币价|金价|油价|新闻|热搜|百科|快递单号|物流|航班|车次|机票|火车|菜谱|做法|歌词|翻译|单词|地图|路线|导航|附近|营业时间|电话|号码|怎么走|在哪里|是谁|什么意思)/;
function isLookup(raw: string): boolean {
  return /查/.test(raw) && LOOKUP_EXT_RE.test(raw);
}
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
  /**
   * v3.9.23 🔴 「查」单独判：宾语是外部话题才算离题。
   * （原先是词表里一个光秃秃的"帮我查"，把「帮我查一下交房租」也误伤了）
   */
  if (isLookup(t)) return true;
  // 明确"动手做技术活"（写代码/做网站/教编程）→ 拒绝进 AI；但有时间/待办语义的"和后端开会"不误伤
  const hasTime = /(明天|今天|后天|周[一二三四五六日天]|\d{1,2}月|\d{1,2}日|上午|下午|晚上|今晚|\d+点|\d+:\d+|号)/.test(t);
  const hasTodoWord = /(待办|任务|开会|会议|约|安排|提醒|行程|备忘|去|到|看|交|汇报|面试|出差)/.test(t);
  if (BUILD_VERB_RE.test(t) && CODE_NOUN_RE.test(t) && !hasTime && !hasTodoWord) return true;
  // 明显的"帮我做件事/答个题/查个东西"但没提任务/备忘/情绪 → 拒绝进 AI
  const SERVICE_REQ = /^(帮我|请|给我|能不能|可以|麻烦|帮忙|帮我弄|搞)/;
  /**
   * v3.9.23 🔴 "帮我查一下X"里的"查"单独放行 —— 这个字在待办语境里是最常见的动词之一
   * （查一下还剩几件、查查今天的安排），不能因为句首是"帮我"就整个判成越界。
   */
  if (/查/.test(t) && !isLookup(t)) return false;
  /**
   * v3.9.20 🔴 "帮我记/帮我加/帮我建"是**最明确的待办交代**，绝不能被判成离题。
   *
   * 实测真 bug：「帮我记一下，明天要检查身体」→ 回"这些我可帮不上忙…"
   * 因为 SERVICE_REQ 命中"帮我"，而 TASK_ACTION / TASK_NOUN / hasTodoWord 三条都没兜住
   * （"记"不在"买取发"那类动词里，"身体"不是事务名词，"检查"不在待办词表里）。
   * 结果：用户用最标准的说法交代办，AI 反而拒绝 —— 体验极差。
   */
  const RECORD_REQ = /(记一下|记一笔|记下来|记录|记个|帮我记|给我记|替我记|加一个|添加|新增|新建|建个|存一下|安排一下|设个提醒|提醒我)/;
  if (RECORD_REQ.test(t)) return false;
  // 但"帮我+日常事务动词"是交代办，不是越界（帮我买/取/发/寄/交/订/约…）
  const TASK_ACTION = /^(帮我|请|给我|麻烦|帮忙)\s*(把|将)?\s*(买|取|拿|寄|发|送|交|订|约|抢|排|写|做|准备|整理|打印|复印|预约|挂号|报销|报名|充|缴|还|存|放|修|洗|换|租|退|领|填|签|盖章|联系|回复|通知|催|跟进)/;
  // "帮我把<事务名词>…" 也是交代办（如"帮我把方案发给老王"）——事务名词出现即放行
  const TASK_NOUN = /(方案|周报|月报|报表|报告|材料|合同|快递|外卖|房租|水电|预算|发票|报销单|简历|文件|资料|名单|链接|图片|照片|账号|密码|证件|票|钱|款|货|药|菜|饭|单子|身体|体检|复查|检查|银行|快递)/;
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
  /**
   * v3.9.23 🔴 一句话两件事，必须在 tryAddTask **之前**试。
   *
   * 真 bug（用户实测）：
   *   「明天开会，另外记得买牛奶」→ 建成一条「开会，另外记得买牛奶」
   *   「明天开会，后天交材料」    → 只取了第一个日期，后天的信息直接丢了
   * ⚠️ 放在 tryAddTask 之后是没用的 —— 单条那条会把整句吃掉并提前 return，
   *    多件事分支永远轮不到（第一版就是这么写的，实测没生效）。
   * 位置：情绪分支之后、单条建任务之前；上面那些更明确的意图（删/完成/改/查/备忘）
   * 早就 return 了，抢不走。
   */
  const multi = tryMultiTasks(text, ctx.now ?? new Date());
  if (multi) return multi;
  /**
   * ⚠️ `now` 必须**传下去**，不能让它自己 `new Date()`。
   * 不传的话单条建任务走的是真实系统时间，跟上下文里的时钟不一致 ——
   * 测试里表现为「"明天开会"的日期翻了一天就变」，线上则是"注入时钟"这条设计被悄悄绕过。
   */
  const task = tryAddTask(text, ctx.now ?? new Date());
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
