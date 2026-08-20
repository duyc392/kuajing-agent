// 用途：数据看板业务域类型（PRD 故事 31）：店铺级指标、趋势、流量来源、内容表现与类目表现。
// 数据全部来自 FastMoss 实时查询，不落库；金额单位为美元、销量单位为件。
export interface DashboardTrendPoint {
  date: string; // YYYY-MM-DD
  gmv: number;
  unitsSold: number;
}

export interface DashboardShareItem {
  label: string; // 中文标签（短视频/直播/商品卡/联盟达人/店铺自营）
  gmvSharePercent: number;
}

export interface DashboardContentItem {
  title: string;
  plays: number;
  unitsSold: number;
  conversionRatePercent: number; // 视频转化率 = 销量 ÷ 播放量（代码计算，播放量为 0 时为 0）
}

export interface DashboardCategoryItem {
  name: string;
  gmvSharePercent: number;
}

export interface DashboardData {
  shopName: string;
  region: string;
  timeRangeDays: number;
  gmv: number; // 周期内 GMV（美元）
  unitsSold: number; // 周期内销量（件）
  rating: number | null;
  videoCount: number; // 周期内关联视频数
  videoConversionRatePercent: number | null; // Top 内容整体视频转化率
  trend: DashboardTrendPoint[];
  contentChannels: DashboardShareItem[]; // 流量来源：短视频/直播/商品卡
  salesChannels: DashboardShareItem[]; // 销售渠道：联盟达人/店铺自营/商品卡
  topContents: DashboardContentItem[]; // 内容表现 Top 5
  categories: DashboardCategoryItem[]; // 类目表现 Top 5
}

// 查询入参：店铺名是 FastMoss 站内检索词；region 由当前工作台店铺的市场推导。
export interface DashboardQuery {
  shopName: string;
  region: string;
  timeRangeDays: 7 | 28 | 90;
}
