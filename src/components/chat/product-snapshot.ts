// 用途：商品页快照（惰性同步）：用户在商品详情页对话时，发送消息前实时读取该商品最新数据，
// 组装成 [product-snapshot] 数据区附在消息末尾——界面上刚改过的名称/价格/描述/变体/文案，
// Agent 下一轮立即看到最新值（快照内声明：与前文冲突时以此为准）；读取失败一律静默跳过，绝不阻断发送。
import { apiRequest } from "@/lib/api-client";
import type { CopyView, ProductDetailView } from "@/types";

const SNAPSHOT_PATH_PATTERN = /^\/products\/([^/?]+)/;

// 从当前路由或查询参数提取商品 ID：仅商品详情页返回 id，其他页面返回 null（不注入快照）。
export function productIdFromPath(pathname: string): string | null {
  // 兼容路径参数 /products/prod-123
  const match = pathname.match(SNAPSHOT_PATH_PATTERN);
  if (match) return match[1];

  // 兼容工作台查询参数 /products?productId=prod-123
  if (pathname === "/products" && typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("productId");
    if (pid && pid.trim() !== "") return pid.trim();
  }

  return null;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function buildSnapshot(product: ProductDetailView): string {
  const lines = [
    "以下为当前商品页的最新数据（系统实时读取），与前文冲突时以此为准：",
    `- 商品：${product.name}（类目：${product.category ?? "未设置"}）`,
    `- 价格：${product.price === null ? "未设置" : `¥${product.price.toFixed(2)}`}`,
    `- 描述：${product.description ? clip(product.description.replace(/\s+/g, " "), 200) : "（无）"}`,
  ];
  if (product.variants.length > 0) {
    const skus = product.variants.slice(0, 8).map((variant) => variant.sku).join("、");
    lines.push(`- 变体 SKU（共 ${product.variants.length} 个）：${skus}${product.variants.length > 8 ? " 等" : ""}`);
  }
  const copy: CopyView | null = product.copies.find((item) => item.isCurrent) ?? product.copies[0] ?? null;
  lines.push(copy === null ? "- 文案：暂无文案版本" : `- 当前文案（v${copy.version}，${copy.language}）：${clip(copy.title, 100)}`);
  return `[product-snapshot]\n${lines.join("\n")}\n[/product-snapshot]`;
}

// 发送前实时读取商品快照：任何失败（网络、404、切店）都返回 null，不阻断消息发送。
export async function readProductSnapshot(pathname: string, shopId: string): Promise<string | null> {
  const productId = productIdFromPath(pathname);
  if (productId === null) return null;
  try {
    const product = await apiRequest<ProductDetailView>(
      "GET",
      `/api/products/${encodeURIComponent(productId)}?shopId=${encodeURIComponent(shopId)}`,
    );
    return buildSnapshot(product);
  } catch {
    return null;
  }
}
