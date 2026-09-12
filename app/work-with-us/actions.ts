"use server";

import { redirect } from "next/navigation";

import { supplierFields } from "@/lib/supplier-application";
import { sendEmail } from "@/lib/email";

function clean(formData: FormData, name: string, maxLength: number) {
  return String(formData.get(name) ?? "").trim().slice(0, maxLength);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

export async function submitPartnerApplication(formData: FormData) {
  const fail = (message: string) => redirect(`/work-with-us?error=${encodeURIComponent(message)}`);
  if (clean(formData, "company_site", 200)) redirect("/work-with-us?success=1");

  const partnerType = clean(formData, "partner_type", 50);
  const company = clean(formData, "company", 120);
  const contactName = clean(formData, "contact_name", 100);
  const email = clean(formData, "email", 160).toLowerCase();
  const website = clean(formData, "website", 250);
  const country = clean(formData, "country", 100);
  const monthlyVolume = clean(formData, "monthly_volume", 100);
  const proposal = clean(formData, "proposal", 3000);

  if (!["PAYMENT_PROVIDER", "GAMING_DISTRIBUTOR"].includes(partnerType)) fail("Select a partnership type.");
  if (company.length < 2 || contactName.length < 2 || country.length < 2 || (partnerType === "PAYMENT_PROVIDER" && proposal.length < 20)) fail("Complete all required application details.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter a valid business email address.");
  if (website && !/^https?:\/\//i.test(website)) fail("The company website must begin with http:// or https://.");

  if (formData.get("consent") !== "yes") fail("Confirm that you are authorized to submit this proposal.");
  const supplierDetails: [string, string][] = [];
  if (partnerType === "GAMING_DISTRIBUTOR") {
    for (const field of supplierFields) {
      const raw = String(formData.get(field.name) ?? "").trim();
      if (raw.length > field.maxLength || (field.required && raw.length < 2) || (field.options && !field.options.includes(raw))) fail("Check the field: " + field.label + ".");
      if (field.name === "catalogue_url" && raw) {
        try { const url = new URL(raw); if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) fail("Use a public http or https catalogue link without login credentials."); }
        catch { fail("Enter a valid catalogue URL."); }
      }
      supplierDetails.push([field.label, raw || "Not provided"]);
    }
  }
  const supplierText = supplierDetails.map(([label,value]) => label + ": " + value).join("\n");
  const supplierHtml = supplierDetails.length ? '<h2>Product supply details</h2>' + supplierDetails.map(([label,value]) => '<p style="white-space:pre-wrap"><strong>' + escapeHtml(label) + ':</strong> ' + escapeHtml(value) + '</p>').join("") : "";
  const typeLabel = partnerType === "PAYMENT_PROVIDER" ? "Payment Provider" : "Gaming Product Supplier";
  try {
    await sendEmail({
      to: "amang@ingamepin.com",
      replyTo: email,
      subject: `Partnership application: ${typeLabel} — ${company}`,
      text: `Partnership type: ${typeLabel}\nCompany: ${company}\nContact: ${contactName}\nEmail: ${email}\nWebsite: ${website || "Not provided"}\nCountry: ${country}\nMonthly volume: ${monthlyVolume || "Not provided"}\n\n${supplierText}\n\nProposal:\n${proposal || "Not provided"}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;padding:24px;color:#0f172a"><h1>New partnership application</h1><p><strong>Type:</strong> ${escapeHtml(typeLabel)}<br><strong>Company:</strong> ${escapeHtml(company)}<br><strong>Contact:</strong> ${escapeHtml(contactName)}<br><strong>Email:</strong> ${escapeHtml(email)}<br><strong>Website:</strong> ${escapeHtml(website || "Not provided")}<br><strong>Country:</strong> ${escapeHtml(country)}<br><strong>Estimated monthly volume:</strong> ${escapeHtml(monthlyVolume || "Not provided")}</p>${supplierHtml}<h2>Proposal</h2><p style="white-space:pre-wrap">${escapeHtml(proposal)}</p></div>`,
    });
  } catch {
    fail("Unable to send the application right now. Please try again.");
  }
  redirect("/work-with-us?success=1");
}
