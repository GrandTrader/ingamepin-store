"use client";

import { useState } from "react";

function createSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function ProductNameSlugFields() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  function handleNameChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const nextName = event.target.value;

    setName(nextName);
    setSlug(createSlug(nextName));
  }

  return (
    <>
      <label>
        <span className="text-sm font-bold">
          Product name
        </span>

        <input
          name="name"
          value={name}
          onChange={handleNameChange}
          required
          minLength={2}
          maxLength={150}
          placeholder="PlayStation Gift Card India"
          className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </label>

      <label>
        <span className="text-sm font-bold">
          URL slug
        </span>

        <input
          name="slug"
          value={slug}
          onChange={(event) =>
            setSlug(createSlug(event.target.value))
          }
          required
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          placeholder="Created automatically"
          className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />

        <span className="mt-1 block text-xs text-slate-500">
          Automatically created from the product name.
        </span>
      </label>
    </>
  );
}