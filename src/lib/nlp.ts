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

// 下一周的第一天（下周一 0 点）。"下周X"从这往后找。
function startOfNextWeek(now: Date): Date {
  const monday = startOfDay(now);
  // 今天偏移到本周一（周一=0）
  const offset = (now.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - offset + 7);
  return monday;
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
    // 范围校验：非法时间（25:00 / 13:75）直接忽略，避免拼出非法日期串在 toISOString 处抛错白屏
    if (hour > 23 || minute > 59) return null;
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
    // 范围校验：99点 / 9点99分 都判非法（防白屏）
    if (hour > 23 || minute > 59) return null;
    const isPm = /(下午|晚上|傍晚)/.test(text);
    const isNight = /(今晚|晚上|夜里|半夜)/.test(text);
    // "今晚12点" = 午夜（不是中午12点）→ 记 23:59（当天最后一刻，不回退到次日）
    if (isNight && hour === 12 && minute === 0) {
      return { time: "23:59", isPm: true };
    }
    // 注意：不做"裸小时默认下午"的推断——那会把常见的"8点/10点"错成 20:00/22:00，
    // 比"四点=04:00"更糟。保持用户字面表达，需下午时用户会说"下午四点"。
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
  /(?:下下|这|本|下)?(?:周|星期)[一二三四五六日天]/g,
  // v3.9.14：补"每个月N号 / 每N周"的剥离（原来只有"每月N号"→"每个月15号"整条漏掉，
  // 标题留残渣"每个月 交房租"且循环识别不到）
  /每\s*个?\s*月\s*\d{1,2}\s*[日号]/g,
  /每\s*(?:一|两|二|三|\d+)?\s*(?:周|星期)(?!\s*[一二三四五六日天])/g,
  /(?:下|本|这)个?月|月初|周末|尽快|尽早|抓紧/g,
  /今天|明天|后天|大后天/g,
  /(?:下班|中午|傍晚|晚饭|今天|明天|后天)?(?:前|之前|以前)/g,
  /月(?:底|末)/g,
  /(?:之前|以前|之内|以内|内)\s*(?:完成|提交|交|给|发|处理|搞定|弄好)?/g,
  /(?:下班|中午|傍晚|晚饭|早上|上午|下午|晚上|深夜|清晨|凌晨)/g,
  /\d{1,2}[月/]\d{1,2}[日号]?/g,
  /\d{1,2}[日号]/g,
  /\d{4}-\d{1,2}-\d{1,2}/g,
  /\d{1,2}[:：]\d{1,2}/g,
  /\d{1,2}点(?:半|一刻|三刻|\d{1,2}分?)?/g,
  // v3.9.14：补"X天后"（原来只剥离"X天内"，"3天后"的"3天"被吞数字规则吃掉 →
  // 标题变成"后交房租"）
  /[\d一二两三四五六七八九十]+\s*天(?:后|之后|以后)/g,
  /\d{1,2}\s*(?:天|日)\s*(?:之?内|内)?/g,
  /**
   * v3.9.14 🔴 去掉"吞掉所有中文数字"的分支。
   * 原规则 `[\d一二两三四五六七八九十]+` 会把标题里任何数字都吃掉：
   *   "买3斤苹果" → "买 斤苹果"；"把3个文件发我" → "把 个文件发我"。
   * 只保留真正表达时间的那两段：X小时(后) / 半分钟(后)。
   */
  /[\d一二两三四五六七八九十]+\s*个?\s*小时(?:后|之后)/g,
  /半\s*分钟?(?:后|之后)/g,
  /提醒/g,
];

