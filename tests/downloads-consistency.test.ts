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
) as { version: string; build: { mac: { artifactName: string; target: Array<{ arch: string[] }> } } };

const downloads = readFileSync(new URL("../src/lib/downloads.ts", import.meta.url), "utf8");

/** 从 downloads.ts 里抠出一个字段的字符串值（不引入 ts 运行时，直接读文本） */
function field(name: string): string {
  const m = downloads.match(new RegExp(`${name}:\\s*"([^"]*)"`));
  if (!m) throw new Error(`downloads.ts 里没找到字段 ${name}`);
  return m[1];
}

/** 取出 pickMacDownload 的函数体源码文本（判断据用） */
function pickMacBody(): string {
  const src = readFileSync(new URL("../src/lib/downloads.ts", import.meta.url), "utf8");
  const from = src.indexOf("export function pickMacDownload");
  const NL = String.fromCharCode(10); // 换行；写成字面量会被转义坑到
  const to = src.indexOf(NL + "}", from);
  return src.slice(from, to);
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
    for (const os of ["windows", "macIntel", "macApple"] as const) {
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
    for (const os of ["windows", "macIntel", "macApple"] as const) {
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
    expect(field("macIntel"), "Mac(Intel) 下载链接不能是空的，否则页面显示「即将开放」").toContain(".zip");
    expect(field("macApple"), "Mac(Apple 芯片) 下载链接不能是空的，否则页面显示「即将开放」").toContain(".zip");
  });
});

/**
 * 第 21 科：Mac 两个芯片的包不许互相覆盖。
 *
 * 🔴 用户原话（2026-09-27）：「苹果电脑还是不行，显示你无法打开应用程序清代版，
 *    因为这台mac不支持应用程序」—— 2018 款 Intel MacBook Pro。
 *
 * 查清的事实（拆开线上包验的，不是猜的）：
 *   · `/dl/light-todo-setup-3.9.21-mac.zip` 里的主程序是 **arm64**（Apple 芯片专用）
 *   · GitHub Release 里 **只有一个 mac.zip**（91MB）—— 本该有 Intel + Apple 两份
 *   · 根因：`artifactName` 是 `light-todo-setup-${version}-mac.${ext}`，**没带芯片名**，
 *     electron-builder 按 x64、arm64 先后打包，**用了同一个文件名，后者覆盖前者**
 *     → 磁盘上只剩一个，上传的也就只有一个
 *
 * 这类 bug 的可怕之处：**每一步都"成功"了** —— 构建成功、上传成功、下载成功、
 * 页面正常、按钮能点。只有用户装的时候才会发现，而且报的错完全看不懂。
 */
describe("Mac 芯片：两个架构的包不许互相覆盖", () => {
  it("【本次事故】mac 的 artifactName 必须带 ${arch}，否则两个包会撞名覆盖", () => {
    const name = pkg.build.mac.artifactName;
    expect(
      name.includes("${arch}"),
      `mac.artifactName 是「${name}」—— 没带芯片名。` +
        "x64 和 arm64 会打包成同一个文件名、互相覆盖，线上只剩一个，" +
        "另一种芯片的用户装不上（报「这台 Mac 不支持此应用程序」）。",
    ).toBe(true);
  });

  it("mac 必须同时打 x64 和 arm64 两种架构", () => {
    const arches = pkg.build.mac.target.flatMap((t) => t.arch ?? []);
    expect(arches, "Mac 必须同时支持 Intel(x64) 与 Apple 芯片(arm64)").toContain("x64");
    expect(arches).toContain("arm64");
  });

  it("下载页必须按芯片分流（不能两个芯片共用一个链接）", () => {
    const intel = field("macIntel");
    const apple = field("macApple");
    expect(intel, "Intel 包和 Apple 芯片包必须是两个不同的链接").not.toBe(apple);
    expect(intel).toContain("x64");
    expect(apple).toContain("arm64");
  });

  it("判芯片不能拿 UA 里那个 Intel Mac OS X 当依据（两种芯片都有这串）", () => {
    /**
     * Mac 的 UA 里 **Intel 和 Apple 芯片都会带** "Intel Mac OS X"（历史遗留的固定串）。
     * 拿它判芯片 → 把所有 Apple 芯片用户都判成 Intel。
     * 正确判据是 arm64（Apple 芯片的浏览器才会带）。
     */
    const body = pickMacBody();
    expect(
      body.includes("Intel Mac OS X"),
      "pickMacDownload 里不能拿 Intel Mac OS X 当芯片判据 —— 两种芯片的 UA 都有这串。",
    ).toBe(false);
    expect(/arm64/i.test(body), "判据应该是 UA 里有没有 arm64").toBe(true);
  });

  it("判不出来时必须默认给 Intel 版（arm64 包在 Intel 机器上根本装不上）", () => {
    /**
     * 安全性是不对称的：
     *   · Intel 包在 Apple 芯片上**能跑**（Rosetta 转译）
     *   · arm64 包在 Intel 机器上**根本装不上**
     * 所以默认值偏 Intel 才安全。
     */
    const body = pickMacBody();
    const ternary = body.slice(body.indexOf("?"));
    expect(
      ternary.indexOf("DOWNLOADS.macApple") < ternary.indexOf("DOWNLOADS.macIntel"),
      "pickMacDownload 必须是「带 arm64 → Apple 版，否则 → Intel 版」",
    ).toBe(true);
  });
});
