"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { adminGetUser, adminPatchUser, type AdminUserDetail } from "@/lib/api";

const PLANS = ["free", "pro", "club"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    adminGetUser(id).then(setUser).catch(e => setError(String(e)));
  }, [id]);

  async function changePlan(plan: string) {
    if (!user) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      const updated = await adminPatchUser(id, { plan });
      setUser(u => u ? { ...u, plan: updated.plan } : u);
      setSuccess(`Plano actualizado para ${plan}.`);
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  async function toggleSuspend() {
    if (!user) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      const updated = await adminPatchUser(id, { is_suspended: !user.is_suspended });
      setUser(u => u ? { ...u, is_suspended: updated.is_suspended } : u);
      setSuccess(updated.is_suspended ? "Conta suspensa." : "Conta reactivada.");
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  if (error && !user) return <p style={{ color: "#fca5a5" }}>{error}</p>;
  if (!user) return <p style={{ color: "var(--text-dim)" }}>A carregar…</p>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 13, padding: 0 }}>← Voltar</button>
        <div style={{ fontFamily: "var(--f-head)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{user.email}</div>
        {user.is_admin && <span style={{ fontSize: 11, color: "var(--green-l)", background: "var(--green-bg)", padding: "2px 8px", borderRadius: 100 }}>admin</span>}
        {user.is_suspended && <span style={{ fontSize: 11, color: "#fca5a5", background: "var(--red-bg)", padding: "2px 8px", borderRadius: 100 }}>suspensa</span>}
      </div>

      {error && <p style={{ color: "#fca5a5", marginBottom: 12 }}>{error}</p>}
      {success && <p style={{ color: "var(--green-l)", marginBottom: 12 }}>{success}</p>}

      {/* Acções */}
      <div style={{ display: "flex", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 24px", minWidth: 220 }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>Plano actual</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              defaultValue={user.plan}
              disabled={saving}
              onChange={e => changePlan(e.target.value)}
              style={{ background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", padding: "6px 12px", fontSize: 13, color: "var(--text)", cursor: "pointer" }}
            >
              {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 24px", minWidth: 220 }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>Estado da conta</div>
          <button
            onClick={toggleSuspend}
            disabled={saving}
            className={`bv-btn bv-btn-sm ${user.is_suspended ? "bv-btn-green" : "bv-btn-ghost"}`}
            style={{ borderColor: user.is_suspended ? undefined : "#7f1d1d", color: user.is_suspended ? undefined : "#fca5a5" }}
          >
            {saving ? "A guardar…" : user.is_suspended ? "Reactivar conta" : "Suspender conta"}
          </button>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 24px" }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>Registado em</div>
          <div style={{ fontSize: 14 }}>{formatDate(user.created_at)}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>{user.video_count} vídeos</div>
        </div>
      </div>

      {/* Vídeos recentes */}
      <div style={{ fontFamily: "var(--f-head)", fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Vídeos recentes</div>
      {user.videos.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>Sem vídeos.</p>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                {["Ficheiro", "Estado", "Erro", "Data"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontFamily: "var(--f-head)", fontWeight: 600, color: "var(--text-dim)", fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {user.videos.map((v, i) => (
                <tr key={v.id} style={{ borderBottom: i < user.videos.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <Link href={`/admin/videos`} style={{ color: "var(--text)", textDecoration: "underline", textUnderlineOffset: 3 }}>{v.filename}</Link>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>{v.status}</span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#fca5a5", maxWidth: 280 }}>
                    {v.error ? <span style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}>{v.error.slice(0, 120)}{v.error.length > 120 ? "…" : ""}</span> : "—"}
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--text-dim)" }}>{formatDate(v.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