function stripTokens(title: string): string {
  let clean = normalizeCnTime(title);
  for (const rule of STRIP_RULES) clean = clean.replace(rule, " ");
  // "记得/别忘了/记住" 开头：整体去掉（须先于"建待办外壳"，否则只剥到"记"剩个"得"）
  clean = clean.replace(/^\s*(?:记得|别忘了|记住|记着)\s*[，,：:、]?\s*/, "");
  // 前置"建待办"外壳：帮我记个待办：/记一下/添加个任务… → 去掉（避免"记个待办： 开会"残留）
  clean = clean.replace(
    /^\s*(?:请|麻烦|你|好呀|好的|可以)?\s*(?:帮我|给我|替我)?\s*(?:记|建|添加|加|设|安排|存|放)(?:个|一个|一下)?\s*(?:待办|任务|事项|备忘录|提醒)?\s*(?:里|中|上面)?\s*[，,：:、]?\s*/,
    "",
  );
  // 前置语气词（token 剥离后可能残留空格）："提醒我打卡" → "打卡"
  clean = clean.replace(/^\s*(请|麻烦|帮我|记得|提醒|我|你|一下)+\s*/g, " ");
  clean = clean
    .replace(/\s+/g, " ")
    .replace(/^[\s,，。.!！?？:：;；-]+|[\s,，。.!！?？:：;；-]+$/g, "");
  return clean.trim();
}

// 中文数字 → 阿拉伯数字（用于时间表达：点/号/日，1-31）
const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function cnToNum(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  if (s === "十") return 10;
  if (s.length === 2 && s[0] === "十") return 10 + (CN_NUM[s[1]] ?? 0);
  if (s.length === 2 && s[1] === "十") return (CN_NUM[s[0]] ?? 0) * 10;
  if (s.length === 3 && s[1] === "十") return (CN_NUM[s[0]] ?? 0) * 10 + (CN_NUM[s[2]] ?? 0);
  if (s.length === 1 && CN_NUM[s] !== undefined) return CN_NUM[s];
  return null;
}

/** 口语时间词归一 + 中文数字时间转阿拉伯（"明早"→"明天早上"、"八点"→"8点"、"十号"→"10号"） */
function normalizeCnTime(text: string): string {
  let t = text;
  // 口语时间词
  t = t
    .replace(/明早/g, "明天早上")
    .replace(/明晚/g, "明天晚上")
    .replace(/明儿个?/g, "明天")
    .replace(/后儿个?/g, "后天")
    .replace(/今早/g, "今天早上")
    .replace(/今儿个?/g, "今天")
    .replace(/今晚/g, "今天晚上")
    .replace(/半晌|晌午/g, "中午");
  // 中文数字 + 时间单位（仅当紧邻 点/号/日 时转换，避免"一点小事"误伤）
  t = t.replace(/([一二两三四五六七八九十]{1,3})(?=\s*(?:点|号|日))/g, (m) => {
    const n = cnToNum(m);
    return n === null ? m : String(n);
  });
  return t;
}

