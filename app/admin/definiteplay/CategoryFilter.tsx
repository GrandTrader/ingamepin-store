"use client";

import { useEffect, useId, useRef, useState } from "react";

export default function CategoryFilter({ categories, defaultValue }: {
  categories: string[]; defaultValue: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const choices = [...new Set([...(defaultValue ? [defaultValue] : []), ...categories])];
  const matches = choices.filter(value => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const options = ["", ...matches];
  const highlighted = Math.min(active, options.length - 1);

  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted]);

  function choose(value: string) {
    setSelected(value);
    setOpen(false);
    trigger.current?.focus();
  }
  function show() {
    setQuery("");
    setActive(0);
    setOpen(true);
  }

  return <div className="relative min-w-0 text-sm" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label id={`${id}-label`} htmlFor={`${id}-trigger`} className="font-bold">Category</label>
    <input type="hidden" name="category" value={selected} />
    <button ref={trigger} id={`${id}-trigger`} type="button" aria-haspopup="listbox"
      aria-expanded={open} aria-controls={`${id}-list`} aria-labelledby={`${id}-label ${id}-value`}
      onClick={() => open ? setOpen(false) : show()}
      onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(); } }}
      className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-left font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
      <span id={`${id}-value`} className="truncate">{selected || "All categories"}</span>
      <span aria-hidden="true" className="shrink-0">▾</span>
    </button>
    {open && <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl">
      <div className="border-b border-slate-200 p-2">
        <input ref={search} type="search" role="combobox" aria-label="Search categories"
          aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={`${id}-option-${highlighted}`} autoComplete="off"
          placeholder="Search categories…" value={query}
          onChange={event => { setQuery(event.target.value); setActive(event.target.value.trim() ? 1 : 0); }}
          onKeyDown={event => {
            if (event.key === "ArrowDown") { event.preventDefault(); setActive(Math.min(highlighted + 1, options.length - 1)); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setActive(Math.max(highlighted - 1, 0)); }
            else if (event.key === "Enter") { event.preventDefault(); choose(options[highlighted]); }
            else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
            else if (event.key === "Tab") setOpen(false);
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
      </div>
      <div ref={list} id={`${id}-list`} role="listbox" aria-label="Categories" className="max-h-64 overflow-y-auto overscroll-contain p-1">
        {options.map((value, index) => <button key={value} id={`${id}-option-${index}`} type="button"
          role="option" aria-selected={selected === value} tabIndex={-1} data-index={index}
          onMouseDown={event => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => choose(value)}
          className={`block w-full rounded-lg px-3 py-2 text-left ${highlighted === index ? "bg-blue-100 text-blue-900" : "text-slate-800 hover:bg-slate-100"} ${selected === value ? "font-bold" : "font-normal"}`}>
          {value || "All categories"}
        </button>)}
      </div>
      <p role="status" className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
        {matches.length ? `${matches.length} categories` : "No matching categories"}
      </p>
    </div>}
  </div>;
}
