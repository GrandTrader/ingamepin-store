import "server-only";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
export function customerDisplayName(user: { email?: string; user_metadata?: Record<string, unknown> }) { return String(user.user_metadata?.full_name ?? "").trim() || String(user.email ?? "Customer").split("@")[0]; }
export async function requireCustomer() { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user?.email) redirect("/account?error=Please sign in to continue."); return { user, supabase, displayName: customerDisplayName(user) }; }
export async function getCustomerOrders(email: string) { const result = await createAdminClient().from("orders").select("id, order_number, total, currency, status, created_at, delivered_at, order_items(id, product_name, option_name, denomination, platform, quantity)").eq("customer_email", email.toLowerCase()).order("created_at", { ascending: false }); if (result.error) throw new Error(`Unable to load customer orders: ${result.error.message}`); return result.data ?? []; }
export function formatCustomerMoney(value: number | string, currency: string) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "USD" }).format(Number(value)); }
export function formatCustomerDate(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)); }
export function customerStatusClass(status: string) { if (status === "DELIVERED") return "bg-emerald-100 text-emerald-700"; if (status === "PAID" || status === "PROCESSING") return "bg-blue-100 text-blue-700"; if (status === "PAYMENT_REVIEW") return "bg-amber-100 text-amber-700"; if (status === "CANCELLED" || status === "REFUNDED") return "bg-red-100 text-red-700"; return "bg-slate-100 text-slate-600"; }
