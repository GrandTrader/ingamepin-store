const RESTRICTED_PLATFORMS =
  "Shelbit, Aban Tether Exchange, A7 Nigeria, A7 Africa, PilotFinance, Rapira, Aifory Pro, ABCeX, WhiteBird, NoOnecrypto, Tradex, Monease, BitPapa, Exnode, Exnode Pay, HTX (Huobi), or EXMO.";

export default function UsdtComplianceWarning() {
  return (
    <aside className="mt-6 rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 text-left shadow-lg shadow-amber-950/15 dark:border-amber-400/70 dark:bg-amber-950/40">
      <h2 className="text-base font-black text-amber-800 dark:text-amber-300">
        ⚠️ IMPORTANT USDT PAYMENT WARNING
      </h2>
      <p className="mt-3 text-sm font-bold leading-6 text-slate-900 dark:text-amber-50">
        Please do not send payment directly or indirectly through the following
        platforms:
      </p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-800 dark:text-amber-100">
        {RESTRICTED_PLATFORMS}
      </p>
      <p className="mt-3 text-sm leading-6 text-slate-800 dark:text-amber-50">
        Payments connected to these platforms may be detected by compliance
        screening. The order will be placed on hold, and the funds may be subject
        to an extended compliance review. Products will not be delivered until
        the payment is cleared.
      </p>
      <p className="mt-3 text-sm font-black leading-6 text-slate-950 dark:text-white">
        By proceeding, you confirm that your payment does not originate from or
        pass through any of the platforms listed above.
      </p>
    </aside>
  );
}
