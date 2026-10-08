"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ui from "@/components/ui/ui.module.css";
import type { PublicUser, Role } from "@/lib/model";
import {
  createUserAction,
  deleteUserAction,
  resetPasswordAction,
  updateUserAction,
} from "./actions";

type Props = { users: PublicUser[]; currentUserId: string; minPasswordLength: number };

export function UsersView({ users, currentUserId, minPasswordLength }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [created, createAction, creating] = useActionState(createUserAction, {});

  const run = (work: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) =>
    startTransition(async () => {
      const result = await work();
      setStatus(result.ok ? { kind: "ok", text: done } : { kind: "error", text: result.error });
      if (result.ok) router.refresh();
    });

  return (
    <div className={ui.sections}>
      <section className={ui.card} aria-labelledby="users-title">
        <h2 id="users-title" className={ui.sectionHeading}>
          {users.length} user{users.length === 1 ? "" : "s"}
        </h2>
        {status && (
          <p
            role={status.kind === "error" ? "alert" : "status"}
            className={status.kind === "error" ? ui.error : ui.muted}
          >
            {status.text}
          </p>
        )}
        <table className={ui.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>
                <span className={ui.muted}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === currentUserId;
              return (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    {self && <span className={ui.badge}> you</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <label className={ui.visuallyHidden} htmlFor={`role-${u.id}`}>
                      Role for {u.email}
                    </label>
                    <select
                      id={`role-${u.id}`}
                      className={ui.input}
                      value={u.role}
                      disabled={self || pending}
                      onChange={(e) =>
                        run(
                          () => updateUserAction(u.id, { role: e.target.value as Role }),
                          `${u.email} is now ${e.target.value}.`,
                        )
                      }
                    >
                      <option value="admin">Admin</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </td>
                  <td>{u.disabled ? "Disabled" : "Active"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {!self && (
                      <button
                        type="button"
                        className={ui.linkButton}
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => updateUserAction(u.id, { disabled: !u.disabled }),
                            `${u.email} ${u.disabled ? "can sign in again" : "is disabled and signed out"}.`,
                          )
                        }
                      >
                        {u.disabled ? "Enable" : "Disable"}
                      </button>
                    )}{" "}
                    <button
                      type="button"
                      className={ui.linkButton}
                      onClick={() => setResetFor(resetFor === u.id ? null : u.id)}
                    >
                      Reset password
                    </button>{" "}
                    {!self && (
                      <button
                        type="button"
                        className={ui.linkButton}
                        disabled={pending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete ${u.email}? They will be signed out and cannot sign in again.`,
                            )
                          ) {
                            run(() => deleteUserAction(u.id), `${u.email} deleted.`);
                          }
                        }}
                      >
                        Delete
                      </button>
                    )}
                    {resetFor === u.id && (
                      <form
                        className={ui.inlineForm}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const password = String(
                            new FormData(e.currentTarget).get("password") ?? "",
                          );
                          run(
                            () => resetPasswordAction(u.id, password),
                            `New password set for ${u.email}. They have been signed out.`,
                          );
                          setResetFor(null);
                        }}
                      >
                        <label className={ui.visuallyHidden} htmlFor={`pw-${u.id}`}>
                          New password for {u.email}
                        </label>
                        <input
                          id={`pw-${u.id}`}
                          name="password"
                          type="password"
                          autoComplete="new-password"
                          minLength={minPasswordLength}
                          required
                          className={ui.input}
                          placeholder={`At least ${minPasswordLength} characters`}
                        />
                        <button type="submit" className={ui.button} disabled={pending}>
                          Set
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className={ui.card} aria-labelledby="add-user-title">
        <h2 id="add-user-title" className={ui.sectionHeading}>
          Add a user
        </h2>
        <form action={createAction} className={ui.form}>
          <div className={ui.field}>
            <label htmlFor="new-name" className={ui.label}>
              Name
            </label>
            <input id="new-name" name="name" className={ui.input} required maxLength={80} />
          </div>
          <div className={ui.field}>
            <label htmlFor="new-email" className={ui.label}>
              Email
            </label>
            <input id="new-email" name="email" type="email" className={ui.input} required />
          </div>
          <div className={ui.field}>
            <label htmlFor="new-role" className={ui.label}>
              Role
            </label>
            <select id="new-role" name="role" className={ui.input} defaultValue="viewer">
              <option value="viewer">Viewer: browse, preview and download</option>
              <option value="admin">Admin: change everything</option>
            </select>
          </div>
          <div className={ui.field}>
            <label htmlFor="new-password" className={ui.label}>
              Temporary password
            </label>
            <input
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              className={ui.input}
              minLength={minPasswordLength}
              required
            />
            <span className={ui.hint}>
              At least {minPasswordLength} characters. They can change it on their Account page.
            </span>
          </div>
          {created.error && (
            <p role="alert" className={ui.error}>
              {created.error}
            </p>
          )}
          {created.ok && <p role="status">{created.ok}</p>}
          <button type="submit" className={ui.button} disabled={creating}>
            {creating ? "Adding…" : "Add user"}
          </button>
        </form>
      </section>
    </div>
  );
}
