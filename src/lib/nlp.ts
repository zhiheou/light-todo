import type { Priority, QuickAddParse, RepeatRule } from "../types";

export interface ParseInput {
  title: string;
  notes?: string;
  now?: Date;
}

const WEEKDAYS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// 从 today 起算，第一个满足 target 的日子（今天满足就用今天）。
function nextDayWith(target: (d: Date) => boolean, now: Date): Date {
  const d = startOfDay(now);
  while (!target(d)) d.setDate(d.getDate() + 1);
  return d;
}

function isWeekday(d: Date): boolean {
  return d.getDay() !== 0 && d.getDay() !== 6;
}

// 从今天起算下一个 day 日（短月取月末；今天正好是 day 日则用今天）。
function nextMonthlyDay(day: number, now: Date): Date {
  const today = startOfDay(now);
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastThisMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const target = Math.min(day, lastThisMonth);
  const candidate = new Date(first.getFullYear(), first.getMonth(), target);
  if (candidate.getTime() >= today.getTime()) return candidate;
  const nextLast = new Date(first.getFullYear(), first.getMonth() + 2, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth() + 1, Math.min(day, nextLast));
}

function nextWeekday(day: number, now: Date): Date {
  return nextDayWith((d) => d.getDay() === day, now);
}

// 优先级关键词：避免单字"中/低"误伤（"中国""低风险"）。保留 placeholder 提示的"高"。
const PRIORITY_RULES: Array<{ re: RegExp; p: Priority; strip: RegExp }> = [
  { re: /(高|紧急|P1|p1)/, p: 1, strip: /(高|紧急|P1|p1)/ },
  { re: /(重要|P2|p2)/, p: 2, strip: /(重要|P2|p2)/ },
  { re: /(低|P3|p3)/, p: 3, strip: /(低|P3|p3)/ },
  { re: /(无|P4|p4)/, p: 4, strip: /(无|P4|p4)/ },
];

interface TimeParse {
  time: string;
  isPm: boolean;
}

// 解析时间 token："10:00" / "10点" / "8点半" / "9点一刻" / "8点30分"
function parseTime(text: string): TimeParse | null {
  const colon = text.match(/(\d{1,2})[:：](\d{1,2})/);
  if (colon) {
    const hour = Number(colon[1]);
    const minute = Number(colon[2]);
    const isPm = /(下午|晚上|傍晚)/.test(text);
    let h = hour;
    if (isPm && h < 12) h += 12;
    return { time: `${pad(h)}:${pad(minute)}`, isPm };
  }
  const dian = text.match(/(\d{1,2})点(半|一刻|三刻|\d{1,2}分?)?/);
  if (dian) {
    let hour = Number(dian[1]);
    let minute = 0;
    const suffix = dian[2];
    if (suffix === "半") minute = 30;
    else if (suffix === "一刻") minute = 15;
    else if (suffix === "三刻") minute = 45;
    else if (suffix) minute = Number(suffix.replace(/分$/, "")) || 0;
    const isPm = /(下午|晚上|傍晚)/.test(text);
    if (isPm && hour < 12) hour += 12;
    return { time: `${pad(hour)}:${pad(minute)}`, isPm };
  }
  return null;
}

// 对 title 原文执行 token 剥离（顺序与解析一致），得到干净标题。
const STRIP_RULES: RegExp[] = [
  /(高|紧急|P1|p1|重要|P2|p2|低|P3|p3|无|P4|p4)/g,
  /每月\d{1,2}[日号]/g,
  /每(?:周|星期)[一二三四五六日天]/g,
  /每个工作日|工作日/g,
  /每(?:隔)?\d{1,2}天/g,
  /每天|每日/g,
  /(?:下?周)[一二三四五六日天]/g,
  /今天|明天|后天/g,
  /\d{1,2}[月/]\d{1,2}[日号]?/g,
  /\d{1,2}[日号]/g,
  /\d{4}-\d{1,2}-\d{1,2}/g,
  /\d{1,2}[:：]\d{1,2}/g,
  /\d{1,2}点(?:半|一刻|三刻|\d{1,2}分?)?/g,
  /上午|中午|下午|晚上|傍晚/g,
  /提醒/g,
];

function stripTokens(title: string): string {
  let clean = title;
  for (const rule of STRIP_RULES) clean = clean.replace(rule, " ");
  // 前置语气词（token 剥离后可能残留空格）："提醒我打卡" → "打卡"
  clean = clean.replace(/^\s*(请|麻烦|帮我|记得|提醒|我|你|一下)+\s*/g, " ");
  clean = clean
    .replace(/\s+/g, " ")
    .replace(/^[\s,，。.!！?？:：;；-]+|[\s,，。.!！?？:：;；-]+$/g, "");
  return clean.trim();
}

