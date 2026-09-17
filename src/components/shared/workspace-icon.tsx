// 用途：工作台视觉使用的小型线框图标；不引入新依赖。
import React, { type SVGProps } from "react";

const PATHS = {
  logo: "M2 20 10 4l8 16H2Zm9-5 6-11 9 16H16",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  document: "M7 3h7l4 4v14H6V3h1Zm7 0v5h4M9 12h6m-6 4h6",
  store: "M4 10v11h16V10M3 5h18l1 5H2l1-5Zm6 16v-7h6v7M4 3h16",
  chevron: "m9 5 7 7-7 7",
  computer: "M3 4h18v13H3V4Zm5 17h8m-4-4v4",
  search: "M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm4.5 10.5L20 20",
  filter: "M4 5h16l-6 7v6l-4 2v-8L4 5Z",
  chart: "M4 19h16M5 15l4-5 3 3 6-7",
  sliders: "M4 6h16M4 12h16M4 18h16M9 4v4m6 6v4M7 16v4",
  box: "M4 8l8-4 8 4v8l-8 4-8-4V8Zm0 0 8 4 8-4M12 12v8",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z",
  plus: "M12 5v14M5 12h14",
  check: "m5 13 4 4L19 7",
  alert: "M12 4 2 20h20L12 4Zm0 7v4m0 3v.01",
  info: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4v.01M12 11v5",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  image: "M4 5h16v14H4V5Zm2 10 4-5 3 4 2-2 5 5",
  play: "M8 5v14l11-7L8 5Z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z",
  user: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-8 16c0-4 3.5-6 8-6s8 2 8 6",
  pin: "M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11Zm0-14a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  star: "M12 3l2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8L12 3Z",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  download: "M12 4v10m0 0-4-4m4 4 4-4M5 20h14",
  edit: "M4 20h4L20 8l-4-4L4 16v4Zm12-16 4 4",
  close: "M6 6l12 12M18 6 6 18",
  clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3v5l4 2",
  video: "M3 6h12v12H3V6Zm12 4 6-4v12l-6-4",
  tag: "M4 12 12 4h8v8l-8 8-8-8Zm12-4h.01",
} as const;

interface WorkspaceIconProps extends SVGProps<SVGSVGElement> {
  name: keyof typeof PATHS;
}

export default function WorkspaceIcon({ name, ...props }: WorkspaceIconProps) {
  return (
    <svg width="20" height="20" viewBox={name === "logo" ? "0 0 28 24" : "0 0 24 24"}
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" {...props}>
      <path d={PATHS[name]} />
    </svg>
  );
}
