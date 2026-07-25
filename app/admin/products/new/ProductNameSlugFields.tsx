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

  return (
    <label>
      <span className="text-sm font-bold">
        Product name
      </span>

      <input
        name="name"
        value={name}
        onChange={(event) =>
          setName(event.target.value)
        }
        required
        minLength={2}
        maxLength={150}
        placeholder="PlayStation Gift Card India"
        className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />

      <input
        type="hidden"
        name="slug"
        value={createSlug(name)}
      />
    </label>
  );
}
