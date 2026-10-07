"use client";

import { useActionState, useState } from "react";
import ui from "@/components/ui/ui.module.css";
import { createProjectAction, type FormState } from "../actions";

export function NewProjectForm() {
  const [state, formAction, pending] = useActionState(createProjectAction, {} as FormState);
  const values = state.values ?? {};
  const [prefix, setPrefix] = useState(values.prefix ?? "");
  const shownPrefix = prefix || "prefix";

  return (
    <form action={formAction} className={ui.form} noValidate>
      <Field name="name" label="Project name" state={state}>
        <input
          id="name"
          name="name"
          className={ui.input}
          defaultValue={values.name}
          required
          maxLength={80}
          {...errorProps("name", state)}
        />
      </Field>

      <Field
        name="brandName"
        label="Brand name"
        state={state}
        hint="Shown in file headers, the README, the style guide and the zip name."
      >
        <input
          id="brandName"
          name="brandName"
          className={ui.input}
          defaultValue={values.brandName}
          required
          maxLength={80}
          {...errorProps("brandName", state)}
        />
      </Field>

      <Field
        name="prefix"
        label="CSS prefix"
        state={state}
        hint={
          <>
            2–10 lowercase letters or digits, starting with a letter. Classes become{" "}
            <code className={ui.code}>.{shownPrefix}-btn--primary</code> and variables{" "}
            <code className={ui.code}>--{shownPrefix}-color-primary</code>.
          </>
        }
      >
        <input
          id="prefix"
          name="prefix"
          className={`${ui.input} ${ui.code}`}
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.toLowerCase())}
          required
          maxLength={10}
          pattern="[a-z][a-z0-9]{1,9}"
          autoComplete="off"
          spellCheck={false}
          {...errorProps("prefix", state)}
        />
      </Field>

      <fieldset className={ui.field} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={ui.label}>Responsive approach</legend>
        <div className={ui.radioRow}>
          {(["mobile-first", "desktop-first"] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="approach"
                value={value}
                defaultChecked={(values.approach ?? "mobile-first") === value}
              />{" "}
              {value === "mobile-first" ? "Mobile-first (min-width)" : "Desktop-first (max-width)"}
            </label>
          ))}
        </div>
        <Errors name="approach" state={state} />
      </fieldset>

      <Field name="description" label="Description (optional)" state={state}>
        <textarea
          id="description"
          name="description"
          className={ui.input}
          defaultValue={values.description}
          rows={3}
          maxLength={500}
        />
      </Field>

      <button type="submit" className={ui.button} disabled={pending}>
        {pending ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}

type FieldName = keyof NonNullable<FormState["errors"]>;

function errorProps(name: FieldName, state: FormState) {
  const invalid = Boolean(state.errors?.[name]?.length);
  return {
    "aria-invalid": invalid || undefined,
    "aria-describedby": `${name}-hint ${invalid ? `${name}-error` : ""}`.trim(),
  };
}

function Field({
  name,
  label,
  hint,
  state,
  children,
}: {
  name: FieldName;
  label: string;
  hint?: React.ReactNode;
  state: FormState;
  children: React.ReactNode;
}) {
  return (
    <div className={ui.field}>
      <label htmlFor={name} className={ui.label}>
        {label}
      </label>
      {children}
      {hint && (
        <span id={`${name}-hint`} className={ui.hint}>
          {hint}
        </span>
      )}
      <Errors name={name} state={state} />
    </div>
  );
}

function Errors({ name, state }: { name: FieldName; state: FormState }) {
  const messages = state.errors?.[name];
  if (!messages?.length) return null;
  return (
    <p id={`${name}-error`} className={ui.error} role="alert">
      {messages.join(" ")}
    </p>
  );
}
