// 用途：API Key 表单：三个服务（对话模型 / 生图模型 / FastMoss）的密钥填写、显示切换、脱敏状态徽标、保存与下一步。
"use client";

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api-client";
import type { KeysStatus, SaveKeysInput } from "@/types";

interface FieldRowProps {
  label: string;
  value: string;
  placeholder: string;
  password?: boolean;
  help?: ReactNode;
  onChange: (value: string) => void;
}

function FieldRow({ label, value, placeholder, password = false, help, onChange }: FieldRowProps) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <span className="flex">
        <input
          type={password && !visible ? "password" : "text"}
          value={value}
          placeholder={placeholder}
          autoComplete={password ? "new-password" : "off"}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-l-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {password && (
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="shrink-0 rounded-r-lg border border-l-0 border-gray-300 bg-gray-50 px-3 text-xs text-gray-600 hover:bg-gray-100"
          >
            {visible ? "隐藏" : "显示"}
          </button>
        )}
      </span>
      {help && <span className="mt-1 block text-xs text-gray-500">{help}</span>}
    </label>
  );
}

function StatusBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">已配置</span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">未配置</span>
  );
}

interface SectionCardProps {
  title: string;
  description: string;
  configured: boolean;
  maskedKey: string;
  children: ReactNode;
}

function SectionCard({ title, description, configured, maskedKey, children }: SectionCardProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {configured && maskedKey && <span className="text-xs text-gray-400">{maskedKey}</span>}
          <StatusBadge configured={configured} />
        </div>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

interface FormState {
  llmKey: string;
  llmBaseUrl: string;
  llmModel: string;
  llmMemoryModel: string;
  imageKey: string;
  imageBaseUrl: string;
  imageModel: string;
  mossKey: string;
  mossBaseUrl: string;
}

interface FormMessage {
  kind: "ok" | "error";
  text: string;
}

const EMPTY_FORM: FormState = {
  llmKey: "", llmBaseUrl: "", llmModel: "", llmMemoryModel: "",
  imageKey: "", imageBaseUrl: "", imageModel: "",
  mossKey: "", mossBaseUrl: "",
};

function buildPayload(form: FormState): SaveKeysInput {
  const filled = (value: string) => (value.trim() === "" ? undefined : value);
  return {
    llm: { apiKey: filled(form.llmKey), baseUrl: filled(form.llmBaseUrl), model: filled(form.llmModel), memoryModel: filled(form.llmMemoryModel) },
    image: { apiKey: filled(form.imageKey), baseUrl: filled(form.imageBaseUrl), model: filled(form.imageModel) },
    fastmoss: { apiKey: filled(form.mossKey), baseUrl: filled(form.mossBaseUrl) },
  };
}

function hasChanges(form: FormState, status: KeysStatus): boolean {
  const keyEntered = form.llmKey.trim() !== "" || form.imageKey.trim() !== "" || form.mossKey.trim() !== "";
  const settingsChanged =
    form.llmBaseUrl !== status.llm.baseUrl ||
    form.llmModel !== status.llm.model ||
    form.llmMemoryModel !== (status.llm.memoryModel ?? "") ||
    form.imageBaseUrl !== status.image.baseUrl ||
    form.imageModel !== status.image.model ||
    form.mossBaseUrl !== status.fastmoss.baseUrl;
  return keyEntered || settingsChanged;
}

function useKeysForm() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [status, setStatus] = useState<KeysStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<FormMessage | null>(null);

  const update = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    apiRequest<KeysStatus>("GET", "/api/keys")
      .then((data) => {
        setStatus(data);
        setForm((prev) => ({
          ...prev,
          llmBaseUrl: data.llm.baseUrl,
          llmModel: data.llm.model,
          llmMemoryModel: data.llm.memoryModel ?? "",
          imageBaseUrl: data.image.baseUrl,
          imageModel: data.image.model,
          mossBaseUrl: data.fastmoss.baseUrl,
        }));
      })
      .catch((error: Error) => setMessage({ kind: "error", text: error.message }));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const next = await apiRequest<KeysStatus>("POST", "/api/keys", buildPayload(form));
      setStatus(next);
      setForm((prev) => ({ ...prev, llmKey: "", imageKey: "", mossKey: "" }));
      setMessage({ kind: "ok", text: "配置已保存到本机 data/config.json" });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "保存失败，请重试" });
    } finally {
      setSaving(false);
    }
  }

  return { form, status, saving, message, update, handleSave };
}

