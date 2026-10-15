"use client";
import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
export default function AdminSubmitButton({ children, disabled, pendingLabel = "Saving…", ...props }: ComponentProps<"button"> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return <button {...props} type="submit" disabled={disabled || pending} aria-busy={pending}>{pending ? pendingLabel : children}</button>;
}
