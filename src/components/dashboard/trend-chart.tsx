// 用途：趋势折线图（纯 SVG，无第三方图表依赖）：单序列折线 + 三点 Y 轴刻度 + 首/中/尾日期标签，悬停点显示数值。
"use client";

interface TrendPoint {
  date: string;
  value: number;
}

export default function TrendChart({ title, points, format, color }: {
  title: string;
  points: TrendPoint[];
  format: (value: number) => string;
  color: string;
}) {
  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="mt-2 text-xs text-gray-400">（暂无趋势数据）</p>
      </div>
    );
  }
  const width = 640;
  const height = 200;
  const padX = 44;
  const padY = 20;
  const max = Math.max(...points.map((point) => point.value), 1);
  const stepX = (width - padX * 2) / Math.max(points.length - 1, 1);
  const x = (index: number) => padX + index * stepX;
  const y = (value: number) => height - padY - (value / max) * (height - padY * 2);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.value)}`).join(" ");
  const ticks = [max, max / 2, 0];
  // 首/中/尾三个标签：索引同时决定取值与 x 坐标，保证标签落在曲线点上（偶数点数时不再错位一格）。
  const labelIndices = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-auto w-full">
        {ticks.map((tick, index) => (
          <g key={index}>
            <line x1={padX} x2={width - padX} y1={y(tick)} y2={y(tick)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={padX - 6} y={y(tick) + 3} textAnchor="end" fontSize={10} fill="#9ca3af">{format(tick)}</text>
          </g>
        ))}
        {labelIndices.map((index) => (
          <text key={index} x={x(index)} y={height - 4} textAnchor="middle" fontSize={10} fill="#9ca3af">{points[index].date}</text>
        ))}
        <path d={path} fill="none" stroke={color} strokeWidth={2} />
        {points.map((point, index) => (
          <circle key={index} cx={x(index)} cy={y(point.value)} r={2.5} fill={color}>
            <title>{`${point.date}: ${format(point.value)}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
