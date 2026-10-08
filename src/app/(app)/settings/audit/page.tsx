import Link from "next/link";
import { Suspense } from "react";
import { AdminPage } from "@/components/AdminPage";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { readAudit } from "@/lib/audit/log";

const PAGE_SIZE = 50;

export default function AuditPage(props: PageProps<"/settings/audit">) {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who changed what, newest first. Secrets and token values are never recorded."
      />
      <Suspense fallback={<p className={ui.muted}>Loading audit log…</p>}>
        <AdminPage>
          <Log {...props} />
        </AdminPage>
      </Suspense>
    </>
  );
}

const one = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

async function Log({ searchParams }: PageProps<"/settings/audit">) {
  const sp = await searchParams;
  const filters = { actor: one(sp.actor), action: one(sp.action), projectId: one(sp.project) };
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const { entries, total } = await readAudit({ ...filters, page, pageSize: PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (filters.actor) q.set("actor", filters.actor);
    if (filters.action) q.set("action", filters.action);
    if (filters.projectId) q.set("project", filters.projectId);
    if (p > 1) q.set("page", String(p));
    return `/settings/audit${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className={ui.sections}>
      <form method="get" className={ui.inlineForm} role="search" aria-label="Filter the audit log">
        <label className={ui.visuallyHidden} htmlFor="f-actor">
          User email
        </label>
        <input
          id="f-actor"
          name="actor"
          placeholder="User email"
          defaultValue={filters.actor}
          className={ui.input}
        />
        <label className={ui.visuallyHidden} htmlFor="f-action">
          Action
        </label>
        <input
          id="f-action"
          name="action"
          placeholder="Action, e.g. tokens.save"
          defaultValue={filters.action}
          className={ui.input}
        />
        <label className={ui.visuallyHidden} htmlFor="f-project">
          Project id
        </label>
        <input
          id="f-project"
          name="project"
          placeholder="Project id"
          defaultValue={filters.projectId}
          className={ui.input}
        />
        <button type="submit" className={ui.button}>
          Filter
        </button>
        {(filters.actor || filters.action || filters.projectId) && (
          <Link href="/settings/audit">Clear</Link>
        )}
      </form>

      {entries.length === 0 ? (
        <p className={ui.muted}>
          No entries{total === 0 && !filters.actor ? " yet" : " match these filters"}.
        </p>
      ) : (
        <table className={ui.table}>
          <thead>
            <tr>
              <th>When (UTC)</th>
              <th>User</th>
              <th>Action</th>
              <th>Target</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={`${e.ts}-${i}`}>
                <td style={{ whiteSpace: "nowrap" }}>
                  <time dateTime={e.ts}>{e.ts.slice(0, 19).replace("T", " ")}</time>
                </td>
                <td>{e.actor?.email ?? <span className={ui.muted}>anonymous</span>}</td>
                <td>
                  <code className={ui.code}>{e.action}</code>
                </td>
                <td>
                  {e.target ? (
                    e.target.type === "project" && e.target.id ? (
                      <Link href={`/projects/${e.target.id}`}>{e.target.name ?? e.target.id}</Link>
                    ) : (
                      `${e.target.type} ${e.target.name ?? e.target.id ?? ""}`
                    )
                  ) : (
                    "—"
                  )}
                </td>
                <td>{e.details ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <nav aria-label="Audit log pages" className={ui.inlineForm}>
        <span className={ui.muted}>
          Page {Math.min(page, pages)} of {pages} · {total} entries
        </span>
        {page > 1 && <Link href={href(page - 1)}>Newer</Link>}
        {page < pages && <Link href={href(page + 1)}>Older</Link>}
      </nav>
    </div>
  );
}
