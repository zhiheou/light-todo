import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 轻宜「考试系统」· 第 19 科：下载页与安装包的**一致性**
 *
 * 为什么单独开一科（v3.9.21）：
 *   下载页曾经长期指着 v3.9.4 的安装包，而桌面版代码已经做到 3.9.20 ——
 *   用户在下载页拿到的永远是四个月前的旧版本，而且**没有任何地方会报错**。
 *   这类"配置漂移"（代码在走、配置没跟）是最难靠人工发现的：
 *   页面能打开、按钮能点、包能下载，一切"看起来正常"。
 *
 * 这一科把三处版本号钉在一起：
 *   desktop/package.json（打包用的版本）
 *   src/lib/downloads.ts（下载页显示的版本 + 链接里的文件名）
 * 只要有一处掉队，测试立刻红。
 */

const pkg = JSON.parse(
  readFileSync(new URL("../desktop/package.json", import.meta.url), "utf8"),
) as { version: string };

const downloads = readFileSync(new URL("../src/lib/downloads.ts", import.meta.url), "utf8");

/** 从 downloads.ts 里抠出一个字段的字符串值（不引入 ts 运行时，直接读文本） */
function field(name: string): string {
  const m = downloads.match(new RegExp(`${name}:\\s*"([^"]*)"`));
  if (!m) throw new Error(`downloads.ts 里没找到字段 ${name}`);
  return m[1];
}

describe("下载页与安装包一致性", () => {
  it("下载页的版本号必须等于桌面版 package.json 的版本号", () => {
    /**
     * v3.9.20 的血泪：桌面版版本号从 3.9.4 一直没动，下载页也跟着停在 3.9.4。
     * 结果用户下载到的永远是最旧的包。两边必须一起改 —— 这条测试就是那个"一起"。
     */
    expect(
      field("version"),
      `downloads.ts 写的版本是 ${field("version")}，` +
        `而桌面版已经做到 ${pkg.version} —— 下载页会给用户旧包，赶紧同步。`,
    ).toBe(pkg.version);
  });

  it("下载链接里的文件名必须带当前版本号（否则点了 404）", () => {
    /**
     * 版本号改了、链接没改 → 用户点下载直接 404。
     * 这比"下到旧包"更糟：连包都没有。
     */
    const v = pkg.version;
    for (const os of ["windows", "mac"] as const) {
      const url = field(os);
      expect(url.length, `${os} 的下载链接不能为空`).toBeGreaterThan(0);
      expect(
        url.includes(v),
        `${os} 的下载链接是「${url}」，里面没有版本号 ${v} —— 用户点了会 404。`,
      ).toBe(true);
    }
  });

  it("下载链接必须走我们自己的域名（不能是 GitHub）", () => {
    /**
     * GitHub Releases 在国内实测只有 ~33KB/s，91MB 的 Mac 包要下 45 分钟。
     * 所有面向用户的下载链接都必须走 R2 + 我们自己的域名（实测 1.6MB/s）。
     */
    for (const os of ["windows", "mac"] as const) {
      const url = field(os);
      expect(
        url.startsWith("https://todo.aebuiyke.xyz/"),
        `${os} 的下载链接指向了「${url}」—— 必须走我们自己的域名，` +
          "GitHub 在国内慢到没法用（实测 33KB/s）。",
      ).toBe(true);
    }
  });

  it("两个系统的安装包都必须配好（Mac 版不能留空）", () => {
    expect(field("windows")).toContain(".exe");
    expect(field("mac"), "Mac 版下载链接不能是空的，否则页面显示「即将开放」").toContain(".zip");
  });
});
