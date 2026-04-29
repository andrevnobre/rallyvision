"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getToken, removeToken, getMe,
  listCoachPlayers, addCoachPlayer, removeCoachPlayer,
  type CoachPlayerItem,
} from "@/lib/api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

function initials(name: string | null, email: string) {
  const src = name || email;
  return src.slice(0, 2).toUpperCase();
}

export default function CoachPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<CoachPlayerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [planOk, setPlanOk] = useState(true);

  const [addEmail, setAddEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) { router.push("/landing"); return; }
    getMe().then(u => {
      if (u.plan !== "pro" && u.plan !== "club") { setPlanOk(false); setLoading(false); return; }
      listCoachPlayers().then(setPlayers).catch(() => {}).finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, [router]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addEmail.trim()) return;
    setAdding(true);
    setAddErr(null);
    try {
      const p = await addCoachPlayer(addEmail.trim());
      setPlayers(prev => [p, ...prev]);
      setAddEmail("");
    } catch (e) {
      setAddErr(String(e).replace(/^Error: /, ""));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(playerId: string) {
    setRemoving(playerId);
    try {
      await removeCoachPlayer(playerId);
      setPlayers(prev => prev.filter(p => p.player_id !== playerId));
    } catch {
      // silently ignore
    } finally {
      setRemoving(null);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="bv-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="bv-auth-header">
        <div className="bv-container bv-auth-header-inner">
          <Link href="/" className="bv-nav-logo">
            <div className="bv-nav-logo-dot" />
            BT Vision
          </Link>
          <div className="bv-header-sep" />
          <span style={{ fontSize: 14, fontFamily: "var(--f-head)", fontWeight: 500, color: "var(--text-muted)" }}>Coach</span>
          <div style={{ flex: 1 }} />
          <Link href="/" className="bv-btn bv-btn-ghost bv-btn-sm">← Dashboard</Link>
          <button className="bv-btn-logout" onClick={() => { removeToken(); router.push("/auth/login"); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            Sair
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: "40px 0 80px" }}>
        <div className="bv-container" style={{ maxWidth: 900 }}>

          <div style={{ marginBottom: 32, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: "var(--f-head)", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 }}>Dashboard de Coach</div>
              <div style={{ fontSize: 14, color: "var(--text-dim)" }}>Gere os teus alunos e acompanha a sua evolução.</div>
            </div>
            {players.length > 0 && (
              <span style={{ fontSize: 13, color: "var(--text-dim)", background: "var(--surface-2)", border: "1px solid var(--border)", padding: "4px 12px", borderRadius: 100, fontFamily: "var(--f-head)", fontWeight: 500, alignSelf: "center" }}>
                {players.length} {players.length === 1 ? "aluno" : "alunos"}
              </span>
            )}
          </div>

          {!planOk ? (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "48px 32px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--f-head)", fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Disponível nos planos Pro e Club</div>
              <div style={{ fontSize: 14, color: "var(--text-dim)" }}>Faz upgrade para aceder ao dashboard de coach.</div>
            </div>
          ) : (
            <>
              {/* ADD PLAYER */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 24px", marginBottom: 32 }}>
                <div style={{ fontFamily: "var(--f-head)", fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Adicionar aluno</div>
                <form onSubmit={handleAdd} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input
                    className="bv-form-input"
                    type="email"
                    placeholder="email@exemplo.com"
                    value={addEmail}
                    onChange={e => { setAddEmail(e.target.value); setAddErr(null); }}
                    style={{ flex: 1, minWidth: 220 }}
                  />
                  <button type="submit" className="bv-btn bv-btn-green" disabled={adding || !addEmail.trim()}>
                    {adding ? "A adicionar…" : "Adicionar"}
                  </button>
                </form>
                {addErr && <p style={{ fontSize: 13, color: "#fca5a5", marginTop: 8 }}>{addErr}</p>}
              </div>

              {/* PLAYER LIST */}
              {players.length === 0 ? (
                <div style={{ textAlign: "center", padding: "80px 32px", background: "var(--surface)", border: "1px dashed var(--border-2)", borderRadius: 16 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, background: "var(--surface-2)", border: "1px solid var(--border-2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div style={{ fontFamily: "var(--f-head)", fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Sem alunos ainda</div>
                  <div style={{ fontSize: 14, color: "var(--text-muted)", fontWeight: 300 }}>Adiciona o primeiro aluno pelo email acima.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {players.map(p => (
                    <div
                      key={p.player_id}
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}
                    >
                      {/* Avatar */}
                      <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--green-bg)", border: "1px solid var(--green-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--f-head)", fontWeight: 700, fontSize: 14, color: "var(--green-l)", flexShrink: 0 }}>
                        {initials(p.player_name, p.player_email)}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "var(--f-head)", fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em", marginBottom: 2 }}>
                          {p.player_name || p.player_email}
                        </div>
                        {p.player_name && (
                          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>{p.player_email}</div>
                        )}
                        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
                          Adicionado em {formatDate(p.linked_at)}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontFamily: "var(--f-head)", fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>{p.video_count}</div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{p.video_count === 1 ? "análise" : "análises"}</div>
                        </div>
                        <Link href={`/coach/players/${p.player_id}`} className="bv-btn bv-btn-surface bv-btn-sm">
                          Ver detalhes
                        </Link>
                        <button
                          className="bv-btn bv-btn-ghost bv-btn-sm"
                          style={{ color: "#fca5a5", borderColor: "#7f1d1d" }}
                          onClick={() => handleRemove(p.player_id)}
                          disabled={removing === p.player_id}
                        >
                          {removing === p.player_id ? "…" : "Remover"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
