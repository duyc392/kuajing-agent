// 用途：脚本页标签切换（PRD 页面清单第 5 项：视频脚本与直播脚本）：在「视频脚本 / 直播脚本」两个列表间切换，切换店铺由各列表自行感知。
"use client";

import { useState } from "react";
import ScriptList from "@/components/scripts/script-list";
import LiveScriptList from "@/components/scripts/live-script-list";

type ScriptTab = "video" | "live";

export default function ScriptPageTabs() {
  const [tab, setTab] = useState<ScriptTab>("video");
  const tabClass = (active: boolean) =>
    `rounded-lg px-4 py-1.5 text-sm ${active ? "bg-blue-600 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-100"}`;

  return (
    <div className="mx-auto grid max-w-3xl gap-3 px-4 py-8">
      <div className="flex gap-2">
        <button onClick={() => setTab("video")} className={tabClass(tab === "video")}>视频脚本</button>
        <button onClick={() => setTab("live")} className={tabClass(tab === "live")}>直播脚本</button>
      </div>
      {tab === "video" ? <ScriptList /> : <LiveScriptList />}
    </div>
  );
}
