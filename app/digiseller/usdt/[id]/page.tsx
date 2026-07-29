import DigisellerUsdtPayment from "./DigisellerUsdtPayment";

export default async function DigisellerUsdtPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return (
    <DigisellerUsdtPayment
      invoiceId={id}
      token={query.token ?? ""}
    />
  );
}