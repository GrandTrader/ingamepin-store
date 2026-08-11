"use client";

import { disableAdminMfa } from "./actions";

export default function DisableMfaButton() {
  return (
    <form
      action={disableAdminMfa}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          "Turn off Google Authenticator verification for Admin login?"
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="rounded-xl border border-red-300 bg-white px-5 py-3 font-black text-red-600 transition hover:bg-red-50"
      >
        Turn off two-step verification
      </button>
    </form>
  );
}
