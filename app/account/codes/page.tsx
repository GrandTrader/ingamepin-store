import { redirect } from "next/navigation";

export default function CustomerCodesPage() {
  redirect("/account/dashboard?view=orders#orders");
}
