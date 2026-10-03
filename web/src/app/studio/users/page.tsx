"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiEnabled, changeUserRole, searchUsers, type AdminUser } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Role } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { S } from "@/lib/strings";

const ROLES: Role[] = ["learner", "teacher", "admin", "super_admin"];

export default function UsersPage() {
  return <AppShell><Users /></AppShell>;
}

function Users() {
  const { t } = useI18n();
  const { user, role } = useSession();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<Record<string, Role>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function search() {
    setBusy(true); setError(null); setMessage(null);
    try { setRows(await searchUsers(q)); setSelected({}); }
    catch (e) { setError(e instanceof Error ? e.message : t(S.ask.error)); }
    finally { setBusy(false); }
  }

  async function save(row: AdminUser) {
    setBusy(true); setError(null); setMessage(null);
    try {
      const updated = await changeUserRole(row.id, selected[row.id] ?? row.role);
      setRows((users) => users.map((u) => u.id === updated.id ? { ...u, role: updated.role } : u));
      setMessage(t(S.users.saved));
    } catch (e) { setError(e instanceof Error ? e.message : t(S.ask.error)); }
    finally { setBusy(false); }
  }

  if (role !== "super_admin" || !user) return <p className="card p-6">{t(S.users.restricted)}</p>;
  if (!apiEnabled) return <p className="card p-6">{t(S.users.unavailable)}</p>;

  return <div className="space-y-6">
    <header>
      <Link href="/studio/" className="text-sm text-brand-700">{t(S.nav.instructor)}</Link>
      <h1 className="mt-2 font-serif text-4xl text-ink">{t(S.users.title)}</h1>
      <p className="mt-1 text-ink-soft">{t(S.users.sub)}</p>
    </header>
    <form className="card flex flex-wrap items-end gap-3 p-6" onSubmit={(e) => { e.preventDefault(); void search(); }}>
      <label className="min-w-0 flex-1">{t(S.users.searchLabel)}
        <input type="search" className="input mt-2" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <button className="btn btn-primary" disabled={busy}>{busy ? t(S.common.loading) : t(S.users.search)}</button>
    </form>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{message}</p>}
    <section className="card p-6" aria-busy={busy}>
      <h2 className="font-serif text-2xl">{t(S.users.results)}</h2>
      <ul className="mt-4 divide-y divide-line">{rows.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="min-w-0">
          <p className="font-medium text-ink">{row.display_name ?? row.email ?? row.id}</p>
          <p className="break-all text-sm text-muted" dir="ltr">{row.email}</p>
          {row.id === user.id && <p className="mt-1 text-sm text-muted">{t(S.users.self)}</p>}
        </div>
        <div className="flex items-end gap-3">
          <label className="text-sm">{t(S.users.role)}
            <select className="input mt-1" aria-label={`${t(S.users.role)}: ${row.email ?? row.id}`} value={selected[row.id] ?? row.role}
              disabled={busy || row.id === user.id} onChange={(e) => setSelected({ ...selected, [row.id]: e.target.value as Role })}>
              {ROLES.map((value) => <option key={value} value={value}>{t(S.users.roles[value])}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" disabled={busy || row.id === user.id || (selected[row.id] ?? row.role) === row.role}
            aria-label={`${t(S.users.save)}: ${row.email ?? row.id}`} onClick={() => void save(row)}>{t(S.users.save)}</button>
        </div>
      </li>)}</ul>
      {!rows.length && <p className="mt-3 text-muted">{t(S.users.empty)}</p>}
    </section>
  </div>;
}
