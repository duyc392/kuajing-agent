// 用途：切镜节奏计算（纯函数，无 IO）：把 ffmpeg 检测到的场景切换时间点换算成切镜数、每 10 秒切镜数、
// 平均镜头长度与最长镜头。数字全部由代码算出，禁止模型自己数切点估节奏。
export interface CutRhythmMetrics {
  durationSeconds: number;
  cutCount: number;
  cuts: number[];
  cutsPerTenSeconds: number;
  longestShotSeconds: number;
  averageShotSeconds: number;
}

const MIN_CUT_GAP_SECONDS = 0.3;

function round2(value: number): number {
  return Number(value.toFixed(2));
}

// 切点清洗：去掉非正数、超出视频时长、以及相距过近的重复切点（同一转场会被 ffmpeg 报多次）。
export function sanitizeCuts(cuts: number[], durationSeconds: number): number[] {
  const valid = cuts.filter((cut) => Number.isFinite(cut) && cut > 0 && cut < durationSeconds).sort((a, b) => a - b);
  const kept: number[] = [];
  for (const cut of valid) {
    const last = kept[kept.length - 1];
    if (last === undefined || cut - last >= MIN_CUT_GAP_SECONDS) kept.push(round2(cut));
  }
  return kept;
}

function longestShot(cuts: number[], durationSeconds: number): number {
  const boundaries = [0, ...cuts, durationSeconds];
  let longest = 0;
  for (let index = 1; index < boundaries.length; index += 1) {
    longest = Math.max(longest, boundaries[index] - boundaries[index - 1]);
  }
  return round2(longest);
}

export function computeCutRhythm(input: { durationSeconds: number; cuts: number[] }): CutRhythmMetrics {
  const duration = input.durationSeconds > 0 ? input.durationSeconds : 0;
  const cuts = sanitizeCuts(input.cuts, duration);
  const shotCount = cuts.length + 1;
  return {
    durationSeconds: round2(duration),
    cutCount: cuts.length,
    cuts,
    cutsPerTenSeconds: duration > 0 ? round2((cuts.length / duration) * 10) : 0,
    longestShotSeconds: longestShot(cuts, duration),
    averageShotSeconds: duration > 0 ? round2(duration / shotCount) : 0,
  };
}
