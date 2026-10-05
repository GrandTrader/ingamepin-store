"use client";

import { useState, type ReactNode } from "react";
import { GAME_PLATFORMS, isGamesCategory, normalizeGamePlatforms } from "@/lib/game-platforms";

type Category = { id: string; name: string; slug: string };

export default function ProductCategoryPlatforms({ categories, categoryId, platforms, children }: {
  categories: Category[];
  categoryId: string | null;
  platforms: string[] | null;
  children: ReactNode;
}) {
  const [selectedCategory, setSelectedCategory] = useState(categoryId ?? "");
  const [selectedPlatforms, setSelectedPlatforms] = useState(() => normalizeGamePlatforms(platforms));
  const showPlatforms = isGamesCategory(categories.find((category) => category.id === selectedCategory));

  return (
    <div className="grid min-w-0 gap-5 md:col-span-2 md:grid-cols-2">
      <label>
        <span id="product-category-label" className="text-sm font-bold">Category</span>
        <select aria-labelledby="product-category-label" name="category_id" value={selectedCategory} required
          onChange={(event) => setSelectedCategory(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3">
          <option value="" disabled>Select category</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </label>
      {children}
      {showPlatforms && (
        <fieldset className="min-w-0 rounded-xl border border-slate-200 p-3 md:col-span-2">
          <legend className="px-1 text-sm font-bold">Gaming platforms</legend>
          <p className="mb-3 text-xs text-slate-500">Select all platforms this product supports.</p>
          <div className="flex flex-wrap gap-2">
            {GAME_PLATFORMS.map((platform) => {
              const checked = selectedPlatforms.includes(platform);
              return (
                <label key={platform} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? "border-blue-500 bg-blue-50 font-bold text-blue-700" : "border-slate-200 bg-white text-slate-700"}`}>
                  <input type="checkbox" name="gaming_platforms" value={platform} checked={checked}
                    className="h-4 w-4 accent-blue-600"
                    onChange={() => setSelectedPlatforms((current) => checked
                      ? current.filter((value) => value !== platform)
                      : normalizeGamePlatforms([...current, platform]))} />
                  {platform}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}
