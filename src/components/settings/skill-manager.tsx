// 用途：技能管理面板（PRD 故事 47）：列出 Agent 沉淀的技能，支持启用/禁用与删除；
// 技能正文存于 skills/*.md、管理信息存于 Skill 表，本页只做查看与开关管理。技能全局共享，不随店铺切换。
"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import { MAX_ENABLED_SKILLS } from "@/config/skills";
import type { SkillView } from "@/types";

// 技能列表加载：重载计数变化时重新拉取，过期请求作废 + 取消信号。
function useSkills() {
  const [skills, setSkills] = useState<SkillView[] | null>(null);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let stale = false;
    const controller = new AbortController();
    setSkills(null);
    setError("");
    apiRequest<unknown>("GET", "/api/skills", undefined, controller.signal)
      .then((rows) => {
        if (stale) return;
        if (!Array.isArray(rows)) throw new Error("技能数据异常");
        setSkills(rows as SkillView[]);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message || "技能加载失败");
      });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [reloadCount]);

  return { skills, error, refresh: () => setReloadCount((count) => count + 1) };
}

// 启用/禁用与删除写操作：ref 同步锁防连点 + saving 状态给按钮执行中反馈；删除前二次确认。
function useSkillActions(refresh: () => void) {
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const actionRef = useRef(false);

  async function toggle(id: string, enabled: boolean) {
    if (actionRef.current) return;
    actionRef.current = true;
    setSaving(true);
    setActionError("");
    try {
      await apiRequest<unknown>("PATCH", `/api/skills/${id}`, { enabled });
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "操作失败，请重试");
    } finally {
      actionRef.current = false;
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (actionRef.current) return;
    if (!window.confirm("确定删除这个技能吗？删除后 Agent 将不再应用它。")) return;
    actionRef.current = true;
    setSaving(true);
    setActionError("");
    try {
      await apiRequest<unknown>("DELETE", `/api/skills/${id}`);
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "删除失败，请重试");
    } finally {
      actionRef.current = false;
      setSaving(false);
    }
  }

  return { saving, actionError, toggle, remove };
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN");
}

function SkillItem({ skill, saving, onToggle, onDelete }: {
  skill: SkillView;
  saving: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const created = formatTime(skill.createdAt);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
        {skill.name}
        <span className={`rounded-full px-2 py-0.5 text-xs ${skill.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          {skill.enabled ? "已启用" : "已禁用"}
        </span>
      </p>
      {skill.description !== "" && <p className="mt-0.5 text-xs text-gray-600">{skill.description}</p>}
      {skill.content.trim() !== "" ? (
        <p className="mt-1 whitespace-pre-wrap text-xs text-gray-500">{skill.content}</p>
      ) : (
        <p className="mt-1 text-xs text-amber-600">⚠ 技能文件缺失或不可读，无法生效，可删除后重新沉淀。</p>
      )}
      <p className="mt-1 text-xs text-gray-400">文件 {skill.filename} · 创建于 {created}</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={onToggle}
          disabled={saving}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
            skill.enabled ? "border border-gray-300 text-gray-600 hover:bg-gray-100" : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {skill.enabled ? "禁用" : "启用"}
        </button>
        <button
          onClick={onDelete}
          disabled={saving}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          删除
        </button>
      </div>
    </div>
  );
}

export default function SkillManager() {
  const { skills, error, refresh } = useSkills();
  const { saving, actionError, toggle, remove } = useSkillActions(refresh);

  if (skills === null && !error) return <Loading text="加载技能…" />;
  if (skills === null) return <ErrorMessage message={error} onRetry={refresh} />;

  const enabledCount = skills.filter((skill) => skill.enabled).length;

  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">技能管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          Agent 从对话中发现的重复操作模式，经你在对话卡片上确认后沉淀为技能；已启用的技能会在后续生成文案、脚本和建议时自动应用。
        </p>
        <p className="mt-1 text-xs text-gray-400">已启用 {enabledCount} / {MAX_ENABLED_SKILLS}（达到上限后需先禁用或删除才能再启用）</p>
      </header>
      {(error || actionError) && <ErrorMessage message={error || actionError} onRetry={refresh} />}
      {skills.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
          暂无技能。在对话中反复提出同一类要求，Agent 会提议把它沉淀为技能，你确认后即可在这里管理。
        </p>
      )}
      <div className="grid gap-3">
        {skills.map((skill) => (
          <SkillItem
            key={skill.id}
            skill={skill}
            saving={saving}
            onToggle={() => void toggle(skill.id, !skill.enabled)}
            onDelete={() => void remove(skill.id)}
          />
        ))}
      </div>
    </div>
  );
}
