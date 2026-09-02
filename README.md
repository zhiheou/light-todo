<p align="center">
  <img src="https://img.shields.io/badge/%E8%BD%BB%E4%BE%8B%E5%BE%85%E5%8A%9E-Light%20Todo-36a3f7?style=flat-square" alt="Light Todo">
</p>

<h3 align="center">端到端加密 · 双空间隔离 · 一句话创建 · 多端自动同步 的轻量待办与备忘工作台</h3>

<p align="center">
  <a href="https://todo.aebuiyke.xyz"><img src="https://img.shields.io/badge/Online-todo.aebuiyke.xyz-36a3f7?style=flat-square" alt="Live"></a>
  <img src="https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-orange?style=flat-square" alt="Cloudflare">
  <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square" alt="TypeScript">
  <img src="https://img.shields.io/badge/E2EE-AES--256--GCM-4caf50?style=flat-square" alt="E2EE">
  <img src="https://img.shields.io/badge/version-v3.4-blue?style=flat-square" alt="Version">
</p>

---

「轻待办」是一款注重隐私的待办 + 备忘录工具。任何设备打开同一个网址、登录同一账号，任务和备忘录就会自动同步；你的数据在本地加密后上传，服务器只见密文。

## 📖 快速入口

- [🚀 在线体验](#-在线体验)
- [✨ 核心特性](#-核心特性)
- [🗂️ 功能总览](#-功能总览)
- [🔐 数据与隐私（两层安全体系）](#-数据与隐私两层安全体系)
- [🖥️ 本地运行](#-本地运行)
- [☁️ 部署到 Cloudflare](#-部署到-cloudflare)
- [🎹 快捷键](#-快捷键)
- [📁 目录结构](#-目录结构)
- [🗓️ 版本历史](#-版本历史)
- [📜 开源协议](#-开源协议)

## 🚀 在线体验

| 地址 | 说明 |
|---|---|
| **https://todo.aebuiyke.xyz** | 主域名，国内免代理可直接访问 |
| https://light-todo.light-todo-worker.workers.dev | 备用域名（部分网络可能被 SNI 屏蔽） |

注册账号即可使用。**注册时的密码 = 数据加密密钥**，请务必牢记——忘记密码将无法找回任何数据（这是端到端加密的特性，不是 bug）。

## ✨ 核心特性

- **一句话创建任务**：自然语言自动识别日期、提醒与循环规则
  - `明天10点提交周报` → 自动填好时间与提醒
  - `每天8点半喝水`、`每周一例会` → 自动生成循环任务
- **今日页多形态**：清单 / 维度打卡 / 时间线 / 日程 一键切换（v3.3）
- **日历视图**：周 / 月 / 年三级，周视图含「当周日历表 + 本周目标 + 当周统计」（v3.3）
- **目标管理**：年 / 月 / 周目标，任务关联目标实时进度（v3.3）
- **维度体系**：任务挂维度，维度打卡按组看进度（v3.3）
- **可切换外观**：4 主题色 × 4 字体 × 3 卡片风格 × 4 字号，刷新保持（v3.3）
- **桌面 + 移动端自适应**：移动端底部 TabBar + 抽屉菜单（v3.3）
- **编辑更顺手**：编辑标题带时间词自动识别、快捷日期 chip、点外部自动保存关闭（v3.4）
- **登录即「今日」**：登录落在今日，今日含未设日期任务（v3.4）
- **今日 / 回顾 / 备忘录** 三类视图，一眼看清今天要做什么
- **工作 / 个人双空间**：侧边栏一键切换，个人空间需本机访问码进入（防他人偷看）
- **端到端加密**：数据用账号密码派生的密钥加密，服务器只存密文，任何情况下无法解密
- **多端自动同步**：登录后每 30 秒自动拉取最新数据，窗口重新聚焦时立即同步；换设备登录即恢复
- **紧急隐藏**：一键隐藏个人内容并退回工作模式（`Ctrl+Shift+Alt+Esc`）

## 🗂️ 功能总览

| 模块 | 能力 | 说明 |
|---|---|---|
| 任务 | 增删改 / 完成 / 优先级 / 截止时间 / 提醒 | 默认提前 10 分钟提醒；支持循环任务 |
| 今日多形态 | 清单 / 维度 / 时间线 / 日程 | v3.3：四种视角看今日，顶部一键切换 |
| 日历 | 周 / 月 / 年三级视图 | v3.3：周视图含当周日历表 + 本周目标 + 当周完成统计；月视图任务热格；年视图全年热力图 |
| 目标 | 年 / 月 / 周目标 | v3.3：任务关联目标，完成自动推进进度条 |
| 维度 | 任务挂维度 / 维度打卡 | v3.3：按维度分组看进度，支持新建/重命名/删除 |
| 外观 | 主题色 / 字体 / 卡片 / 字号 | v3.3：4×4×3×4 组合，localStorage 持久化，无闪应用 |
| 备忘录 | Markdown / 标签 / 置顶 / 搜索 | v3.1 升级：编辑+预览双 tab，`- [ ]` 复选框勾选即保存 |
| 任务↔备忘 | **双向关联** | v3.1 新增：任务抽屉可关联备忘；备忘反显「被 N 个任务引用」，点击互跳；删除备忘自动清理引用，撤销删除自动恢复 |
| 标签 | 回车/逗号添加，列表顶部过滤 | 可与搜索叠加 |
| 空间 | 工作 / 个人双模式 | 个人空间用本机访问码作门锁 |
| 回顾 | 每日智能回顾 | 今日完成 / 未完成 / 逾期统计与建议；明日待办提前安排 |
| 移动端 | 底部 TabBar + 抽屉 | v3.3：≤768px 自适应，今日/全部/备忘/更多 |
| 编辑 | 标题 NLP 自动带时间 / 快捷日期 | v3.4：编辑标题含「今天下午4点」自动填截止时间；今天/明天/周末/下月 chip 一键定日期；点外部自动保存关闭 |
| 登录 | 默认落「今日」 | v3.4：今日含未设日期任务，快速添加立即可见 |
| 同步 | 账号自动同步 | 数据端到端加密随账号同步，无需手动备份/WebDAV |
| 隐私 | 端到端加密 | 数据本地加密后才上传 |

## 🔐 数据与隐私（两层安全体系）

| 层 | 用途 | 存储位置 | 换设备 |
|---|---|---|---|
| **账号密码** | 加密数据（AES-256-GCM，服务器只见密文） | 随账号同步 | 换设备登录照样同步 |
| **本机访问码** | 只做「门锁」——决定进个人空间要不要输码 | 仅本机 localStorage（存 PBKDF2 哈希摘要，非明文） | 不随账号同步 |

> 一句话记住：**数据安全靠账号密码，访问码只是本机第二道锁**——防止别人用你登录着的电脑偷看个人空间。访问码不参与数据加密，换设备后个人数据照常同步，只是那台设备的门锁密码不同。

- 密码 → PBKDF2(150k, SHA-256) 派生密钥 → AES-256-GCM 加密全部数据
- 服务器只存密文 + 随机 IV，无法解密任何用户数据
- 本机访问码仅存 PBKDF2 哈希摘要，不存明文
- 旧版个人空间备份（PIN 密钥加密）与账号密码密钥不互通，导入时自动忽略并提示

## 🖥️ 本地运行

```bash
# 1. 安装依赖
npm install
cd server && npm install && cd ..

# 2. 启动本地后端（API，监听 1450 端口）
npm run server

# 3. 另开终端启动前端
npm run dev
```

打开 `http://127.0.0.1:1420/`，点击左下角「登录账号」即可注册或登录（前端 `/api` 已通过 Vite 代理转发到本地后端）。

> 生产环境运行在 Cloudflare Workers + D1 上。想本地跑与线上完全一致的 Worker 后端：`cd worker && npm install && npx wrangler dev`（API 默认在 8787 端口，需将 `vite.config.ts` 的代理目标改为该端口）。

## ☁️ 部署到 Cloudflare

项目已接入 **Cloudflare Workers + D1**（SQLite），静态资源由 Wrangler `[assets]` 托管，SPA 与 API 同域、零 CORS。

```bash
# 1. 构建前端到 dist/
npm run build

# 2. 部署（含静态资源，在 worker/ 目录执行）
cd worker
wrangler deploy
```

- 需先配置 `CLOUDFLARE_API_TOKEN` 环境变量（Worker 权限 + `Workers D1: Edit`）
- 自定义域名在 Cloudflare 后台「Workers → 你的 worker → 设置 → 域」绑定（本项目为 `todo.aebuiyke.xyz`）
- 数据库迁移：`wrangler d1 execute light-todo --remote --file=migrations/xxx.sql`

> 历史的一键部署配置（Docker / Render / Railway）已随 v3 迁移到 Cloudflare 而停用，仓库中相关文件仅作存档。

## 🎹 快捷键

| 快捷键 | 作用 |
|---|---|
| `Ctrl+Shift+Alt+P` | 呼出个人空间解锁 |
| `Ctrl+Shift+Alt+Esc` | 紧急隐藏并退回工作模式 |
| `::vault` | 在添加弹窗标题输入，直接呼出个人空间解锁 |
| 品牌名旁小圆点 | 隐藏式切换工作 / 个人空间 |

## 📁 目录结构

```text
src/                  React 前端（TypeScript）
  components/         界面组件（TodayView 多形态 / CalendarView / GoalsView / AppearancePanel / MobileTabBar…）
  lib/                账号、加密、访问码、Markdown、自然语言解析、维度/目标/主题
worker/               Cloudflare Worker 后端（/api/* + D1）
  src/                Worker 逻辑
  migrations/         D1 数据库迁移
  wrangler.toml       部署配置（[assets] 静态托管 dist/）
server/               历史 Node 后端（本地开发 / 存档）
src-tauri/            Tauri 桌面壳（存档）
```

## 🗓️ 版本历史

| 版本 | 日期 | 内容 |
|---|---|---|
| v1 | — | 本地单机版（Tauri 桌面） |
| v2 | — | 多设备 + 自然语言 + 循环任务 |
| v3 | 2026-08-19 | 迁移 Cloudflare Workers + D1，端到端加密上线，账号体系 |
| v3.1 | 2026-08-20 | 任务↔备忘双向关联 + 备忘录 Markdown/标签 + 个人空间账号化重构 + 3 个数据丢失 bug 修复 |
| v3.2 | 2026-09-01 | 今日视图展示已完成 + 顶栏视图选项（显示/隐藏已完成、详情/精简）+ 完成时间徽标 |
| v3.3 | 2026-09-01 | UI 大改版：今日多形态（清单/维度/时间线/日程）+ 日历周/月/年 + 目标管理 + 维度体系 + 可切换外观（4 主题色×4 字体×3 卡片×4 字号）+ 桌面/移动端自适应 |
| v3.4 | 2026-09-02 | 交互打磨：登录落「今日」+ 今日含未设日期 + 侧栏数字随显示已完成联动 + 修「全部」滑不动 + 编辑标题自动识别日期时间 + 快捷日期 chip + 编辑点外部自动保存 + 回顾统计可点跳转 + 移除备份/同步/恢复 |

## 📜 开源协议

本项目为个人作品。部署、二次开发请遵守所引用开源依赖的许可协议。

---

*Made with ❤️ — 轻待办 Light Todo*
