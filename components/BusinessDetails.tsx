export default function BusinessDetails() {
  return (
    <section aria-labelledby="business-details-heading" className="rounded-3xl border border-white/10 bg-slate-900 p-5 sm:p-8">
      <h2 id="business-details-heading" className="text-2xl font-black">Business details</h2>
      <dl className="mt-5 space-y-4 text-sm leading-6">
        <div><dt className="font-bold text-white">Operator and trade name</dt><dd className="text-slate-300">AMAN G</dd></div>
        <div><dt className="font-bold text-white">GSTIN</dt><dd className="text-slate-300">19CMAPG4174K1ZV</dd></div>
        <div><dt className="font-bold text-white">Registered address</dt><dd className="text-slate-300">Chandpur Leningarh, near Jagorani Sangha Club, South Jogendra Nagar, Kolkata, West Bengal 700110, India</dd></div>
        <div><dt className="font-bold text-white">Support email</dt><dd><a href="mailto:support@ingamepin.com" className="break-all text-cyan-400 underline underline-offset-4">support@ingamepin.com</a></dd></div>
      </dl>
    </section>
  );
}
