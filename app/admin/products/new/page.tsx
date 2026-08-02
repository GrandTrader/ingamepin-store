import { createDraftProduct } from "../actions";

export const dynamic = "force-dynamic";

export default async function AddProductPage() {
  await createDraftProduct();
  return null;
}
