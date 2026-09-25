import { paypalychBlockedBrand } from "@/lib/paypalych-product-policy";

export default function PaypalychProductWarning({ identities, brand }: {
  identities?: Array<string | null | undefined>; brand?: string | null;
}) {
  const match = brand ?? paypalychBlockedBrand(...(identities ?? []));
  if (!match) return null;
  return <div role="status" className="my-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
    <p className="font-black">Paypalych unavailable — {match}</p>
    <p className="mt-1">This product matches your Paypalych exclusion list. Paypalych is automatically blocked at checkout. Use another payment gateway.</p>
  </div>;
}
