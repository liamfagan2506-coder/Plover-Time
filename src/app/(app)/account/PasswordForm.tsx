"use client";

import { useActionState } from "react";
import { changePassword } from "@/actions/auth";
import { FormMessage } from "@/components/FormMessage";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="card space-y-4">
      <h2 className="h2">Change password</h2>
      <div>
        <label className="label">Current password</label>
        <input type="password" name="current" className="input" autoComplete="current-password" required />
      </div>
      <div>
        <label className="label">New password (at least 10 characters)</label>
        <input type="password" name="next" className="input" autoComplete="new-password" minLength={10} required />
      </div>
      <FormMessage state={state} />
      <button className="btn" disabled={pending}>Update password</button>
    </form>
  );
}
