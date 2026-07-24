"use client";

import { useState, type ReactNode } from "react";
import { deleteSlide, moveSlide, saveSlide, saveSliderSettings } from "@/app/admin/homepage-slider/actions";

export type SliderProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  is_preorder_only: boolean;
};

export type AdminSlide = {
  id: string;
  product_id: string | null;
  eyebrow: string;
  title: string;
  description: string;
  desktop_image_url: string;
  mobile_image_url: string | null;
  button_text: string;
  button_url: string;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  is_active: boolean;
};

const emptySlide: AdminSlide = {
  id: "", product_id: null, eyebrow: "", title: "", description: "",
  desktop_image_url: "", mobile_image_url: null, button_text: "Shop Now",
  button_url: "", starts_at: null, ends_at: null, sort_order: 0, is_active: true,
};

function localDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 16);
}

export default function AdminHomepageSlider({
  slides,
  products,
  settings,
}: {
  slides: AdminSlide[];
  products: SliderProduct[];
  settings: { is_enabled: boolean; autoplay_ms: number };
}) {
  const [draft, setDraft] = useState<AdminSlide>(slides[0] ?? emptySlide);

  function chooseProduct(productId: string) {
    const product = products.find((item) => item.id === productId);
    setDraft((current) => ({
      ...current,
      product_id: productId || null,
      title: product?.name ?? current.title,
      description: product?.description ?? current.description,
      desktop_image_url: product?.image_url ?? current.desktop_image_url,
      button_url: product
        ? product.is_preorder_only
          ? "/preorder"
          : `/product/${product.slug}`
        : current.button_url,
    }));
  }

  return (
    <div className="mt-7">
      <form action={saveSliderSettings} className="flex flex-wrap items-center gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <label className="flex items-center gap-3 font-bold">
          <input type="checkbox" name="is_enabled" defaultChecked={settings.is_enabled} className="h-6 w-6 accent-cyan-500" />
          Slider enabled
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
          Autoplay
          <input type="number" name="autoplay_seconds" min="2" max="30" defaultValue={Math.round(settings.autoplay_ms / 1000)} className="w-20 rounded-lg border border-slate-200 bg-white px-3 py-2" />
          seconds
        </label>
        <button className="ml-auto rounded-xl bg-slate-900 px-5 py-2.5 font-bold text-white">Save slider settings</button>
      </form>

      <div className="mt-5 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div><h2 className="font-black">Slides</h2><p className="text-xs text-slate-500">Use arrows to change order.</p></div>
            <button type="button" onClick={() => setDraft(emptySlide)} className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-black text-slate-950">+ Add slide</button>
          </div>
          <div className="mt-4 grid gap-3">
            {slides.map((slide, index) => (
              <article key={slide.id} className={`rounded-xl border p-3 ${draft.id === slide.id ? "border-cyan-400 bg-cyan-50" : "border-slate-200"}`}>
                <button type="button" onClick={() => setDraft(slide)} className="flex w-full items-center gap-3 text-left">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={slide.desktop_image_url} alt="" className="h-16 w-24 rounded-lg bg-slate-100 object-cover" />
                  <span className="min-w-0">
                    <span className="block truncate font-black">{slide.title}</span>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${slide.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{slide.is_active ? "Active" : "Inactive"}</span>
                  </span>
                </button>
                <div className="mt-3 flex gap-2">
                  <form action={moveSlide}><input type="hidden" name="id" value={slide.id} /><input type="hidden" name="direction" value="up" /><button disabled={index === 0} className="rounded-lg border px-3 py-1 disabled:opacity-30">↑</button></form>
                  <form action={moveSlide}><input type="hidden" name="id" value={slide.id} /><input type="hidden" name="direction" value="down" /><button disabled={index === slides.length - 1} className="rounded-lg border px-3 py-1 disabled:opacity-30">↓</button></form>
                  <form action={deleteSlide} className="ml-auto" onSubmit={(event) => { if (!window.confirm("Delete this slide?")) event.preventDefault(); }}>
                    <input type="hidden" name="id" value={slide.id} />
                    <button className="rounded-lg px-3 py-1 text-sm font-bold text-red-600">Delete</button>
                  </form>
                </div>
              </article>
            ))}
            {slides.length === 0 && <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">No slides yet. Select Add slide.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">{draft.id ? "Edit slide" : "Add new slide"}</h2>
          <form action={saveSlide} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={draft.id} />
            <Field label="Existing product" wide>
              <select name="product_id" value={draft.product_id ?? ""} onChange={(event) => chooseProduct(event.target.value)} className={inputClass}>
                <option value="">No product — use a custom link</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
              <small className="mt-1 block text-slate-500">Product details are filled automatically and the button opens its product page.</small>
            </Field>
            <Field label="Eyebrow"><input name="eyebrow" value={draft.eyebrow} onChange={(e) => setDraft({ ...draft, eyebrow: e.target.value })} className={inputClass} /></Field>
            <Field label="Headline"><input name="title" required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputClass} /></Field>
            <Field label="Description" wide><textarea name="description" rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={inputClass} /></Field>
            <Field label="Desktop image URL" wide><input type="url" name="desktop_image_url" required value={draft.desktop_image_url} onChange={(e) => setDraft({ ...draft, desktop_image_url: e.target.value })} className={inputClass} placeholder="Recommended: 1920 × 700 px" /></Field>
            <Field label="Mobile image URL" wide><input type="url" name="mobile_image_url" value={draft.mobile_image_url ?? ""} onChange={(e) => setDraft({ ...draft, mobile_image_url: e.target.value })} className={inputClass} placeholder="Recommended: 768 × 1200 px (optional)" /></Field>
            <Field label="Button text"><input name="button_text" value={draft.button_text} onChange={(e) => setDraft({ ...draft, button_text: e.target.value })} className={inputClass} /></Field>
            <Field label="Button link"><input name="button_url" value={draft.button_url} readOnly={Boolean(draft.product_id)} onChange={(e) => setDraft({ ...draft, button_url: e.target.value })} className={`${inputClass} read-only:bg-slate-100`} placeholder="/products" /></Field>
            <Field label="Start date (India)"><input type="datetime-local" name="starts_at" defaultValue={localDate(draft.starts_at)} key={`start-${draft.id}`} className={inputClass} /></Field>
            <Field label="End date (India)"><input type="datetime-local" name="ends_at" defaultValue={localDate(draft.ends_at)} key={`end-${draft.id}`} className={inputClass} /></Field>
            <label className="flex items-center gap-3 font-bold"><input type="checkbox" name="is_active" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} className="h-6 w-6 accent-cyan-500" />Active</label>
            <div className="sm:col-span-2">
              <p className="mb-2 text-sm font-bold text-slate-700">Live preview</p>
              <div className="relative min-h-56 overflow-hidden rounded-2xl bg-slate-900 bg-cover bg-center p-7 text-white" style={{ backgroundImage: draft.desktop_image_url ? `linear-gradient(90deg, rgba(2,6,23,.9), rgba(2,6,23,.15)), url("${draft.desktop_image_url}")` : undefined }}>
                <div className="relative max-w-lg">
                  <p className="text-xs font-black uppercase tracking-widest text-cyan-300">{draft.eyebrow}</p>
                  <h3 className="mt-3 text-3xl font-black">{draft.title || "Slide headline"}</h3>
                  <p className="mt-3 text-sm text-slate-200">{draft.description}</p>
                  <span className="mt-5 inline-block rounded-lg bg-cyan-500 px-4 py-2 font-black text-slate-950">{draft.button_text || "Shop Now"}</span>
                </div>
              </div>
            </div>
            <button className="sm:col-span-2 justify-self-end rounded-xl bg-cyan-500 px-6 py-3 font-black text-slate-950">{draft.id ? "Save changes" : "Create slide"}</button>
          </form>
        </section>
      </div>
    </div>
  );
}

const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";
function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="text-sm font-bold text-slate-700">{label}</span>{children}</label>;
}