export function parseQuickAdd(input: ParseInput): QuickAddParse {
  const title = input.title.trim();
  const notes = (input.notes ?? "").trim();
  const now = input.now ?? new Date();
  const merged = normalizeCnTime(`${title} ${notes}`.trim());

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
  /**
   * v3.9.14 🔴 "每个月15号/每月15号"都要认（原来只认"每月"，"每个月"整条漏掉 →
   * 用户说"每个月15号交房租"，结果**没有循环**、标题还留着"每个月"）。
   */
  const monthly = merged.match(/每\s*个?\s*月\s*(\d{1,2})\s*[日号]/);
  if (monthly) {
    const day = Number(monthly[1]);
    if (day >= 1 && day <= 31) {
      repeat = { freq: "monthly", interval: 1, dayOfMonth: day };
      dueDate = toDateString(nextMonthlyDay(day, now));
    }
  }

  const weekly = merged.match(/每(?:周|星期)([一二三四五六日天])/);
  if (weekly && !repeat) {
    const weekday = WEEKDAYS[weekly[1]];
    repeat = { freq: "weekly", interval: 1, weekday };
    dueDate = toDateString(nextWeekday(weekday, now));
  }

  /**
   * v3.9.14 🔴 补"每2周开会 / 每两周开会"（原来只认"每周X"，
   * "每2周开会"标题变"每 周开会"、无循环、无日期）。
   */
  const everyNWeeks = merged.match(/每\s*(?:隔\s*)?([\d一二两三四五六七八九十]+)\s*(?:周|星期)(?!\s*[一二三四五六日天])/);
  if (everyNWeeks && !repeat) {
    const n = /^\d+$/.test(everyNWeeks[1]) ? Number(everyNWeeks[1]) : cnToNum(everyNWeeks[1]) ?? 1;
    if (n >= 1 && n <= 52) {
      repeat = { freq: "weekly", interval: n, weekday: now.getDay() };
      dueDate = toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n * 7));
    }
  }

  /** v3.9.14：补"每周交周报"（不带周几）—— 默认按今天算下一周 */
  const everyWeekBare = /每\s*(?:周|星期)(?!\s*[一二三四五六日天])/.test(merged);
  if (everyWeekBare && !repeat) {
    repeat = { freq: "weekly", interval: 1, weekday: now.getDay() };
    dueDate = toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
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
  // 「周几」：A) "周/星期"带限定词这/本/下；B) 裸"周五"（仅当句首/空格后，避免"三"在"买三斤"误判）。
  // 今天周五 09-04 →「周五」「这周五」=今天；「下周五」=09-11；「下周二」=09-08。
  const weekdayDate = merged.match(/(下下|下|这|本)?(?:周|星期)([一二三四五六日天])/);
  const bareWeekday = merged.match(/(^|[\s,，。.!！?？:：;；(（])([一二三四五六日天])(前|之前|以前|下班前|完成|交|给|发|开会|会议|汇总|提交|汇报|截止)/);
  const parseWeekdayAnchor = (day: number, which?: string): Date => {
    if (which === "下下") {
      const d = nextWeekday(day, startOfNextWeek(now));
      d.setDate(d.getDate() + 7); // 再下一周
      return d;
    }
    if (which === "下") return nextWeekday(day, startOfNextWeek(now));
    return nextWeekday(day, now); // 这/本/无词：不早于今天的最近一次（今天若是就今天）
  };
  if (weekdayDate && !repeat) {
    const day = WEEKDAYS[weekdayDate[2]];
    dueDate = toDateString(parseWeekdayAnchor(day, weekdayDate[1]));
  } else if (bareWeekday && !repeat && !dueDate) {
    const day = WEEKDAYS[bareWeekday[2]];
    if (day !== undefined) dueDate = toDateString(parseWeekdayAnchor(day, undefined));
  } else if (weekdayDate && repeat && repeat.freq === "weekly") {
    // 已由循环规则处理，避免重复覆盖
  }

  // 「周末」= 最近的周六；「下个月(同一天)」= 下月同日；「尽快/尽早」= 今天
  if (/周末/.test(merged) && !dueDate) {
    dueDate = toDateString(nextWeekday(6, now)); // 周六
  }
  if (/(下|本|这)个月/.test(merged) && !dueDate) {
    // "下个月5号" → 下月5号（而非本月）
    const dm = merged.match(/([\d]{1,2})[日号]/);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, dm ? Number(dm[1]) : now.getDate());
    dueDate = toDateString(nextMonth);
  }
  if (/月初/.test(merged) && !dueDate) {
    dueDate = toDateString(new Date(now.getFullYear(), now.getMonth() + 1, 1)); // 下月1号
  }
  if (/(尽快|尽早|抓紧)/.test(merged) && !dueDate) {
    dueDate = toDateString(now);
  }

  // 相对时间："两个小时后/半小时后/30分钟后/一会儿/待会儿"
  const relHour = merged.match(/([\d一二两三四五六七八九十]+)\s*个?\s*小时(?:后|之后)/);
  const relHalfHour = /半\s*个?\s*小时(?:后|之后)/.test(merged); // "半小时后"
  const relMin = merged.match(/([\d一二两三四五六七八九十]+)\s*分钟?(?:后|之后)/);
  const relSoon = /(待会|待会儿|一会儿|马上|立刻)/.test(merged); // 模糊"一会儿"→ 30 分钟后
  if ((relHour || relMin || relHalfHour || relSoon) && !dueTime) {
    let addMin = 0;
    if (relHour) {
      const h = /^\d+$/.test(relHour[1]) ? Number(relHour[1]) : cnToNum(relHour[1]) ?? 0;
      addMin = h * 60;
    } else if (relHalfHour) {
      addMin = 30;
    } else if (relMin) {
      addMin = /^\d+$/.test(relMin[1]) ? Number(relMin[1]) : cnToNum(relMin[1]) ?? 0;
    } else if (relSoon) {
      addMin = 30;
    }
    const d = new Date(now.getTime() + addMin * 60000);
    dueDate = toDateString(d);
    dueTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /**
   * v3.9.14 🔴 修"X天后"整条丢失（独立审查发现的真 bug）。
   * 原来只支持"今天/明天/后天"，"3天后""三天后"完全没有解析规则，
   * 而剥离规则又把"3天"吃掉 → 标题变成"后交房租"、**日期为空**，
   * 保存后同步到云端，任务就永远不知道是哪天了。
   */
  const relDay = merged.match(/([\d一二两三四五六七八九十]+)\s*天(?:后|之后|以后)/);
  if (relDay) {
    const n = /^\d+$/.test(relDay[1]) ? Number(relDay[1]) : cnToNum(relDay[1]) ?? 0;
    if (n > 0 && n <= 365) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
      dueDate = toDateString(d);
    }
  }

  // v3.9.14 🔴 "大后天"必须在"后天"之前判断（否则会先匹配到"后天"变成 +2 天）
  const relative = merged.match(/(大后天|今天|明天|后天)/);
  if (relative) {
    const offset = relative[1] === "明天" ? 1 : relative[1] === "后天" ? 2 : relative[1] === "大后天" ? 3 : 0;
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
  } else if (!dueDate) {
    // 注意：仅在还没算出日期时才用"X号"兜底，否则会覆盖"下个月5号"已算出的 10-05
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

  // ---- "X前/之前/月底前/下班前" 截止限定词 ----
  // 语义：说"下周二前给方案"→ 截止=下周二当天；"这周五之前交"→ 截止=这周五；
  // "月底前"→ 本月最后一天；"下班前/中午前"→ 当天对应时刻（配合上面日期）。
  const hasDeadlineWord = /(前|之前|以前|前完成|前交|之前交)/.test(merged);
  const monthEnd = merged.match(/月(底|末)(前|之前|以前)?/);
  if (monthEnd) {
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0); // 本月最后一天
    dueDate = toDateString(last);
  }
  const eodQualifier = merged.match(/(下班|中午|傍晚|晚上|今天|明天|后天)?\s*(下班前|中午前|傍晚前|晚饭前)/);
  if (eodQualifier) {
    const q = eodQualifier[2];
    if (!dueDate) dueDate = toDateString(now); // 无日期词则默认今天
    // 下班前≈18:00；中午前≈12:00；傍晚前/晚饭前≈17:00
    if (!dueTime) dueTime = q === "中午前" ? "12:00" : q === "下班前" ? "18:00" : "17:00";
  }
  // "X日内/之内/内"（3天内）→ 顺延 N 天
  const withinN = merged.match(/(\d{1,2})\s*(?:天|日)\s*(?:之?内|内)/);
  if (withinN && !dueDate) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Number(withinN[1]));
    dueDate = toDateString(d);
  }
  void hasDeadlineWord; // 锚点日期已在上面规则算好，这里不重复改

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
