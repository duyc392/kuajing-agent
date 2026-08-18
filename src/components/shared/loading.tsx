// 用途：全局加载指示器，所有异步操作（表单提交、接口等待、Agent 思考）统一显示"处理中"状态。
export default function Loading({ text = "加载中…" }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-6 text-sm text-gray-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      <span>{text}</span>
    </div>
  );
}
