import { headers } from "next/headers";
import PurchaseVerification from "@/components/PurchaseVerification";
import { purchaseIdentity } from "@/lib/purchase-access";
import { readPurchaseList, type PurchaseList } from "@/lib/purchase-list";
import { requestLimit } from "@/lib/request-security";

export default async function InitialPurchases({ page }: { page: number }) {
  const identity = await purchaseIdentity();
  let initial: PurchaseList | null | undefined = null;
  let error: string | undefined;
  if (identity) {
    try {
      const request = new Request("https://www.ingamepin.com/track-order", { headers: await headers() });
      const blocked = await requestLimit(request, "purchase-read", 120, 60);
      if (blocked) error = "Unable to load purchases. Please wait and try again.";
      else initial = await readPurchaseList(identity, page);
    } catch { error = "Unable to load purchases. Please try again."; }
  }
  return <PurchaseVerification key={page} initialPage={page} initialPurchases={initial} initialError={error} />;
}
