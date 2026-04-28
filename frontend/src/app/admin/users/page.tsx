"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminListUsers, type AdminUser } from "@/lib/api";

const PLANS = ["", "free", "pro", "club"];

function planBadge(plan: string) {
  return <span className={`bv-badge bv-badge-${plan}`} style={{ textTransform: "capitalize" }}>{plan}</span>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [plan, setPlan] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load(p: string) {
    setLoading(true);
    adminListUsers(p || undefined)
      .then(setUsers)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(plan); }, [plan]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "var(--f-head)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Utilizadores</div>
          <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 4 }}>{users.length} encontrados</div>
        </div>
        <select
          value={plan}
          onChange={e => setPlan(e.target.value)}
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", padding: "6px 12px", fontSize: 13, color: "var(--text)", cursor: "pointer" }}
        >
          {PLANS.map(p => <option key={p} value={p}>{p || "Todos os planos"}</option>)}
        </select>
      </div>

      {error && <p style={{ color: "#fca5a5", marginBottom: 16 }}>{error}</p>}

      {loading ? (
        <p style={{ color: "var(--text-dim)" }}>A carregar…</p>
      ) : users.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>Nenhum utilizador encontrado.</p>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                {["Email", "Plano", "Vídeos", "Estado", "Registo", ""].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontFamily: "var(--f-head)", fontWeight: 600, color: "var(--text-dim)", fontSize: 12, letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 500 }}>{u.email}</div>
                    {u.is_admin && <div style={{ fontSize: 11, color: "var(--green-l)", marginTop: 2 }}>admin</div>}
                  </td>
                  <td style={{ padding: "12px 16px" }}>{planBadge(u.plan)}</td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--f-mono)" }}>{u.video_count}</td>
                  <td style={{ padding: "12px 16px" }}>
                    {u.is_suspended
                      ? <span style={{ fontSize: 12, color: "#fca5a5", background: "var(--red-bg)", padding: "2px 8px", borderRadius: 100 }}>Suspensa</span>
                      : <span style={{ fontSize: 12, color: "var(--green-l)" }}>Activa</span>
                    }
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--text-dim)" }}>{formatDate(u.created_at)}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <Link href={`/admin/users/${u.id}`} className="bv-btn bv-btn-ghost bv-btn-sm">Gerir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
