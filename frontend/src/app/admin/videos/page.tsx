"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminListVideos, adminRetryVideo, adminDeleteVideo, type AdminVideo } from "@/lib/api";

const STATUSES = ["", "pending_roi", "pending", "processing", "done", "failed"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminVideos() {
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load(s: string) {
    setLoading(true);
    adminListVideos(s || undefined)
      .then(setVideos)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(status); }, [status]);

  async function retry(id: string) {
    setBusy(id); setActionError(null);
    try {
      await adminRetryVideo(id);
      setVideos(vs => vs.map(v => v.id === id ? { ...v, status: "pending", error: null } : v));
    } catch (e) { setActionError(String(e)); }
    finally { setBusy(null); }
  }

  async function del(id: string, filename: string) {
    if (!confirm(`Eliminar "${filename}" permanentemente?`)) return;
    setBusy(id); setActionError(null);
    try {
      await adminDeleteVideo(id);
      setVideos(vs => vs.filter(v => v.id !== id));
    } catch (e) { setActionError(String(e)); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "var(--f-head)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Vídeos</div>
          <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 4 }}>{videos.length} encontrados</div>
        </div>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", padding: "6px 12px", fontSize: 13, color: "var(--text)", cursor: "pointer" }}
        >
          {STATUSES.map(s => <option key={s} value={s}>{s || "Todos os estados"}</option>)}
        </select>
      </div>

      {error && <p style={{ color: "#fca5a5", marginBottom: 12 }}>{error}</p>}
      {actionError && <p style={{ color: "#fca5a5", marginBottom: 12 }}>{actionError}</p>}

      {loading ? (
        <p style={{ color: "var(--text-dim)" }}>A carregar…</p>
      ) : videos.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>Nenhum vídeo encontrado.</p>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                {["Ficheiro", "Utilizador", "Estado", "Erro", "Data", "Acções"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontFamily: "var(--f-head)", fontWeight: 600, color: "var(--text-dim)", fontSize: 12, letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {videos.map((v, i) => (
                <tr key={v.id} style={{ borderBottom: i < videos.length - 1 ? "1px solid var(--border)" : "none", opacity: busy === v.id ? 0.5 : 1, transition: "opacity 0.15s" }}>
                  <td style={{ padding: "12px 16px", maxWidth: 220 }}>
                    <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.filename}</div>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{v.id.slice(0, 8)}</div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {v.user_id
                      ? <Link href={`/admin/users/${v.user_id}`} style={{ color: "var(--text)", textDecoration: "underline", textUnderlineOffset: 3 }}>{v.user_email ?? v.user_id.slice(0, 8)}</Link>
                      : <span style={{ color: "var(--text-muted)" }}>—</span>
                    }
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: v.status === "failed" ? "#fca5a5" : v.status === "done" ? "var(--green-l)" : "var(--text-dim)" }}>
                      {v.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", maxWidth: 260 }}>
                    {v.error
                      ? <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "#fca5a5" }}>{v.error.slice(0, 80)}{v.error.length > 80 ? "…" : ""}</span>
                      : <span style={{ color: "var(--text-muted)" }}>—</span>
                    }
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--text-dim)", whiteSpace: "nowrap" }}>{formatDate(v.created_at)}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {v.status === "failed" && (
                        <button
                          onClick={() => retry(v.id)}
                          disabled={busy === v.id}
                          className="bv-btn bv-btn-ghost bv-btn-sm"
                        >
                          Retry
                        </button>
                      )}
                      <button
                        onClick={() => del(v.id, v.filename)}
                        disabled={busy === v.id}
                        className="bv-btn bv-btn-ghost bv-btn-sm"
                        style={{ color: "#fca5a5", borderColor: "#7f1d1d" }}
                      >
                        Eliminar
                      </button>
                    </div>
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