export function parseQuickAdd(input: ParseInput): QuickAddParse {
  const title = input.title.trim();
  const notes = (input.notes ?? "").trim();
  const now = input.now ?? new Date();
  const merged = `${title} ${notes}`.trim();

  let cleanTitle = title;
  let priority: Priority = 3;
  let repeat: RepeatRule | null = null;
  let dueDate = "";
  let dueTime = "";
  let hasReminder = false;

  // ---- 优先级（只在标题上检测）----
  for (const rule of PRIORITY_RULES) {
    if (rule.re.test(title)) {
      priority = rule.p;
      break;
    }
  }

  // ---- 循环规则（必须先于日期规则，否则"每周一"会被拆成"周"+"一"误判）----
  const monthly = merged.match(/每月(\d{1,2})[日号]/);
  if (monthly) {
    const day = Number(monthly[1]);
    repeat = { freq: "monthly", interval: 1, dayOfMonth: day };
    dueDate = toDateString(nextMonthlyDay(day, now));
  }

  const weekly = merged.match(/每(?:周|星期)([一二三四五六日天])/);
  if (weekly && !repeat) {
    const weekday = WEEKDAYS[weekly[1]];
    repeat = { freq: "weekly", interval: 1, weekday };
    dueDate = toDateString(nextWeekday(weekday, now));
  }

  const weekdayRecur = /每个工作日|工作日/.test(merged);
  if (weekdayRecur && !repeat) {
    repeat = { freq: "weekday", interval: 1 };
    dueDate = toDateString(nextDayWith(isWeekday, now));
  }

  const interval = merged.match(/每(?:隔)?(\d{1,2})天/);
  if (interval && !repeat) {
    const n = Math.max(1, Number(interval[1]));
    repeat = { freq: "interval", interval: n };
    dueDate = toDateString(now);
  }

  if (/每天|每日/.test(merged) && !repeat) {
    repeat = { freq: "daily", interval: 1 };
    dueDate = toDateString(now);
  }

  // ---- 日期规则（循环已设 dueDate 时，显式日期可覆盖）----
  const weekdayDate = merged.match(/(下?周)([一二三四五六日天])/);
  if (weekdayDate && !repeat) {
    const day = WEEKDAYS[weekdayDate[2]];
    const d = nextWeekday(day, now);
    if (weekdayDate[1] === "下周") d.setDate(d.getDate() + 7);
    dueDate = toDateString(d);
  } else if (weekdayDate && repeat && repeat.freq === "weekly") {
    // 已由循环规则处理，避免重复覆盖
  }

  const relative = merged.match(/(今天|明天|后天)/);
  if (relative) {
    const offset = relative[1] === "明天" ? 1 : relative[1] === "后天" ? 2 : 0;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    dueDate = toDateString(d);
  }

  const monthDay = merged.match(/(\d{1,2})[月/](\d{1,2})[日号]?/);
  if (monthDay) {
    const year = now.getFullYear();
    const d = new Date(year, Number(monthDay[1]) - 1, Number(monthDay[2]));
    const today = startOfDay(now);
    if (d.getTime() < today.getTime()) d.setFullYear(year + 1);
    dueDate = toDateString(d);
  } else {
    const dayOfMonth = merged.match(/(\d{1,2})[日号]/);
    if (dayOfMonth && !repeat) {
      dueDate = toDateString(nextMonthlyDay(Number(dayOfMonth[1]), now));
    }
  }

  const isoDate = merged.match(/\d{4}-\d{1,2}-\d{1,2}/);
  if (isoDate) {
    const d = new Date(`${isoDate[0]}T00:00:00`);
    if (!Number.isNaN(d.getTime())) dueDate = toDateString(d);
  }

  // ---- 时间 ----
  const time = parseTime(merged);
  if (time) dueTime = time.time;

  // ---- 提醒 ----
  hasReminder = /提醒/.test(merged);
  if (hasReminder && !dueTime) dueTime = "09:00";

  if (dueTime && !dueDate) dueDate = toDateString(now);
  if (hasReminder && !dueDate) dueDate = toDateString(now);

  const remindAt =
    dueDate && dueTime
      ? new Date(new Date(`${dueDate}T${dueTime}:00`).getTime() - 10 * 60 * 1000).toISOString()
      : "";

  // ---- 干净标题（只剥离 title，notes 保留）----
  if (title) cleanTitle = stripTokens(title) || "未命名任务";

  return {
    title: cleanTitle,
    priority,
    dueDate,
    dueTime,
    remindAt,
    repeat,
  };
}
