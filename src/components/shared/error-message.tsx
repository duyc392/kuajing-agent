// 用途：统一中文错误提示组件，把错误显示为可读的中文提示，保证不出现白屏或英文报错。
interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700">
          重试
        </button>
      )}
    </div>
  );
}
