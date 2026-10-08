"use client";

import { useActionState } from "react";
import ui from "@/components/ui/ui.module.css";
import { changeOwnPasswordAction } from "./actions";

export function PasswordForm({ minLength }: { minLength: number }) {
  const [state, action, pending] = useActionState(changeOwnPasswordAction, {});
  return (
    <section className={ui.card} aria-labelledby="pw-title">
      <h2 id="pw-title" className={ui.sectionHeading}>
        Change password
      </h2>
      <form action={action} className={ui.form}>
        {(
          [
            ["current", "Current password", "current-password"],
            ["password", "New password", "new-password"],
            ["confirm", "Repeat new password", "new-password"],
          ] as const
        ).map(([name, label, autoComplete]) => (
          <div key={name} className={ui.field}>
            <label htmlFor={`pw-${name}`} className={ui.label}>
              {label}
            </label>
            <input
              id={`pw-${name}`}
              name={name}
              type="password"
              autoComplete={autoComplete}
              className={ui.input}
              minLength={name === "current" ? undefined : minLength}
              required
            />
          </div>
        ))}
        <span className={ui.hint}>
          At least {minLength} characters. Other browsers are signed out.
        </span>
        {state.error && (
          <p role="alert" className={ui.error}>
            {state.error}
          </p>
        )}
        {state.ok && <p role="status">{state.ok}</p>}
        <button type="submit" className={ui.button} disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </button>
      </form>
    </section>
  );
}
