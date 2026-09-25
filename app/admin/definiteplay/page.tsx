import CatalogueSelection from "./CatalogueSelection";
import { parseSupplierSelection } from "@/lib/definiteplay-import";
import Link from "next/link";
import AdminSidebar from "../AdminSidebar";
import {requireDefinitePlayAdmin} from "@/lib/definiteplay-admin";
import {getDefinitePlayCatalogue,getDefinitePlayStatus} from "@/lib/definiteplay-relay";
import {readSupplierBalances} from "@/lib/definiteplay-money";
import RefreshButton from "./RefreshButton";
import CategoryFilter from "./CategoryFilter";

export const dynamic="force-dynamic";
export default async function DefinitePlayPage({searchParams}:{searchParams:Promise<{q?:string;page?:string;category?:string;region?:string;variant?:string;selected?:string|string[]}>}) {
  await requireDefinitePlayAdmin();
  const params=await searchParams;
  const q=(typeof params.q==="string"?params.q:"").slice(0,200);
  const category=(typeof params.category==="string"?params.category:"").slice(0,200).trim();
  const region=(typeof params.region==="string"?params.region:"").slice(0,200).trim();
  const variant=params.variant==="regular"||params.variant==="discounted"?params.variant:"";
  const page=Math.max(1,Math.min(10000,Number.parseInt(params.page??"1",10)||1));
  let data=null;let status=null;let error="";
  try {[data,status]=await Promise.all([getDefinitePlayCatalogue(q,(page-1)*30,30,{category,region,variant}),getDefinitePlayStatus()]);}
  catch(e){error=e instanceof Error?e.message:"Supplier connection unavailable.";}
  let balances=null;
  if(status?.balances) {
    try{balances=readSupplierBalances(status.balances);}
    catch{error="Supplier balance details could not be read.";}
  }
  let selected: string[] = [];
  if (params.selected !== undefined) {
    try { selected = parseSupplierSelection(params.selected); }
    catch { error = "The previous selection is invalid. Select products again from the catalogue."; }
  }
  return <div className="min-h-screen bg-white text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
    <AdminSidebar/><main className="min-w-0 flex-1 p-5 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4"><div>
        <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Supplier connection</p>
        <h1 className="mt-2 text-3xl font-black">Definite Play</h1>
        <p className="mt-2 text-sm text-slate-600">Browse supplier products. Open a website product’s Supplier tab to link its denominations.</p>
      </div><RefreshButton syncedAt={status?.syncedAt??null}/></header>
      <p className="mt-5 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">Product links prepare your catalogue for supplier fulfilment. Automatic purchasing is not enabled yet. Your selling prices and existing code stock stay unchanged.</p>
      {error&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
      {status&&<><div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border p-4"><p className="text-sm text-slate-500">USD account balance</p><p className="mt-2 text-xl font-bold">{balances?.accountBalance?`USD ${balances.accountBalance.amount}`:"Unavailable"}</p></div>
        <div className="rounded-xl border p-4"><p className="text-sm text-slate-500">Supplier available balance</p><p className="mt-2 text-xl font-bold">{balances?.availableBalance?`${balances.availableBalance.currency} ${balances.availableBalance.amount}`:"Unavailable"}</p></div>
        <div className="rounded-xl border p-4"><p className="text-sm text-slate-500">Supplier products</p><p className="mt-2 text-xl font-bold">{status.productCount.toLocaleString()}</p></div>
      </div>
      <p className="mt-3 text-sm text-slate-500">Last updated: {status.syncedAt?new Date(status.syncedAt).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})+" IST":"Not synced yet"}. Supplier data refreshes every five minutes.</p>
      {(status.stale||status.error)&&<p role="status" className="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{status.error||"Supplier data is out of date. Refresh before linking products."}</p>}
      {balances?.availableBalance&&!balances.availableMatchesDisplayCurrency&&<p className="mt-3 text-sm text-amber-800">Available credit is reported in {balances.availableBalance.currency}. It has not been converted to USD.</p>}</>}
      <form action="/admin/definiteplay" key={JSON.stringify([q,category,region,variant])} className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="min-w-0 text-sm font-bold">Search
            <input name="q" defaultValue={q} placeholder="Product name or code" className="mt-2 w-full rounded-xl border bg-white px-4 py-3 font-normal"/>
          </label>
          <CategoryFilter categories={data?.categories ?? []} defaultValue={category} />
          <label className="min-w-0 text-sm font-bold">Region
            <select name="region" defaultValue={region} className="mt-2 w-full rounded-xl border bg-white px-3 py-3 font-normal">
              <option value="">All regions</option>
              {region&&!data?.regions?.includes(region)&&<option value={region}>{region}</option>}
              {(data?.regions??[]).map(value=><option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-sm font-bold">Product version
            <select name="variant" defaultValue={variant} className="mt-2 w-full rounded-xl border bg-white px-3 py-3 font-normal">
              <option value="">All versions</option><option value="regular">Regular</option><option value="discounted">With discount label</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700">Apply filters</button>
          {(q||category||region||variant)&&<Link href="/admin/definiteplay" className="text-sm font-bold text-blue-600">Clear filters</Link>}
          <p className="text-xs text-slate-500">Categories follow the supplier’s brands and product groups.</p>
        </div>
      </form>
      {data && <CatalogueSelection key={JSON.stringify([q,category,region,variant,page,selected])}
        items={data.items} total={data.total} page={page} filters={{q,category,region,variant}} initialSelection={selected} />}
      <Link className="mt-6 inline-block font-semibold text-blue-600" href="/admin/products">Open website products →</Link>
    </main></div></div>;
}
