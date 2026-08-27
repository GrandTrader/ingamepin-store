"use server";

import { createClient } from "@/lib/supabase/server";

type BillingDetails = {
  fullName: string;
  country: string;
  address: string;
  taxpayerId: string;
};

export async function saveCustomerInvoiceDetails(details: BillingDetails) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Please sign in to save billing details." };

  const { error } = await supabase.auth.updateUser({
    data: {
      billing_full_name: details.fullName.slice(0, 150),
      billing_country: details.country.slice(0, 150),
      billing_address: details.address.slice(0, 500),
      billing_taxpayer_id: details.taxpayerId.slice(0, 100),
    },
  });

  return error ? { error: error.message } : { error: null };
}
