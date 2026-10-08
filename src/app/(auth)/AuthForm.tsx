"use client";

import { useActionState } from "react";
import ui from "@/components/ui/ui.module.css";
import type { AuthFormState } from "./actions";

type Field = { name: string; label: string; type: string; autoComplete: string; hint?: string };
type Props = {
  action: (prev: AuthFormState, data: FormData) => Promise<AuthFormState>;
  fields: Field[];
  submit: string;
  hidden?: Record<string, string>;
};

/** Shared form for sign-in and first-time setup. */
export function AuthForm({ action, fields, submit, hidden = {} }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={ui.form}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {fields.map((f) => (
        <div key={f.name} className={ui.field}>
          <label htmlFor={f.name} className={ui.label}>
            {f.label}
          </label>
          <input
            id={f.name}
            name={f.name}
            type={f.type}
            autoComplete={f.autoComplete}
            className={ui.input}
            defaultValue={f.name === "email" ? state.email : undefined}
            required
            aria-describedby={f.hint ? `${f.name}-hint` : undefined}
          />
          {f.hint && (
            <span id={`${f.name}-hint`} className={ui.hint}>
              {f.hint}
            </span>
          )}
        </div>
      ))}
      {state.error && (
        <p role="alert" className={ui.error}>
          {state.error}
        </p>
      )}
      <button type="submit" className={ui.button} disabled={pending}>
        {pending ? "Please wait…" : submit}
      </button>
    </form>
  );
}
