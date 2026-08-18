# 轻待办 项目完整交接文档

> 文档版本：V3.0  
> 编写日期：2026-08-19  
> 适用代码版本：`outputs/light-todo-v3`  
> 交接目标：让另一位 AI 或开发者不需要额外提问即可理解项目、运行项目、继续开发。

## 1. 文档目的

本文档是"轻待办"项目的完整交接材料，覆盖：

- 项目背景与要解决的问题
- 需求说明与产品功能
- 技术架构与实现方式
- 数据模型、加密与安全设计
- 项目目录与文件职责
- 本地运行、云端部署与公网访问方法
- API 接口说明
- 已执行的验证与测试记录
- 已知限制与后续路线

## 2. 项目背景

用户每天面对大量细小、零散的任务，容易遗忘，需要一款集中管理任务清单的平台。用户在公司电脑上工作时，还希望：

- 工作任务和个人任务完全分开。
- 个人任务在公司电脑上不能留下可见残留（标题栏、任务栏、通知、截图、日志等）。
- 支持提醒，避免遗漏重要事项。
- 希望它是一个"公开网站"：任何电脑、笔记本、手机用浏览器打开同一个网址，登录同一个账号后即可看到全部数据，无需额外配置。

现有主流产品（Todoist、TickTick、Microsoft To Do 等）任务能力成熟，但都缺少"公司电脑上的隐蔽双模式"；而本项目的账号同步模式补上了"任何设备登录即同步"的需求。

## 3. 需求说明

### 3.1 核心功能需求

- 任务管理：添加、编辑、删除、标记完成、撤销删除。
- 任务字段：标题、备注、优先级 P1-P4、截止日期、截止时间、提醒时间。
- 排序与视图：按优先级或截止日期排序；今日、全部、已完成、备忘录、每日回顾视图。
- 快速添加：点击"+"弹出添加弹窗；任务标题支持自然语言解析，例如"明天 10:00 提交周报 高"。
- 提醒：默认在截止时间前 10 分钟提醒，可在弹窗中修改。
- 备忘录：记录零散小事，支持置顶、搜索、编辑、删除。
- 每日智能回顾：统计今日完成、今日未完成、逾期、明日待办，并生成当日建议。
- 明日待办：在回顾页列出明天到期的任务，可勾选完成或编辑。
- 双模式：工作模式 / 个人模式，个人模式需要访问码解锁。
- 隐藏机制：顶部小圆点隐藏式切换、`Ctrl+Shift+Alt+P` 解锁、`Ctrl+Shift+Alt+Esc` 紧急隐藏、弹窗标题输入 `::vault` 或 `#个人` 触发解锁、失焦自动锁定。
- 账号系统：注册、登录、退出；登录后数据自动同步。
- 多设备同步：任何设备浏览器打开同一网址，登录同一账号后自动下载、自动上传。

### 3.2 非功能需求

- 数据隐私：任务、备忘录使用端到端加密，服务器只能看到密文。
- 离线可用：浏览器端仍保留本地存储，未登录时也可作为本地应用使用。
- 响应式：桌面和移动端浏览器均可使用。
- 低门槛：用户只需要"打开网址 + 登录账号"，不需要配置服务器、密钥或同步口令。

## 4. 产品介绍与功能清单

### 4.1 产品定位

"轻待办"是一个本地优先、账号同步的双模式任务工作台。它以简洁高效为原则，同时满足公司电脑隐私保护与跨设备数据同步。

### 4.2 已实现功能