interface SectionProps {
  status: KeysStatus;
  form: FormState;
  update: (key: keyof FormState) => (value: string) => void;
}

function LlmSection({ status, form, update }: SectionProps) {
  return (
    <SectionCard title="① 对话模型服务（DeepSeek）" description="负责选品分析、文案与脚本生成、对话与记忆提取" configured={status.llm.configured} maskedKey={status.llm.maskedKey}>
      <FieldRow label="API Key" value={form.llmKey} password placeholder="sk-xxxxxxxxxxxxxxxx" help={<>在 <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer" className="text-blue-600 underline">DeepSeek 开放平台</a> 的「API Keys」页面创建</>} onChange={update("llmKey")} />
      <FieldRow label="接口地址（Base URL）" value={form.llmBaseUrl} placeholder="https://api.deepseek.com" onChange={update("llmBaseUrl")} />
      <FieldRow label="对话模型" value={form.llmModel} placeholder="deepseek-chat" onChange={update("llmModel")} />
      <FieldRow label="记忆提取模型" value={form.llmMemoryModel} placeholder="deepseek-chat" onChange={update("llmMemoryModel")} />
    </SectionCard>
  );
}

function ImageSection({ status, form, update }: SectionProps) {
  return (
    <SectionCard title="② 生图模型服务（gpt-image-2）" description="负责商品主图与详情图的 AI 生成" configured={status.image.configured} maskedKey={status.image.maskedKey}>
      <FieldRow label="API Key" value={form.imageKey} password placeholder="sk-xxxxxxxxxxxxxxxx" help={<>在 <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-blue-600 underline">OpenAI 平台</a> 的「API keys」页面创建</>} onChange={update("imageKey")} />
      <FieldRow label="接口地址（Base URL）" value={form.imageBaseUrl} placeholder="https://api.openai.com/v1" onChange={update("imageBaseUrl")} />
      <FieldRow label="生图模型" value={form.imageModel} placeholder="gpt-image-2" onChange={update("imageModel")} />
    </SectionCard>
  );
}

function FastmossSection({ status, form, update }: SectionProps) {
  return (
    <SectionCard title="③ 数据服务（FastMoss）" description="负责 TikTok 选品、市场与竞品的实时数据" configured={status.fastmoss.configured} maskedKey={status.fastmoss.maskedKey}>
      <FieldRow label="API Key" value={form.mossKey} password placeholder="fm-xxxxxxxxxxxxxx" help={<>在 <a href="https://www.fastmoss.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">FastMoss 官网</a> 控制台的「API」页面获取</>} onChange={update("mossKey")} />
      <FieldRow label="接口地址（Base URL）" value={form.mossBaseUrl} placeholder="https://open.fastmoss.com" onChange={update("mossBaseUrl")} />
    </SectionCard>
  );
}

export default function ApiKeyForm() {
  const { form, status, saving, message, update, handleSave } = useKeysForm();

  if (status === null) {
    return <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">正在加载配置状态…</p>;
  }

  const dirty = hasChanges(form, status);
  const disabled = saving || !dirty;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!disabled) await handleSave();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <LlmSection status={status} form={form} update={update} />
      <ImageSection status={status} form={form} update={update} />
      <FastmossSection status={status} form={form} update={update} />
      {message && (
        <p className={`rounded-lg px-4 py-3 text-sm ${message.kind === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-xs text-gray-500">密钥只保存在你自己电脑的 data/config.json 里，不会上传到任何服务器。</p>
        <div className="flex gap-3">
          <button type="submit" disabled={disabled} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "保存中…" : "保存配置"}
          </button>
          {status.allConfigured && (
            <Link href="/create-shop" className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700">
              下一步：创建店铺 →
            </Link>
          )}
        </div>
      </div>
      <p className="text-center text-xs text-gray-400">
        {status.allConfigured ? "三项服务均已配置。" : "三项服务都配置完成后，才会出现「下一步」按钮。"}
        {!dirty && " 填写或修改任意配置后即可保存。"}
      </p>
    </form>
  );
}
