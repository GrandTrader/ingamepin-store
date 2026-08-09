"use client";

import { useId, useState } from "react";

type PasswordInputProps = {
  label: string;
  name: string;
  id?: string;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  wrapperClassName?: string;
  inputClassName?: string;
  dark?: boolean;
};

export default function PasswordInput({
  label,
  name,
  id,
  autoComplete,
  placeholder,
  required = true,
  minLength = 8,
  wrapperClassName = "",
  inputClassName = "",
  dark = false,
}: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? `password-${generatedId}`;
  const [isVisible, setIsVisible] = useState(false);

  const defaultInputClassName = dark
    ? "w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 pr-20 outline-none transition focus:border-cyan-400"
    : "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-20 outline-none transition focus:border-cyan-500";

  return (
    <div className={wrapperClassName}>
      <label htmlFor={inputId} className="block text-sm font-bold">
        {label}
      </label>

      <div className="relative mt-2">
        <input
          id={inputId}
          name={name}
          type={isVisible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          className={inputClassName || defaultInputClassName}
        />

        <button
          type="button"
          onClick={() => setIsVisible((current) => !current)}
          aria-controls={inputId}
          aria-label={isVisible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className={`absolute inset-y-0 right-0 flex items-center px-4 text-xs font-black transition ${
            dark
              ? "text-cyan-300 hover:text-cyan-200"
              : "text-cyan-700 hover:text-cyan-600"
          }`}
        >
          {isVisible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