| 模块 | 功能 |
| --- | --- |
| 双模式 | 工作/个人空间隔离，个人模式访问码解锁 |
| 任务 | 增删改查、完成、撤销、优先级、截止日期/时间、提醒 |
| 自然语言 | 弹窗标题解析"明天/今天/后天/周X/月日 + 时间 + 优先级" |
| 视图 | 今日、全部、已完成、备忘录、每日回顾 |
| 每日回顾 | 今日完成/未完成/逾期/明日待办统计与建议 |
| 备忘录 | 置顶、搜索、编辑、删除 |
| 提醒 | 默认截止前 10 分钟，应用内到点提示 |
| 隐藏 | 小圆点切换、快捷键、隐藏口令、失焦自动锁定 |
| 本地安全 | 个人数据 AES-GCM 加密，访问码 PBKDF2 派生密钥 |
| 账号 | 注册、登录、退出，httpOnly Cookie 会话 |
| 云端同步 | 登录后自动上传（0.8s 防抖）、每 30s 拉取、窗口聚焦拉取 |
| 备份 | 本地加密备份导出/恢复 |
| WebDAV | 保留高级手动同步选项 |
| 部署 | Dockerfile、docker-compose、render.yaml、railway.json |

### 4.3 规划中功能

- 清单/项目分类
- 标签与智能过滤器
- 子任务、任务关联
- 重复任务
- 日历/看板视图
- 统计趋势（完成率、连续完成天数）
- 语音输入
- 习惯打卡、番茄钟
- 离线 CRDT 合并（Yjs / Automerge）
- 移动端 PWA 优化

## 5. 技术架构

### 5.1 总体结构

```text
浏览器（React 前端）
        │
        │ /api/*
        ▼
Node.js Express 后端
        │
        ├─ SQLite（node:sqlite）
        │    ├─ users：账号与密码哈希
        │    └─ workspaces：加密工作区
        │
        └─ 静态文件（dist/，生产环境由 Express 托管）
```

### 5.2 技术栈

- 前端：React 19、TypeScript、Vite 7、lucide-react
- 桌面壳：Tauri 2（保留，但 v3 以 Web 为主）
- 后端：Node.js 24、Express 4、cookie-parser
- 数据库：Node 内置 `node:sqlite`
- 加密：Web Crypto API，PBKDF2 + AES-GCM
- 部署：Docker / Railway / Render / Cloudflare Tunnel

### 5.3 加密设计

1. 注册时前端生成随机 `keySalt`（16 字节，Base64）。
2. 客户端用 `PBKDF2(password, keySalt, 150000, SHA-256)` 派生 AES-GCM 256 位密钥。
3. 每次保存工作区时生成随机 12 字节 IV，加密整份 `AppData` JSON。
4. 服务器只保存 `{ keySalt, iv, data }` 中的密文与盐，无法读取明文。
5. 忘记密码 = 无法解密，无法找回数据（这是 E2EE 的固有取舍）。

### 5.4 同步机制

- 登录成功后：下载服务器工作区，解密并替换本地状态。
- 数据变化后：800ms 防抖自动加密上传。
- 登录状态下：每 30 秒自动拉取；窗口重新聚焦时立即拉取。
- 冲突策略：当前为"最后写入覆盖"（单用户多设备足够；并发编辑需要后续 CRDT）。

## 6. 数据模型与存储

