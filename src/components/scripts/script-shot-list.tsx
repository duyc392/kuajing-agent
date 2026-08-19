// 用途：分镜列表展示组件：逐镜头渲染画面描述、口播、字幕与秒数。
import type { ScriptShot } from "@/types";

export default function ScriptShotList({ shots }: { shots: ScriptShot[] }) {
  if (shots.length === 0) {
    return <p className="text-xs text-gray-400">（无分镜数据）</p>;
  }
  return (
    <ol className="grid gap-2">
      {shots.map((shot, index) => (
        <li key={index} className="rounded-lg border border-gray-100 p-3">
          <p className="text-xs text-gray-400">镜头 {index + 1} · {shot.seconds} 秒</p>
          <p className="mt-1 text-sm text-gray-900">{shot.scene}</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700">口播：{shot.voiceover}</p>
          <p className="whitespace-pre-wrap text-xs text-gray-500">字幕：{shot.subtitle}</p>
        </li>
      ))}
    </ol>
  );
}
