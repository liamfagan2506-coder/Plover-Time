"use client";

import { useActionState } from "react";
import { login } from "@/actions/auth";
import { Wordmark } from "@/components/Wordmark";
import { FormMessage } from "@/components/FormMessage";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>
        <form action={action} className="card space-y-4">
          <h1 className="h2">Sign in</h1>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <FormMessage state={state} />
          <button className="btn w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="mt-6 text-center text-xs text-muted">Forgotten your password? Ask your manager to reset it.</p>
      </div>
    </main>
  );
}
