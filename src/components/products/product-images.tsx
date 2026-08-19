// 用途：商品图片管理组件（PRD 故事 22-24 与页面清单商品详情）：图片网格预览、应用标记与删除；
// 图片由对话工具生成后以草稿入库，本组件负责查看与"应用到商品"。
"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import type { ProductImageView } from "@/types";

const TYPE_LABELS: Record<string, string> = { main: "主图", detail: "详情图", variant: "变体" };

// 图片列表加载：商品/店铺/重载变化时重新拉取，过期请求作废 + 取消信号。
function useProductImages(productId: string, shopId: string) {
  const [images, setImages] = useState<ProductImageView[] | null>(null);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let stale = false;
    const controller = new AbortController();
    setImages(null);
    setError("");
    apiRequest<unknown>("GET", `/api/images?productId=${productId}&shopId=${shopId}`, undefined, controller.signal)
      .then((rows) => {
        if (stale) return;
        if (!Array.isArray(rows)) throw new Error("图片数据异常");
        setImages(rows as ProductImageView[]);
      })
      .catch((e: Error) => { if (!stale) setError(e.message || "图片加载失败"); });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [productId, shopId, reloadCount]);

  return { images, error, refresh: () => setReloadCount((count) => count + 1) };
}

// 写操作：上传（multipart POST）、应用（PATCH）与删除（DELETE），ref 同步锁防连点。
function useImageActions(productId: string, shopId: string, refresh: () => void) {
  const [actionError, setActionError] = useState("");
  const [uploading, setUploading] = useState(false);
  const actionRef = useRef(false);

  async function upload(file: File) {
    if (actionRef.current) return;
    if (!file.type.startsWith("image/")) {
      setActionError("请选择图片文件（PNG / JPEG / WebP）");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setActionError("图片文件不能超过 10MB");
      return;
    }
    actionRef.current = true;
    setUploading(true);
    setActionError("");
    try {
      const form = new FormData();
      form.append("file", file);
      await apiRequest<unknown>("POST", `/api/images?productId=${productId}&shopId=${shopId}`, form);
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "上传失败，请重试");
    } finally {
      actionRef.current = false;
      setUploading(false);
    }
  }

  async function apply(image: ProductImageView) {
    if (actionRef.current) return;
    actionRef.current = true;
    setActionError("");
    try {
      await apiRequest<unknown>("PATCH", `/api/images/${image.id}?shopId=${shopId}`, { applied: true });
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "应用失败，请重试");
    } finally {
      actionRef.current = false;
    }
  }

  async function remove(image: ProductImageView) {
    if (actionRef.current) return;
    if (!window.confirm(`确定删除这张${TYPE_LABELS[image.type] ?? "图片"}吗？图片文件将一并删除，此操作不可恢复。`)) return;
    actionRef.current = true;
    setActionError("");
    try {
      await apiRequest<unknown>("DELETE", `/api/images/${image.id}?shopId=${shopId}`);
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "删除失败，请重试");
    } finally {
      actionRef.current = false;
    }
  }

  return { actionError, uploading, upload, apply, remove };
}

function ImageCard({ image, onApply, onDelete }: { image: ProductImageView; onApply: () => void; onDelete: () => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* 本地静态文件直接 img 渲染；缺失时给占位灰块，不白屏。 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.path} alt={image.prompt ?? "商品图片"} className="h-36 w-full bg-gray-100 object-cover" />
      <div className="grid gap-2 p-3">
        <div className="flex items-center gap-1 text-xs">
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">{TYPE_LABELS[image.type] ?? image.type}</span>
          {image.applied && <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-700">✓ 已应用</span>}
        </div>
        {image.prompt && <p className="truncate text-xs text-gray-400" title={image.prompt}>{image.prompt}</p>}
        <div className="flex gap-2">
          {!image.applied && (
            <button onClick={onApply} className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">应用</button>
          )}
          <button onClick={onDelete} className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50">删除</button>
        </div>
      </div>
    </div>
  );
}

export default function ProductImages({ productId, shopId }: { productId: string; shopId: string }) {
  const { images, error, refresh } = useProductImages(productId, shopId);
  const { actionError, uploading, upload, apply, remove } = useImageActions(productId, shopId, refresh);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (images === null && !error) return <Loading text="加载图片…" />;
  if (images === null) return <ErrorMessage message={error} onRetry={refresh} />;

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">生成的图片以草稿保存，点击「应用」后生效为商品图片。</p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {uploading ? "上传中…" : "＋ 上传图片"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
      </div>
      {(error || actionError) && <ErrorMessage message={error || actionError} onRetry={refresh} />}
      {images.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
          还没有商品图片。可以上传自己的图片，或在对话中让 Agent「为这个商品生成主图」，生成后在这里查看并应用。
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((image) => (
          <ImageCard key={image.id} image={image} onApply={() => apply(image)} onDelete={() => remove(image)} />
        ))}
      </div>
    </div>
  );
}
