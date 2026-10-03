"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { filterPromotersByEmail, type AffiliatePromoter, type PromoterView } from "@/lib/affiliate-promoters";
import { savePromoterSettings } from "./actions";

const statuses = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"] as const;
const pageSize = 25;

export default function PromoterList({ accounts, view, initialSearch = "" }: { accounts: AffiliatePromoter[]; view: PromoterView; initialSearch?: string }) {
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => filterPromotersByEmail(accounts, search), [accounts, search]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const displayed = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return <>
    <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label className="min-w-0 flex-1 text-sm font-bold text-slate-700">Search by email
        <input type="search" inputMode="email" maxLength={254} autoComplete="off" placeholder="Enter all or part of an email" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 font-normal text-slate-900" />
      </label>
      <button type="button" onClick={() => { setSearch(""); setPage(0); }} className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700">Clear search</button>
      <p role="status" className="w-full text-sm text-slate-600">{filtered.length} of {accounts.length} promoters</p>
    </div>
          <section className="mt-8 space-y-4">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                {search.trim() ? "No promoters match this email." : view === "approved" ? "No approved promoters yet." : "No affiliate applications to manage."}
              </div>
            ) : (
              displayed.map((account) => (
                <form
                  key={`${account.id}-${account.status}-${account.commission_override_percent}`}
                  action={savePromoterSettings}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
                >
                  <input type="hidden" name="affiliate_id" value={account.id} />
                  <input type="hidden" name="return_view" value={view} />
                  <input type="hidden" name="search" value={search} />

                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-black">{account.full_name}</h2>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                          {account.affiliate_code}
                        </span>
                      </div>
                      <p className="mt-2 break-all text-sm font-semibold text-slate-700">{account.email || "Email unavailable"}</p>
                      <p className="mt-2 text-sm text-slate-500">
                        {account.country_code} · {account.promotion_channel} · Applied {new Date(account.created_at).toLocaleDateString("en-IN")}
                      </p>
                      {account.promotion_url && (
                        <a
                          href={account.promotion_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block break-all text-sm font-bold text-blue-600 hover:underline"
                        >
                          {account.promotion_url}
                        </a>
                      )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:w-[560px]">
                      <label>
                        <span className="text-sm font-bold">Status</span>
                        <select
                          name="status"
                          aria-label="Status"
                          defaultValue={account.status}
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500"
                        >
                          {statuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span className="text-sm font-bold">
                          Custom commission
                        </span>
                        <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-200 focus-within:border-blue-500">
                          <input
                            name="commission_override_percent"
                            type="number"
                            min="0.01"
                            max="25"
                            step="0.01"
                            defaultValue={
                              account.commission_override_percent ?? ""
                            }
                            placeholder="Use product rate"
                            className="min-w-0 flex-1 px-4 py-3 outline-none"
                          />
                          <span className="border-l border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-500">
                            %
                          </span>
                        </div>
                      </label>

                      <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                        Leave empty to use the product&apos;s commission setting.
                      </p>

                      <SavePromoterButton />
                    </div>
                  </div>
                </form>
              ))
            )}
          </section>
    {filtered.length > pageSize && <nav aria-label="Promoter pages" className="mt-5 flex items-center justify-between gap-3 text-sm">
      <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-lg border px-4 py-3 disabled:opacity-50">Previous</button>
      <span>Page {currentPage + 1} of {Math.ceil(filtered.length / pageSize)}</span>
      <button type="button" disabled={(currentPage + 1) * pageSize >= filtered.length} onClick={() => setPage(currentPage + 1)} className="rounded-lg border px-4 py-3 disabled:opacity-50">Next</button>
    </nav>}
  </>;
}

function SavePromoterButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60 sm:col-span-2">{pending ? "Saving…" : "Save Promoter"}</button>;
}
