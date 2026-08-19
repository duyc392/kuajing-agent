// 用途：提示词数据转义（防提示词注入）：把用户可控文本中的尖括号换成全角字符，
// 使数据无法伪造 <shop_data> / <product_data> 等数据区结束标记，也无法注入新指令。
// 所有拼进提示词的店铺 / 商品 / 反馈等外部文本必须先过本函数。
export function escapePromptData(text: string): string {
  return text.replace(/</g, "〈").replace(/>/g, "〉");
}
