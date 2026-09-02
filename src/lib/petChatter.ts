/**
 * 轻宜灵动小字文案库。
 *
 * 按场景分组，池子足够大且会随机 + 避免重复，让桌宠显得"活"而非复读机。
 * 形式不止文字：`hint` 气泡为主；一些场景同时给推荐动作(如被点后 happy)。
 */

function pickNoRepeat(pool: string[], lastIdx: { v: number }): string {
  if (pool.length <= 1) return pool[0] ?? "";
  let idx = Math.floor(Math.random() * pool.length);
  if (idx === lastIdx.v) idx = (idx + 1) % pool.length;
  lastIdx.v = idx;
  return pool[idx];
}

/** 闲置闲聊：想引人去点它 */
const IDLE: string[] = [
  "点我呀～ 有事可以聊",
  "双击我逗逗～ 我会很开心",
  "把我甩出去试试！会弹来弹去哦",
  "我就在这陪着你～",
  "要不要一起看看今天还有哪些安排？",
  "发呆了～ 叫我一下嘛",
  "你能听见我吗？点我就能聊天啦",
  "右键我，有很多小秘密",
  "今天过得怎么样？想听你讲讲",
  "别看我，会害羞的～（真的吗）",
  "闲得慌…把我扔出去解解压？",
  "猜猜我现在是什么形状？",
  "转圈圈，转晕了就停",
  "有点想活动一下了……",
  "我刚刚看见你在忙，不打扰～",
  "双击有惊喜，试试？",
];

/** 被单击/唤起时 */
const GREETED: string[] = [
  "叫我做什么呀～",
  "哎！我在这呢",
  "你终于来找我啦",
  "嘿嘿，我就知道你会来",
  "有事吩咐？我听着呢",
  "今天有什么想让我帮忙的？",
  "被点到啦～ 高兴！",
];

/** 双击逗它 */
const PETTED: string[] = [
  "哈哈别闹～ 好痒！",
  "嘻嘻，再摸摸头",
  "被你摸到变形啦～",
  "好舒服…再来一下？",
  "（扭了扭）我在呢～",
  "你逗我，我也逗你！",
];

/** 甩出去瞬间 */
const THROWN: string[] = [
  "哇——！飞咯～",
  "啊啊啊你扔我！",
  "起飞！(转圈)",
  "呜～ 要被甩出去了！",
  "好快的速度！",
  "我会飞啦！",
];

/** 撞墙时 */
const HIT_WALL: string[] = [
  "哎哟！撞墙啦",
  "咚！好疼…",
  "这墙好硬！",
  "再来一次我还能弹！",
  "哇！弹起来了",
  "撞晕了…让我缓会儿",
];

/** 落地停住 */
const LANDED: string[] = [
  "呼～ 到站了！",
  "飞累了，歇会儿",
  "安全着陆~",
  "稳！我还能再飞一次",
  "落地真稳，不愧是我",
];

/** 被长按举着（onDown 但还没拖走） */
const HELD: string[] = [
  "诶？抓我干嘛…",
  "我有点重哦，拿稳了！",
  "打算把我丢去哪？",
  "放下我，我自己会走！",
  "被你举高高啦～",
];

/** 随机状态怪话（闲得无聊时吐一句没头没脑的） */
const QUIRKY: string[] = [
  "数据不会说谎，但我偶尔会～",
  "你知道吗，待办是圆的。",
  "我在想，明天会不会有很多事。",
  "一条一条划掉的感觉，最爽了。",
  "你打字的样子真专注。",
  "备忘录里是不是藏了什么小秘密？",
  "（假装没在偷看你的待办）",
  "如果待办是云，你已经有一朵了。",
  "别担心，船到桥头自然直～",
  "我猜你今天还没喝水。",
  "今日宜：轻松一点。",
  "休息一下也不错。",
];

export interface Chatter {
  idle(): string;
  greeted(): string;
  petted(): string;
  thrown(): string;
  hitWall(): string;
  landed(): string;
  held(): string;
  quirky(): string;
}

const lastIdx = { v: -1 };
const mk = (pool: string[]) => () => pickNoRepeat(pool, lastIdx);

export const petChatter: Chatter = {
  idle: mk(IDLE),
  greeted: mk(GREETED),
  petted: mk(PETTED),
  thrown: mk(THROWN),
  hitWall: mk(HIT_WALL),
  landed: mk(LANDED),
  held: mk(HELD),
  quirky: mk(QUIRKY),
};
