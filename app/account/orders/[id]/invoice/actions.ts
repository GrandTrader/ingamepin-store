"use server";

import { createClient } from "@/lib/supabase/server";

type BillingDetails = {
  fullName: string;
  companyName: string;
  country: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
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
      billing_company_name: details.companyName.slice(0, 150),
      billing_country: details.country.slice(0, 150),
      billing_address_line_1: details.addressLine1.slice(0, 200),
      billing_address_line_2: details.addressLine2.slice(0, 200),
      billing_city: details.city.slice(0, 100),
      billing_state: details.state.slice(0, 100),
      billing_postal_code: details.postalCode.slice(0, 30),
      billing_taxpayer_id: details.taxpayerId.slice(0, 100),
    },
  });

  return error ? { error: error.message } : { error: null };
}
