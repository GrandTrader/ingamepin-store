"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { filterPromotersByEmail, type AffiliatePromoter, type PromoterView } from "@/lib/affiliate-promoters";
import { savePromoterSettings } from "./actions";
import PromoterEarnings from "./PromoterEarnings";

const statuses = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"] as const;
const pageSize = 25;

export default function PromoterList({ accounts, view, initialSearch = "" }: { accounts: AffiliatePromoter[]; view: PromoterView; initialSearch?: string }) {
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => filterPromotersByEmail(accounts, search), [accounts, search]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const displayed = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return <>
    <div className="mt-4 flex max-w-[1160px] flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 text-sm font-bold text-slate-700">Search by email
        <input type="search" inputMode="email" maxLength={254} autoComplete="off" placeholder="Search email…" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} className="mt-1 block min-h-[44px]! w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-normal text-slate-900 sm:text-sm" />
      </label>
      <button type="button" aria-label="Clear search" onClick={() => { setSearch(""); setPage(0); }} className="min-h-[44px]! rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">Clear</button>
      <p role="status" className="w-full text-xs text-slate-600">{filtered.length} of {accounts.length} promoters</p>
    </div>
    <p id="promoter-commission-help" className="mt-2 text-xs text-slate-500">Leave commission empty to use the product rate.</p>
          <section aria-label="Promoters" className="mt-3 max-w-[1160px] divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                {search.trim() ? "No promoters match this email." : view === "approved" ? "No approved promoters yet." : "No affiliate applications to manage."}
              </div>
            ) : (
              displayed.map((account) => (
                <form
                  key={`${account.id}-${account.status}-${account.commission_override_percent}`}
                  action={savePromoterSettings}
                  className="px-3 py-2"
                >
                  <input type="hidden" name="affiliate_id" value={account.id} />
                  <input type="hidden" name="return_view" value={view} />
                  <input type="hidden" name="search" value={search} />

                  <div className="grid gap-2 xl:grid-cols-[minmax(180px,1fr)_minmax(280px,360px)_minmax(300px,340px)] xl:items-center xl:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words text-sm font-bold">{account.full_name}</h2>
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                          {account.affiliate_code}
                        </span>
                      </div>
                      <p className="mt-0.5 break-all text-sm text-slate-700">{account.email || "Email unavailable"}</p>
                      <p className="mt-1 break-words text-xs text-slate-500">
                        {account.country_code} · {account.promotion_channel.replaceAll("_", " ")} · {new Date(account.created_at).toLocaleDateString("en-IN")}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4">
                      <Link href={`/admin/affiliates/promoters/${account.id}`} className="inline-flex min-h-[44px]! items-center text-xs font-bold text-blue-700 hover:underline">View profile →</Link>
                      {account.promotion_url && (
                        <a
                          href={account.promotion_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-[44px]! items-center break-all text-xs font-bold text-blue-600 hover:underline"
                          aria-label={`View promotion page for ${account.full_name}`}
                          title={account.promotion_url}
                        >
                          Promotion page ↗
                        </a>
                      )}
                      </div>
                    </div>

                    <PromoterEarnings id={account.id} finance={account.finance}/>
                    <div className="grid min-w-0 grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <label className="min-w-0">
                        <span className="text-xs font-bold text-slate-600">Status</span>
                        <select
                          name="status"
                          aria-label="Status"
                          defaultValue={account.status}
                          className="mt-1 min-h-[44px]! w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-base outline-none focus:border-blue-500 sm:text-sm"
                        >
                          {statuses.map((status) => (
                            <option key={status} value={status}>
                              {status.charAt(0) + status.slice(1).toLowerCase()}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="min-w-0">
                        <span className="text-xs font-bold text-slate-600">
                          Custom commission
                        </span>
                        <div className="mt-1 flex min-h-[44px]! overflow-hidden rounded-lg border border-slate-300 focus-within:border-blue-500">
                          <input
                            name="commission_override_percent"
                            type="number"
                            min="0.01"
                            max="25"
                            step="0.01"
                            defaultValue={
                              account.commission_override_percent ?? ""
                            }
                            placeholder="Default"
                            aria-describedby="promoter-commission-help"
                            className="min-h-[44px]! min-w-0 flex-1 bg-white px-2 py-2 text-base outline-none sm:text-sm"
                          />
                          <span className="flex items-center border-l border-slate-200 bg-slate-50 px-2 text-sm font-bold text-slate-500">
                            %
                          </span>
                        </div>
                      </label>

                      <SavePromoterButton />
                    </div>
                  </div>
                </form>
              ))
            )}
          </section>
    {filtered.length > pageSize && <nav aria-label="Promoter pages" className="mt-5 flex max-w-[1160px] items-center justify-between gap-3 text-sm">
      <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-lg border px-4 py-3 disabled:opacity-50">Previous</button>
      <span>Page {currentPage + 1} of {Math.ceil(filtered.length / pageSize)}</span>
      <button type="button" disabled={(currentPage + 1) * pageSize >= filtered.length} onClick={() => setPage(currentPage + 1)} className="rounded-lg border px-4 py-3 disabled:opacity-50">Next</button>
    </nav>}
  </>;
}

function SavePromoterButton() {
  const { pending } = useFormStatus();
  return <button type="submit" aria-label="Save Promoter" disabled={pending} className="col-span-2 min-h-[44px]! rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60 sm:col-span-1">{pending ? "Saving…" : "Save"}</button>;
}
