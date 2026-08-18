import type { Priority, QuickAddParse } from "../types";

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

function toTimeString(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nextWeekday(day: number, now: Date, nextWeek = false): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let diff = (day - now.getDay() + 7) % 7;
  if (nextWeek) diff += 7;
  if (diff === 0 && !nextWeek) diff = 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function strip(text: string, token: string): string {
  return text.replace(token, " ");
}

export function parseQuickAdd(input: string, now: Date): QuickAddParse {
  let text = input.trim();
  let dueDate = "";
  let dueTime = "";
  let priority: Priority = 3;

  const priorityRules: Array<{ re: RegExp; p: Priority }> = [
    { re: /(高|紧急|P1|p1)/, p: 1 },
    { re: /(重要|中|P2|p2)/, p: 2 },
    { re: /(低|P3|p3)/, p: 3 },
    { re: /(无|P4|p4)/, p: 4 },
  ];

  for (const rule of priorityRules) {
    if (rule.re.test(text)) {
      priority = rule.p;
      text = strip(text, rule.re.exec(text)![0]);
      break;
    }
  }

  const weekday = text.match(/(下?周)([一二三四五六日天])/);
  if (weekday) {
    const day = WEEKDAYS[weekday[2]];
    dueDate = toDateString(nextWeekday(day, now, weekday[1] === "下周"));
    text = strip(text, weekday[0]);
  }

  const relative = text.match(/(今天|明天|后天)/);
  if (relative) {
    const offset = relative[1] === "明天" ? 1 : relative[1] === "后天" ? 2 : 0;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    dueDate = toDateString(d);
    text = strip(text, relative[0]);
  }

  const monthDay = text.match(/(\d{1,2})[月/](\d{1,2})[日号]?/);
  if (monthDay) {
    const year = now.getFullYear();
    const d = new Date(year, Number(monthDay[1]) - 1, Number(monthDay[2]));
    const today = new Date(year, now.getMonth(), now.getDate());
    if (d.getTime() < today.getTime()) d.setFullYear(year + 1);
    dueDate = toDateString(d);
    text = strip(text, monthDay[0]);
  }

  const isPm = /(下午|晚上|傍晚)/.test(text);
  text = text.replace(/(上午|中午|下午|晚上|傍晚)/g, " ");

  const time = text.match(/(\d{1,2})[:：点](\d{1,2})?/);
  if (time) {
    let hour = Number(time[1]);
    const minute = time[2] ? Number(time[2]) : 0;
    if (isPm && hour < 12) hour += 12;
    dueTime = toTimeString(new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute));
    text = strip(text, time[0]);
  }

  const hasReminderKeyword = /提醒/.test(text);
  text = text.replace(/提醒/g, " ");
  if (hasReminderKeyword && !dueTime) dueTime = "09:00";
  if (dueTime && !dueDate) dueDate = toDateString(now);
  if (hasReminderKeyword && !dueDate) dueDate = toDateString(now);

  const remindAt =
    dueDate && dueTime
      ? new Date(new Date(`${dueDate}T${dueTime}:00`).getTime() - 10 * 60 * 1000).toISOString()
      : "";

  const title = text
    .replace(/\s+/g, " ")
    .replace(/^[\s,，。.!！?？:：;；-]+|[\s,，。.!！?？:：;；-]+$/g, "")
    .trim();

  return {
    title: title || "未命名任务",
    priority,
    dueDate,
    dueTime,
    remindAt,
  };
}
