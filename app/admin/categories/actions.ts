"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function createSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function redirectWithError(message: string): never {
  redirect(
    `/admin/categories?error=${encodeURIComponent(message)}`,
  );
}

function isValidWebUrl(value: string) {
  if (!value) {
    return true;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" ||
      url.protocol === "http:"
    );
  } catch {
    return false;
  }
}

export async function createCategory(
  formData: FormData,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const adminResult = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminResult.data) {
    redirect("/admin/login?error=Access denied");
  }

  const name = String(
    formData.get("name") ?? "",
  ).trim();

  const description = String(
    formData.get("description") ?? "",
  ).trim();

  const imageUrl = String(
    formData.get("image_url") ?? "",
  ).trim();

  const sortOrder = Number(
    formData.get("sort_order"),
  );

  const isActive =
    formData.get("is_active") === "on";

  const slug = createSlug(name);

  if (
    name.length < 2 ||
    name.length > 100
  ) {
    redirectWithError(
      "Category name must contain between 2 and 100 characters.",
    );
  }

  if (!slug) {
    redirectWithError(
      "Unable to create a valid category slug.",
    );
  }

  if (description.length > 1000) {
    redirectWithError(
      "Category description is too long.",
    );
  }

  if (!isValidWebUrl(imageUrl)) {
    redirectWithError(
      "Enter a valid HTTP or HTTPS image URL.",
    );
  }

  if (
    !Number.isInteger(sortOrder) ||
    sortOrder < 0
  ) {
    redirectWithError(
      "Enter a valid sort order.",
    );
  }

  const insertResult = await supabase
    .from("categories")
    .insert({
      name,
      slug,
      description:
        description || null,
      image_url: imageUrl || null,
      is_active: isActive,
      sort_order: sortOrder,
    });

  if (insertResult.error) {
    if (
      insertResult.error.code === "23505"
    ) {
      redirectWithError(
        "A category with this name already exists.",
      );
    }

    redirectWithError(
      `Unable to create category: ${insertResult.error.message}`,
    );
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products/new");

  redirect(
    "/admin/categories?success=Category created successfully",
  );
}