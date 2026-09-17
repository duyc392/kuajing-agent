// 用途：技能管理面板（PRD 故事 47）：列出 Agent 沉淀的技能，支持启用/禁用与删除；
// 技能正文存于 skills/*.md、管理信息存于 Skill 表，本页只做查看与开关管理。技能全局共享，不随店铺切换。
"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import { MAX_ENABLED_SKILLS } from "@/config/skills";
import type { SkillUpdateInput, SkillView } from "@/types";

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

// 启用/禁用、常驻切换与删除写操作：ref 同步锁防连点 + saving 状态给按钮执行中反馈；
// 两个开关共用一条 PATCH 更新链路（只差请求字段）；删除前二次确认。
function useSkillActions(refresh: () => void) {
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const actionRef = useRef(false);

  async function update(id: string, input: SkillUpdateInput) {
    if (actionRef.current) return;
    actionRef.current = true;
    setSaving(true);
    setActionError("");
    try {
      await apiRequest<unknown>("PATCH", `/api/skills/${id}`, input);
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

  return { saving, actionError, update, remove };
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN");
}

// 动作按钮区：启用/禁用、常驻切换（仅已启用技能展示）与删除。
function SkillActions({ skill, saving, onToggle, onToggleResident, onDelete }: {
  skill: SkillView;
  saving: boolean;
  onToggle: () => void;
  onToggleResident: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-2 flex gap-2">
      <button
        onClick={onToggle}
        disabled={saving}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
          skill.enabled ? "border border-[var(--workspace-border)] text-[var(--workspace-muted)] hover:bg-[#f0f5f1]" : "bg-[var(--workspace-primary)] text-white hover:bg-[#315647]"
        }`}
      >
        {skill.enabled ? "禁用" : "启用"}
      </button>
      {skill.enabled && (
        <button
          onClick={onToggleResident}
          disabled={saving}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          {skill.alwaysApply ? "改为按需" : "改为常驻"}
        </button>
      )}
      <button
        onClick={onDelete}
        disabled={saving}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        删除
      </button>
    </div>
  );
}

function SkillItem({ skill, saving, onToggle, onToggleResident, onDelete }: {
  skill: SkillView;
  saving: boolean;
  onToggle: () => void;
  onToggleResident: () => void;
  onDelete: () => void;
}) {
  const created = formatTime(skill.createdAt);
  return (
    <div className="page-card p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        {skill.name}
        <span className={`status-pill ${skill.enabled ? "" : ""}`}>
          {skill.enabled ? "已启用" : "已禁用"}
        </span>
        {skill.enabled && (
          <span className={`rounded-full px-2 py-0.5 text-xs ${skill.alwaysApply ? "bg-[var(--workspace-soft)] text-[#2e6350]" : "bg-[#fbf3df] text-[#9a6700]"}`}>
            {skill.alwaysApply ? "常驻" : "按需"}
          </span>
        )}
      </p>
      {skill.description !== "" && <p className="mt-0.5 text-xs text-gray-600">{skill.description}</p>}
      {skill.content.trim() !== "" ? (
        <p className="mt-1 whitespace-pre-wrap text-xs text-gray-500">{skill.content}</p>
      ) : (
        <p className="mt-1 text-xs text-amber-600">⚠ 技能文件缺失或不可读，无法生效，可删除后重新沉淀。</p>
      )}
      <p className="mt-1 text-xs text-gray-400">
        文件 {skill.filename} · 创建于 {created}
        {skill.enabled && (skill.alwaysApply ? " · 每轮自动应用并进入成品生成" : " · 对话中按需加载，不进入成品生成")}
      </p>
      <SkillActions skill={skill} saving={saving} onToggle={onToggle} onToggleResident={onToggleResident} onDelete={onDelete} />
    </div>
  );
}

export default function SkillManager() {
  const { skills, error, refresh } = useSkills();
  const { saving, actionError, update, remove } = useSkillActions(refresh);

  if (skills === null && !error) return <Loading text="加载技能…" />;
  if (skills === null) return <ErrorMessage message={error} onRetry={refresh} />;

  const enabledCount = skills.filter((skill) => skill.enabled).length;

  return (
    <div className="grid gap-4">
      <p className="text-xs text-[var(--workspace-muted)]">
        已启用 {enabledCount} / {MAX_ENABLED_SKILLS}（达到上限后需先禁用或删除才能再启用）。常驻技能每轮对话生效，并进入文案、脚本等成品生成，适合简短的偏好要求；
        按需技能只占一行目录，Agent 在对话中相关时加载查阅，不进入成品生成，适合较长的操作手册。
      </p>
      {(error || actionError) && <ErrorMessage message={error || actionError} onRetry={refresh} />}
      {skills.length === 0 && (
        <p className="page-card border-dashed p-8 text-center text-sm text-[var(--workspace-muted)]">
          暂无技能。在对话中反复提出同一类要求，Agent 会提议把它沉淀为技能，你确认后即可在这里管理。
        </p>
      )}
      <div className="grid gap-3">
        {skills.map((skill) => (
          <SkillItem
            key={skill.id}
            skill={skill}
            saving={saving}
            onToggle={() => void update(skill.id, { enabled: !skill.enabled })}
            onToggleResident={() => void update(skill.id, { alwaysApply: !skill.alwaysApply })}
            onDelete={() => void remove(skill.id)}
          />
        ))}
      </div>
    </div>
  );
}
