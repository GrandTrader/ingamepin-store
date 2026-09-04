"use client";

type ReportFiltersProps = {
  periodMode: string;
  selectedCurrency: string;
  currencies: string[];
};

export default function ReportFilters({
  periodMode,
  selectedCurrency,
  currencies,
}: ReportFiltersProps) {
  return (
    <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <label className="grid gap-1 text-xs font-bold text-slate-500" htmlFor="range">
        Chart candle
        <select
          id="range"
          name="range"
          defaultValue={periodMode}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="rounded-xl border-0 bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-900 outline-none ring-blue-500 focus:ring-2"
        >
          <option value="daily">Daily candles</option>
          <option value="weekly">Weekly candles</option>
          <option value="monthly">Monthly candles</option>
        </select>
      </label>

      <label className="grid gap-1 text-xs font-bold text-slate-500" htmlFor="currency">
        Order currency
        <select
          id="currency"
          name="currency"
          defaultValue={selectedCurrency}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="rounded-xl border-0 bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-900 outline-none ring-blue-500 focus:ring-2"
        >
          {currencies.map((currency) => (
            <option key={currency}>{currency}</option>
          ))}
        </select>
      </label>
    </form>
  );
}
