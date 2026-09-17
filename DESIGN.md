# DESIGN

视觉合同：全部业务页与工作台共用同一组运行时变量（src/app/globals.css 的 `:root`），禁止页面另起一套颜色或圆角。

## 令牌

| 用途 | 变量 | 值 |
|---|---|---|
| 页面背景 | `--workspace-bg` | `#fafbf9` |
| 正文墨绿 | `--workspace-ink` | `#193630` |
| 主操作 / 顶栏 | `--workspace-primary` | `#21312d` |
| 薄荷强调 | `--workspace-accent` | `#78c7ad` |
| 次要文字 | `--workspace-muted` | `#59716b` |
| 边框 | `--workspace-border` | `#dfe7e3` |
| 浅绿底（激活/选中） | `--workspace-soft` | `#e9f6f0` |

- 薄荷色只作强调与激活指示，不作小号正文色。
- 间距阶梯：4 / 8 / 12 / 16 / 24 / 32 / 48。
- 顶栏为墨绿胶囊（桌面约 64px）；控件 40–44px；正文 14–16px；页面标题 28–32px。
- 字体：`"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`（中文优先，不引外部字体）。
- 卡片：白底、`--workspace-border` 描边、圆角 16px；按钮圆角 10px；胶囊元素 999px。
- 警示色（唯一暖色）：文字 `#9a6700`、底 `#fbf3df`，仅用于未保存/未达标等警示。

## 共享类（globals.css）

- 页面骨架：`.page-shell` `.page-header`（`.page-title` + `.page-subtitle` + `.page-actions`）`.page-card` `.page-note`
- 按钮：`.btn` + `.btn-primary` / `.btn-outline`
- 局部导航：`.subnav-link`（激活为浅绿底胶囊，不用下划线，避免与顶栏激活线双重）
- 状态：`.status-pill`（`data-tone="ok" | "warn"`）
- 设置布局：`.settings-layout` + `.settings-nav-link`
- 图标：`WorkspaceIcon`（src/components/shared/workspace-icon.tsx，统一 1.6 线宽线框图标）

## 设计稿取舍（对照本地归档的设计图，未入库）

- 顶栏统一纯墨绿胶囊；设计稿中导航条渐变不实现。
- 子页签激活用浅绿胶囊，不画下划线（去除双重激活线）。
- 分镜为只读呈现；可编辑字段仅 type/hook/cta/style（API 契约边界）。
- 选品表默认显示 8 个常用列，「查看全部字段（23 列）」切换完整视图（纯 CSS 按列序隐藏，列序变更需同步 globals.css 的 nth-child 选择器）。
- 设计稿中的示例数据、渐变、伪指标不得进入生产界面。
- `/settings` 重定向到店铺管理（用户已确认）：设置分区导航由左侧常驻栏承担，不再提供总览中转页。