### 6.1 服务器 SQLite

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,   -- scrypt$salt$hash
  key_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE workspaces (
  user_id INTEGER PRIMARY KEY,
  iv TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

数据库文件：`server/data/light-todo.db`。

### 6.2 前端工作区数据结构

```ts
interface AppData {
  workTasks: Task[];
  workMemos: Memo[];
  personalTasks: Task[];
  personalMemos: Memo[];
  updatedAt: number;
}
```

`Task` 字段：

```ts
interface Task {
  id: string;
  title: string;
  notes: string;
  priority: 1 | 2 | 3 | 4;
  dueDate: string;   // YYYY-MM-DD 或 ""
  dueTime: string;   // HH:mm 或 ""
  remindAt: string;  // ISO 时间或 ""
  completed: boolean;
  createdAt: number;
  updatedAt: number;
}
```

`Memo` 字段：

```ts
interface Memo {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}
```

### 6.3 浏览器本地存储

- `lighttodo:work:v1`：工作任务（明文，本地缓存）。
- `lighttodo:work-memos:v1`：工作备忘录。
- `lighttodo:vault:v1`：个人任务+备忘录的 AES-GCM 加密库。
- `lighttodo:pin:v1`：已废弃（旧版 PIN 哈希），v3 已迁移到 `vault.ts` 的加密结构。
- `lighttodo:sync:v1`：WebDAV 同步配置（sessionStorage）。

## 7. API 接口

所有接口前缀 `/api`，需要登录的接口使用 httpOnly Cookie `lighttodo_session`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| POST | `/api/register` | 注册，body 含 username/password/keySalt/iv/data |
| POST | `/api/login` | 登录，返回 `{ username, keySalt }` |
| POST | `/api/logout` | 退出登录 |
| GET | `/api/me` | 返回当前用户名 |
| GET | `/api/workspace` | 返回 `{ keySalt, iv, data }` |
| PUT | `/api/workspace` | 上传加密工作区，body 含 `{ iv, data }` |

错误格式统一为 `{ "error": "说明" }`。

## 8. 项目目录与文件地图

### 8.1 版本目录

```text
outputs/
├── light-todo-v1.0/          已冻结的 1.0 版本，不要再修改
├── light-todo-v2/            v2 交互迭代版本
├── light-todo-v3/            当前活跃版本（账号同步 + 回顾）
└── 轻待办-项目完整交接文档.md  本文档
```

### 8.2 v3 核心文件

```text
light-todo-v3/
├── index.html                  页面入口，标题"轻待办"
├── package.json                前端依赖与脚本
├── vite.config.ts              Vite 配置，/api 代理到 1450
├── Dockerfile                  多阶段 Docker 构建
├── docker-compose.yml          Docker Compose
├── render.yaml                 Render 一键部署
├── railway.json                Railway 一键部署
├── src/
│   ├── main.tsx                React 入口
│   ├── App.tsx                 主应用：状态、账号、同步、视图
│   ├── styles.css              全局样式
│   ├── types.ts                类型定义
│   ├── components/
│   │   ├── Sidebar.tsx         侧栏：导航、账号、备份、同步
│   │   ├── TaskList.tsx        任务列表
│   │   ├── TaskDrawer.tsx      任务编辑抽屉
│   │   ├── MemoList.tsx        备忘录列表
│   │   ├── MemoDrawer.tsx      备忘录编辑抽屉
│   │   ├── ReviewView.tsx      每日智能回顾 + 明日待办
│   │   ├── AddDialog.tsx       添加任务/备忘弹窗
│   │   ├── AccountDialog.tsx   账号登录/注册弹窗
│   │   ├── SyncDialog.tsx      WebDAV 同步弹窗（高级选项）
│   │   └── PinGate.tsx         个人模式访问码
│   └── lib/
│       ├── tasks.ts            任务存储、排序、过滤
│       ├── memos.ts            备忘录存储
│       ├── vault.ts            个人数据加密库
│       ├── account.ts          账号 API 与工作区加解密
│       ├── nlp.ts              自然语言解析
│       ├── backup.ts           备份导出/导入
│       ├── sync.ts             WebDAV 同步客户端
│       └── syncCrypto.ts       WebDAV 同步加解密
├── server/
│   ├── server.js               Express 服务：账号、工作区、静态托管
│   ├── db.js                   SQLite 初始化
│   └── package.json            后端依赖
├── src-tauri/                  Tauri 桌面壳（保留）
└── data/                       运行时生成，SQLite 数据库（勿提交）
```

### 8.3 关键实现说明

- `App.tsx` 是唯一主状态容器：同时管理工作/个人任务、备忘录、账号、同步、弹窗。
- 个人模式数据仍保留本地 PIN 加密；账号同步将整份 `AppData` 用账号密码加密。
- 服务器会话保存在内存 Map 中，重启后端后所有用户需重新登录。

## 9. 运行与部署

### 9.1 本地运行

```bash
cd outputs/light-todo-v3
npm install
cd server
npm install
cd ..
npm run server
```

另开一个终端：

```bash
npm run dev
```

打开 `http://127.0.0.1:1420/`。

### 9.2 Docker

```bash
docker compose up --build
```

访问 `http://localhost:1450/`。

### 9.3 Render（推荐免费起步）

1. 把 `light-todo-v3` 推送到 GitHub。
2. Render 新建 Web Service，选择 Docker。
3. 使用仓库内的 `render.yaml`，自动读取 `Dockerfile`。
4. 部署完成后会得到一个长期 HTTPS 网址。

### 9.4 Railway

1. 推送 GitHub 仓库。
2. Railway 新建项目并选择该仓库。
3. 使用 `railway.json` 自动配置 Docker 构建与启动命令。

### 9.5 Cloudflare 命名隧道（保留现有域名）

如果已有 Cloudflare 账号和域名，可创建命名隧道指向 `http://127.0.0.1:1450`，即可获得稳定公网网址；临时 quick tunnel 只适合测试。

### 9.6 当前临时公网地址

`https://thread-coins-forecast-accordingly.trycloudflare.com`

该地址依赖本机 cloudflared 进程，进程停止后失效。

## 10. 测试与验证记录

已执行的自动化验证（Playwright + Edge）：

| 场景 | 结果 |
| --- | --- |
| 前端构建 `npm run build` | 通过 |
| 本地前端 200 / 后端 200 | 通过 |
| 公网首页 200 / 公网 API 200 | 通过 |
| A 注册并添加任务，B 登录自动同步 | 通过 |
| B 添加任务，A 聚焦窗口自动拉取 | 通过 |
| 服务器工作区仅存密文，无明文任务 | 通过 |
| 弹窗添加任务、默认提前 10 分钟提醒 | 通过 |
| 备忘录添加 | 通过 |
| 个人模式访问码与隐藏切换 | 通过 |
| 每日回顾视图渲染 | 通过 |
| 移动端 390px 无横向溢出 | 通过 |
| 控制台错误 | 无 |

测试脚本位于 `work/server/`：`verify-v2.cjs`、`sync-check.cjs`、`account-check.cjs`、`public-check.cjs`。

## 11. 已知限制

- 服务器会话存内存，重启后需要重新登录。
- 端到端加密下忘记账号密码无法恢复数据。
- 多设备并发编辑采用最后写入覆盖，暂未实现 CRDT。
- 当前公网地址是临时隧道，正式上线需部署到长期服务器。
- 本机未安装 Docker，Dockerfile 尚未在本机实测；建议在部署平台直接构建验证。
- Tauri 原生壳仍需要 Rust + MSVC 才能编译，v3 主推 Web 形态。

## 12. 后续路线

1. 清单/项目、标签、智能过滤器。
2. 子任务、重复任务。
3. 日历/看板视图。
4. 统计趋势与习惯打卡。
5. 语音输入。
6. Yjs/Automerge CRDT 离线合并。
7. PWA 离线缓存与安装到手机。
8. 正式域名 + HTTPS + 数据库备份。

## 13. 给接手 AI 的注意事项

- 当前活跃版本是 `outputs/light-todo-v3`，不要修改 `light-todo-v1.0`。
- 修改前端后执行 `npm run build` 确认类型与构建通过。
- 修改后端后重启 `npm run server` 并检查 `/api/health`。
- 涉及同步时，优先考虑"账号同步"路径，WebDAV 是高级选项。
- 数据库文件 `server/data/light-todo.db` 不要提交到 Git；部署时使用持久化卷。
- 所有敏感数据必须保持端到端加密，服务器不得保存明文任务/备忘录。
- 交接时先阅读本文件，再阅读 `README.md` 和 `src/App.tsx`。
