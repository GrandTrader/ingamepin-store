"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  name: string;
  fileName: string;
  defaultValue?: string | null;
  variant: "product" | "slide";
  required?: boolean;
  helpText?: string;
  categoryImage?: { name: string; url: string | null };
};

export default function ResponsiveImageField({
  label,
  name,
  fileName,
  defaultValue = "",
  variant,
  required = false,
  categoryImage,
  helpText = "Upload an image or paste its URL. Uploaded images must be smaller than 10 MB.",
}: Props) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [filePreview, setFilePreview] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = filePreview || url;
  const isProduct = variant === "product";

  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  function selectFile(file: File | undefined) {
    if (!file) return;
    setUrl("");
    setFilePreview(URL.createObjectURL(file));
  }

  function selectUrl(value: string) {
    // A previous file must not override the URL when the form is submitted.
    if (fileInput.current) fileInput.current.value = "";
    setFilePreview("");
    setUrl(value);
  }

  return (
    <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900">{label}</p>
          <p className="mt-1 text-xs text-slate-500">
            {helpText}
          </p>
        </div>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
          Auto Fit: ON
        </span>
      </div>

      {categoryImage && (
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          {categoryImage.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={categoryImage.url} alt={categoryImage.name + " category"} className="h-16 w-16 rounded-lg border border-slate-200 bg-white object-contain" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Category image · {categoryImage.name}</p>
            <p className="mt-1 text-xs text-slate-600">
              {categoryImage.url ? "Use this image for the product, or upload your own below. Click Save Gallery to apply." : "This category has no image. Add one in Categories, or upload a product image below."}
            </p>
          </div>
          <button type="button" disabled={!categoryImage.url}
            aria-pressed={Boolean(categoryImage.url && !filePreview && url === categoryImage.url)}
            onClick={() => { if (categoryImage.url) selectUrl(categoryImage.url); }}
            className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            Use category image
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <div className="grid gap-4">
          <label className="cursor-pointer rounded-xl border-2 border-dashed border-blue-300 bg-white p-5 text-center transition hover:border-blue-500 hover:bg-blue-50">
            <span className="block text-3xl" aria-hidden="true">↑</span>
            <span className="mt-2 block font-black text-blue-600">Upload Image</span>
            <span className="mt-1 block text-xs text-slate-500">JPG, PNG, WebP or GIF</span>
            <input
              ref={fileInput}
              type="file"
              name={fileName}
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) => selectFile(event.target.files?.[0])}
              className="sr-only"
            />
          </label>

          <label>
            <span className="text-xs font-bold text-slate-600">Or paste image URL</span>
            <input
              type="url"
              name={name}
              value={url}
              required={required && !filePreview}
              onChange={(event) => {
                selectUrl(event.target.value);
              }}
              placeholder="https://example.com/image.jpg"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-slate-600">Live preview</p>
            <p className="text-xs text-slate-500">
              {isProduct ? "3:4 portrait product field" : "1920 × 700 slide field"}
            </p>
          </div>
          <div
            className={`mt-2 flex overflow-hidden rounded-xl border border-slate-200 bg-slate-900 ${
              isProduct ? "aspect-[3/4]" : "aspect-[1920/700]"
            }`}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Image preview" className={`h-full w-full ${isProduct ? "object-cover object-center" : "object-fill"}`} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                Image preview
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700">Automatic Portrait Fit</span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700">No Empty Space</span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-blue-600">Responsive</span>
          </div>
        </div>
      </div>
    </div>
  );
}
