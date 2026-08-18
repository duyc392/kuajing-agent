# 项目工程规范（kuajing agent）


## 一、文件唯一归属位置

目录结构固定。每种代码只放规定位置；**禁止创建下表之外的新目录**——需要新目录时先停下来问用户，不要自行创建。

| 内容 | 位置 | 命名 |
|---|---|---|
| 页面 | `src/app/对应路由/page.tsx` | App Router 约定 |
| API 接口 | `src/app/api/对应资源/route.ts` | RESTful 风格 |
| 布局组件 | `src/components/layout/` | 小写中划线：`shop-switcher.tsx` |
| 对话相关组件 | `src/components/chat/` | 小写中划线 |
| 业务域组件 | `src/components/对应业务域/` | 如 `products/product-list.tsx` |
| 通用组件 | `src/components/shared/` | 小写中划线 |
| shadcn 基础组件 | `src/components/ui/` | CLI 生成，不手动修改 |
| Agent 核心逻辑 | `src/agent/` | `core.ts`、`execute.ts` 等 |
| Agent 工具 | `src/agent/tools/` | 一个工具一个文件，`index.ts` 注册 |
| Agent 记忆 | `src/agent/memory/` | `short-term.ts`、`long-term.ts`、`extractor.ts` |
| Agent 提示词 | `src/agent/prompts/` | `system.ts` 等 |
| Agent 知识/技能 | `src/agent/knowledge/`、`src/agent/skills/` | — |
| MCP 对接 | `src/agent/mcp/` | `fastmoss.ts` |
| 业务逻辑（增删改查） | `src/services/` | `商品.service.ts` 格式 |
| TypeScript 类型 | `src/types/` | 按业务域分文件或统一 `index.ts` |
| 数据库客户端、工具函数 | `src/lib/` | `db.ts`、`config.ts`、`utils.ts` |
| 模型配置 | `src/config/` | `models.ts` |
| 数据库模型 | `prisma/schema.prisma` | 唯一文件 |

**禁止行为：**
- 创建上表之外的新目录（需要时先问用户）
- 组件直接放在 `src/components/` 根目录下（必须进子目录）
- 页面文件里写业务逻辑（页面只做展示 + 调接口）
- route 文件里写数据库查询（必须调 services）

## 二、三层分离（最重要的架构原则）

```
展示层（src/app/ + src/components/）  渲染、交互、经统一封装调 /api/*；禁止 import services 或 Prisma
接口层（src/app/api/）                只校验参数 + 调 service + 返回结果；禁止写业务逻辑
服务层（src/services/）               全部业务逻辑和数据库操作；禁止 import React、依赖 Request 对象
```

Agent 工具与页面共用服务层，禁止把逻辑写两遍：

```
对话 → agent/tools/* → services/* → Prisma
按钮 → api/* → services/* → Prisma
```

**违规判据：** page.tsx 里出现 `prisma.` 即违规；route.ts 业务判断超过 10 行就该抽到 service。

## 三、shopId 隔离（铁律）

所有业务数据查询必须带 `where: { shopId }`；创建记录时 shopId 必填；不允许出现任何不带 shopId 过滤的业务查询。

## 四、函数与类型

- 函数长度上限 **50 行**，超过必须拆分；一个函数只做一件事，函数名里有"和"字就该拆。
- 每个 service 的输入输出必须有明确类型：参数超过 2 个必须收进 interface；返回类型禁止 `any` / `Promise<any>`。
- 禁止 `as any` 强制类型转换；禁止 `@ts-ignore`。
- 一个文件导出的函数不超过 5 个，超过就拆文件。

## 五、错误处理统一模式

全项目只用一套错误模式，禁止各写各的：

- **Service 层**：抛 `AppError`（及其 NotFoundError / ValidationError 子类），唯一定义处 `src/lib/errors.ts`：

```typescript
// src/lib/errors.ts
export class AppError extends Error {
  constructor(message: string, public code: string, public statusCode: number = 400) {
    super(message)
  }
}
```

- **API 层**：route.ts 统一 try/catch——捕获 `AppError` 返回 `{ error: message, code }` + statusCode；未知错误返回 `{ error: '服务器内部错误', code: 'INTERNAL_ERROR' }` + 500。
- **前端**：组件不裸写 fetch URL 字符串，统一用 `src/lib/api-client.ts` 的 `apiRequest<T>` 封装。

## 六、import 方向（箭头只能往下指，不能往上指）

```
pages / components
        ↓ 经 apiRequest 调 /api/*
    api routes
        ↓ import
     services
        ↓ import
    lib / types / prisma
```

- page.tsx → components/lib ✅；page.tsx → services ❌（必须经 API）
- route.ts → services ✅；route.ts → components ❌
- services → lib/types ✅；services → components/React/浏览器 API ❌
- agent/tools → services/lib ✅
- 任何反向 import 一律禁止。

## 七、Agent 工具编写规范

每个工具一个文件，统一结构：`name` + 清楚的 `description`（Agent 靠它决定何时调用）+ zod 参数 schema + `execute`：

```typescript
export const copywritingTool = {
  name: 'generate_product_copy',
  description: '为商品生成完整上架文案，自动适配目标市场语言',
  parameters: z.object({
    productId: z.string().describe('商品 ID（cuid 字符串）'),
    language: z.string().describe('目标语言：en / th / vi / id 等'),
  }),
  execute: async (params) => {
    const { productId, language } = params
    return generateProductCopy(productId, language)   // 只调 service
  },
}
```

- `execute` 只做"调 service + 格式化返回"，不写业务逻辑、不写 prisma 查询。
- 所有工具在 `src/agent/tools/index.ts` 统一注册。

## 八、新功能标准流程（不跳步）

1. `src/types/` 定义输入输出类型（先签合同）
2. `src/services/` 实现业务逻辑
3. `src/app/api/` 写接口
4. `src/components/` 写组件
5. `src/app/` 组装页面

从底层往上写，每层写完可独立验证；从页面开始写容易把逻辑塞进页面，破坏分层。

## 九、交付纪律

- 一次只做一个功能，验证通过后再做下一个；一次对话不并行开发多个功能。
- 每个功能必须完整交付：含错误处理，**不留 TODO**。
- 不复制粘贴代码；同一逻辑出现两次就提取公共函数。
- 不硬编码配置值（API 地址、模型名、市场列表 → config 文件或环境变量）。
- 不假设数据一定存在：所有数据库查询结果必须处理 null。
- 前端状态不用全局变量（用 React Context 或 zustand）。
- 完成后列出所有创建和修改的文件清单。

## 十、绝对禁止清单

1. 修改 `src/components/ui/` 下 shadcn 生成的文件（定制样式在业务组件里用 className 覆盖）。
2. 在 service 里 import React 或任何浏览器 API。
3. 组件里直接写 fetch URL 字符串（必须走 `apiRequest` 封装）。
