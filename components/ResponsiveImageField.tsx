"use client";

import { useEffect, useState } from "react";

type Props = {
  label: string;
  name: string;
  fileName: string;
  defaultValue?: string | null;
  variant: "product" | "slide";
  required?: boolean;
};

export default function ResponsiveImageField({
  label,
  name,
  fileName,
  defaultValue = "",
  variant,
  required = false,
}: Props) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [filePreview, setFilePreview] = useState("");
  const preview = filePreview || url;
  const isProduct = variant === "product";

  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  function selectFile(file: File | undefined) {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview(file ? URL.createObjectURL(file) : "");
  }

  return (
    <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900">{label}</p>
          <p className="mt-1 text-xs text-slate-500">
            Upload an image or paste its URL. Uploaded images must be smaller than 10 MB.
          </p>
        </div>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
          Auto Fit: ON
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <div className="grid gap-4">
          <label className="cursor-pointer rounded-xl border-2 border-dashed border-blue-300 bg-white p-5 text-center transition hover:border-blue-500 hover:bg-blue-50">
            <span className="block text-3xl" aria-hidden="true">↑</span>
            <span className="mt-2 block font-black text-blue-600">Upload Image</span>
            <span className="mt-1 block text-xs text-slate-500">JPG, PNG, WebP or GIF</span>
            <input
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
                setUrl(event.target.value);
                setFilePreview("");
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
              {isProduct ? "4:3 product field" : "1920 × 700 slide field"}
            </p>
          </div>
          <div
            className={`mt-2 flex overflow-hidden rounded-xl border border-slate-200 bg-slate-900 ${
              isProduct ? "aspect-[4/3]" : "aspect-[1920/700]"
            }`}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Image preview" className="h-full w-full object-fill" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                Image preview
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700">No Crop</span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700">No Empty Space</span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-blue-600">Responsive</span>
          </div>
        </div>
      </div>
    </div>
  );
}
