# TikTok 跨境电商 AI 工作台（kuajing agent）

开源、本地部署、单人使用的 TikTok 跨境电商 AI 运营工作台。核心是一个具备领域知识、长期记忆和持续学习能力的 Agent，通过自然语言对话完成选品调研、商品文案与素材生成、内容策划与脚本创作、店铺运营优化四类工作。数据全部保存在你自己的电脑上。

> 产品需求文档（PRD）见项目根目录的 `PRD-v2.txt`。
> 当前仓库为可运行的完整实现：对话中枢、选品调研、文案与素材、内容脚本、数据看板、记忆与技能体系均已交付。

## 功能一览

- AI 对话中枢：流式回复、历史对话、全局侧边抽屉、工具调用过程可见、快捷指令
- 选品调研：市场分析、竞品分析、选品方向推荐（数据来自 FastMoss，通过 MCP 接入）
- 商品文案与素材：多语言文案、反馈修改、文案版本历史、SKU 管理、商品图生成与变体
- 内容策划：视频分镜脚本（钩子 + CTA）、风格模仿、直播流程脚本
- 店铺运营优化：数据解读、综合运营建议、领域知识问答、合规免责提示
- 多店铺工作台：多店铺管理、快速切换、数据完全隔离、一键导出 Excel
- 记忆体系：短期记忆（上下文）、长期记忆（店铺画像与偏好）、数据库辅助记忆
- 自我迭代：技能沉淀（确认后创建）、技能管理、偏好学习

## 系统要求

- Windows / macOS / Linux
- Node.js 18.17 或更高版本（启动脚本会自动检测并引导安装）
- 三个 API Key（见下文"三个 Key"）

## 快速开始（推荐，无需命令行）

1. 下载并解压本项目
2. 双击启动脚本：Windows 双击 `启动.bat`，macOS 双击 `启动.command`，Linux 运行 `start.sh`
3. 首次打开浏览器后，在引导页填写 API Key、创建第一个店铺
4. 之后每次使用只需再次双击同一个脚本

## 三个 Key（用途不同，各自独立设置）

| 用途 | 模型 / 服务 | Key 从哪来 |
|------|------------|-----------|
| 对话与推理（Agent 主模型、文案、脚本、记忆提取） | deepseek 等 OpenAI 兼容模型 | DeepSeek 开放平台或任意兼容服务商 |
| 图片生成（商品主图、详情图、变体） | gpt-image-2 | OpenAI 平台 |
| 选品与市场数据 | FastMoss（MCP 接入） | FastMoss 开放平台 |

这三个 Key 互不通用，需要分别填写。可以在首次引导页填写，也可以之后在"设置 → 模型与 API Key"中修改。Key 保存在服务端本地配置文件 `data/config.json`，浏览器页面拿不到。

## 安全说明

- 本工作台面向**单人本机使用**：服务只监听 `127.0.0.1`（本机回环地址），局域网内其他设备无法访问；所有 `/api/*` 请求另带本机来源校验，浏览器里的恶意网页无法跨站伪造请求修改配置。
- 密钥保存在本机 `data/config.json`，页面只显示脱敏后的末四位，浏览器拿不到完整 Key。
- **若你的部署机器地址可被他人访问**（例如公司共享电脑、服务器做了端口映射），请通过防火墙或 VPN 控制访问，避免他人读取或篡改你的配置与数据。
- 关闭工作台：直接关闭启动脚本打开的命令行窗口即可停止服务。

## 开发者模式

```
git clone <项目地址>
npm install
cp .env.example .env   # 按文件内注释填写
npm run db:push        # 初始化本地 SQLite 数据库
npm run db:seed        # 可选：向空数据库填充演示数据
npm run dev            # 打开 http://localhost:3000
```

> 手动启动前先做一次 data 目录权限加固（启动脚本会自动完成，此处是手动流程的等价步骤）：
> - Windows：`icacls data /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F"`
> - macOS / Linux：`chmod 700 data && chmod 600 data/config.json data/kuajing.db`

## 数据存储

- 数据库：`data/kuajing.db`（SQLite 单文件），备份 = 复制这个文件；数据库只存文字与记录，不存图片文件本身
- 密钥配置：`data/config.json`（服务端本地文件）
- Agent 技能：`skills/` 目录下的 .md 文件
- 领域知识：`src/agent/knowledge/` 目录下的 .md 文件，对话时本地检索、只注入相关片段（轻量 RAG），不全量塞入系统提示词
- 生成的图片：图片文件本体存 `public/generated/`，数据库里的图片记录只保存路径、用途与应用状态
- 演示数据：`npm run db:seed` 会向空数据库写入演示店铺、商品、文案、脚本、对话、记忆与技能（仅本地开发演示用；数据库已有数据时自动跳过）

## 目录结构

| 目录 | 用途 |
|------|------|
| `src/app` | 页面与 API 路由（Next.js App Router） |
| `src/components` | 界面组件（布局、对话、表单、设置；`shared/` 项目共享组件；`ui/` shadcn 基础组件） |
| `src/agent` | Pi Agent Harness 封装层：核心、工具、MCP、记忆、技能、提示词、知识检索 |
| `src/services` | 业务服务层（`*.service.ts` 命名）：店铺、商品、脚本、对话、记忆、看板、导出、审计、图片 |
| `src/types` | TypeScript 类型统一定义（业务域输入输出类型） |
| `src/lib` | 基础设施：数据库客户端、本地配置、工具函数、统一错误、请求封装 |
| `src/config` | 模型与市场等静态配置 |
| `src/agent/knowledge` | 内置领域知识 .md 文件（轻量 RAG 检索源） |
| `prisma` | 数据库 schema 与演示数据填充脚本（Prisma + SQLite） |

## 技术栈

Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · zod · Prisma + SQLite · Pi Agent Harness SDK · MCP（FastMoss）

> 组件目录约定：shadcn 基础组件（button、input、card、dialog 等）由 shadcn CLI 生成到 `src/components/ui/`；项目自己的共享组件放 `src/components/shared/`。
> 图片生成入口：生成图片走 Agent 对话（生图工具调用 gpt-image-2），不经过 `api/images`；`api/images` 只负责图片档案的查询 / 应用 / 删除。

## 常见问题

- **浏览器打不开 http://localhost:3000**：查看项目目录下的 `logs/server.log`，启动脚本会把服务日志写在这里；把日志内容发给开发者排查。
- **打开后是别的程序界面**：确认访问的是 `http://localhost:3000`（本项目端口）；如果 3000 端口被其他程序占用，启动脚本会提示，先关闭占用程序再重新双击启动。
- **启动窗口一闪而过**：说明脚本提前报错了，重新双击并留意窗口里的中文提示。
- **想手动启动**：在项目目录打开命令行，运行 `npm run dev`，然后访问 http://localhost:3000。

## 许可

开源。AI 调用费用由用户自己的 Key 按实际用量承担，本项目不使用任何付费第三方 API。
