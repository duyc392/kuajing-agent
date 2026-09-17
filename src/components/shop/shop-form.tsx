// 用途：店铺创建表单：填写名称 / 市场 / 简述并提交，成功后切换为当前店铺并进入工作台。
"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { useShops } from "@/components/shop/shop-context";
import { ShopFields } from "@/components/shop/shop-fields";
import type { ShopFieldsValue } from "@/components/shop/shop-fields";
import type { ShopOverview } from "@/types";

const EMPTY: ShopFieldsValue = { name: "", market: "", description: "" };

export default function ShopForm() {
  const router = useRouter();
  const { setCurrentShopId, refresh } = useShops();
  const [value, setValue] = useState<ShopFieldsValue>(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function validate(): string {
    if (value.name.trim() === "") return "请填写店铺名称";
    if (value.market === "") return "请选择所属市场";
    return "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const shop = await apiRequest<ShopOverview>("POST", "/api/shops", {
        name: value.name.trim(),
        market: value.market,
        description: value.description.trim() === "" ? null : value.description.trim(),
      });
      await refresh();
      setCurrentShopId(shop.id);
      router.replace("/workspace");
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败，请重试");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <section className="page-card p-5">
        <ShopFields value={value} onChange={setValue} />
      </section>
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="btn btn-primary justify-self-start"
      >
        {saving ? "创建中…" : "创建店铺，进入工作台"}
      </button>
    </form>
  );
}
