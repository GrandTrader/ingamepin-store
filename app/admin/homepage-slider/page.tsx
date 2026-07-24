import { redirect } from "next/navigation";
import AdminHomepageSlider, { type AdminSlide, type SliderProduct } from "@/components/AdminHomepageSlider";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../AdminSidebar";

export const dynamic = "force-dynamic";

export default async function HomepageSliderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");

  const admin = createAdminClient();
  const [settings, slides, products] = await Promise.all([
    admin.from("homepage_slider_settings").select("is_enabled, autoplay_ms").eq("id", true).maybeSingle(),
    admin.from("homepage_slides").select("id, product_id, eyebrow, title, description, desktop_image_url, mobile_image_url, button_text, button_url, starts_at, ends_at, sort_order, is_active").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    admin.from("products").select("id, name, slug, description, image_url").eq("status", "ACTIVE").eq("is_preorder_only", false).order("name", { ascending: true }),
  ]);
  const loadError = settings.error ?? slides.error ?? products.error;
  if (loadError) throw new Error(`Unable to load homepage slider: ${loadError.message}`);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col md:flex-row">
        <AdminSidebar />
        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <h1 className="text-3xl font-black">Homepage Slider</h1>
          <p className="mt-2 text-sm text-slate-500">Manage homepage banners, products, scheduling and links.</p>
          {error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
          {success && <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">{success}</div>}
          <AdminHomepageSlider
            slides={(slides.data ?? []) as AdminSlide[]}
            products={(products.data ?? []) as SliderProduct[]}
            settings={settings.data ?? { is_enabled: true, autoplay_ms: 5000 }}
          />
        </main>
      </div>
    </div>
  );
}
