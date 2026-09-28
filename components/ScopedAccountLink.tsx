"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { isBusinessPortalPath, portalAccountHref } from "@/lib/portal-navigation";
export default function ScopedAccountLink({href,...props}:ComponentProps<typeof Link>) {
  const business=isBusinessPortalPath(usePathname());
  return <Link {...props} scroll={props.scroll ?? (business ? false : undefined)} href={business&&typeof href==="string"?portalAccountHref(href):href}/>;
}
