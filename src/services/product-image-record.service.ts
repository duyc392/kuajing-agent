// 用途：图片档案写入服务：把已生成的图片文件登记为商品图片档案（草稿状态），排序号自动接在现有记录后面。
// 只做持久化，不生成图片；图片文件由 render_product_image / run_image_workflow 产出。
import { createImages, listImages } from "@/services/images.service";
import { resolveProductByName } from "@/services/product-lookup.service";
import type { ProductImageType, SavedImageRecordDetails } from "@/types";

export async function saveGeneratedImageRecords(input: {
  shopId: string;
  productName: string;
  type: ProductImageType;
  prompt: string;
  paths: string[];
}): Promise<SavedImageRecordDetails> {
  const product = await resolveProductByName({ productName: input.productName, shopId: input.shopId });
  const existing = await listImages(product.id, input.shopId);
  const startOrder = existing.reduce((max, image) => Math.max(max, image.sortOrder), 0);
  const rows = await createImages(product.id, input.shopId, input.paths.map((path, index) => ({
    path,
    type: input.type,
    prompt: input.prompt,
    sortOrder: startOrder + index + 1,
  })));
  return {
    productId: product.id,
    imageIds: rows.map((row) => row.id),
    appliedCount: rows.filter((row) => row.applied).length,
  };
}
