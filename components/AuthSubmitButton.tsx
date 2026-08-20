"use client";

import { useFormStatus } from "react-dom";

type AuthSubmitButtonProps = {
  label: string;
  pendingLabel: string;
  className: string;
  disabled?: boolean;
};

export default function AuthSubmitButton({
  label,
  pendingLabel,
  className,
  disabled = false,
}: AuthSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-disabled={isDisabled}
      className={className}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
