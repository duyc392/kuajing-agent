// 用途：商品图片档案接口：GET 查询图片档案，PATCH 标记"应用到商品"，DELETE 删除图片文件与记录（生成不经过此接口，生成入口是 Agent 生图工具）。
export function GET() {
  return Response.json({ ok: true });
}
export function PATCH() {
  return Response.json({ ok: true });
}
export function DELETE() {
  return Response.json({ ok: true });
}
