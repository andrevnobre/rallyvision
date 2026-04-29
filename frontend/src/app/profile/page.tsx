"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getToken, removeToken,
  getProfile, updateProfile, getProfileHistory,
  type ProfileData, type VideoHistoryItem,
} from "@/lib/api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

function formatPct(v: number | null) {
  return v != null ? `${v.toFixed(1)}%` : "—";
}

function formatDuration(s: number | null) {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [history, setHistory] = useState<VideoHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // edit name
  const [nameVal, setNameVal] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // change password
  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!getToken()) { router.push("/landing"); return; }
    Promise.all([getProfile(), getProfileHistory()])
      .then(([p, h]) => { setProfile(p); setNameVal(p.name ?? ""); setHistory(h); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  async function saveName() {
    setNameSaving(true);
    setNameMsg(null);
    try {
      const p = await updateProfile({ name: nameVal.trim() || null });
      setProfile(p);
      setNameMsg({ ok: true, text: "Nome guardado." });
    } catch (e) {
      setNameMsg({ ok: false, text: String(e) });
    } finally {
      setNameSaving(false);
    }
  }

  async function changePassword() {
    if (!curPwd || !newPwd) { setPwdMsg({ ok: false, text: "Preenche os dois campos." }); return; }
    setPwdSaving(true);
    setPwdMsg(null);
    try {
      await updateProfile({ current_password: curPwd, new_password: newPwd });
      setCurPwd(""); setNewPwd("");
      setPwdMsg({ ok: true, text: "Password alterada com sucesso." });
    } catch (e) {
      setPwdMsg({ ok: false, text: String(e) });
    } finally {
      setPwdSaving(false);
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
          <span style={{ fontSize: 14, fontFamily: "var(--f-head)", fontWeight: 500, color: "var(--text-muted)" }}>Perfil</span>
          <div style={{ flex: 1 }} />
          <Link href="/" className="bv-btn bv-btn-ghost bv-btn-sm">← Dashboard</Link>
          <button className="bv-btn-logout" onClick={() => { removeToken(); router.push("/auth/login"); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            Sair
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: "40px 0 80px" }}>
        <div className="bv-container" style={{ maxWidth: 800 }}>

          <div style={{ marginBottom: 32 }}>
            <div style={{ fontFamily: "var(--f-head)", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 }}>O meu perfil</div>
            <div style={{ fontSize: 14, color: "var(--text-dim)" }}>{profile?.email} · plano <strong style={{ color: "var(--green-l)" }}>{profile?.plan}</strong></div>
          </div>

          {/* NAME + PASSWORD */}
          <div className="bv-grid-2" style={{ gap: 20, marginBottom: 40, alignItems: "start" }}>

            {/* Name card */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "24px" }}>
              <div style={{ fontFamily: "var(--f-head)", fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Nome de apresentação</div>
              <div className="bv-form-group" style={{ marginBottom: 12 }}>
                <label className="bv-form-label">Nome</label>
                <input
                  className="bv-form-input"
                  placeholder="O teu nome"
                  value={nameVal}
                  onChange={e => setNameVal(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveName()}
                />
              </div>
              {nameMsg && (
                <p style={{ fontSize: 13, marginBottom: 10, color: nameMsg.ok ? "var(--green-l)" : "#fca5a5" }}>{nameMsg.text}</p>
              )}
              <button className="bv-btn bv-btn-green bv-btn-sm" onClick={saveName} disabled={nameSaving}>
                {nameSaving ? "A guardar…" : "Guardar nome"}
              </button>
            </div>

            {/* Password card */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "24px" }}>
              <div style={{ fontFamily: "var(--f-head)", fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Alterar password</div>
              <div className="bv-form-group" style={{ marginBottom: 10 }}>
                <label className="bv-form-label">Password atual</label>
                <input className="bv-form-input" type="password" placeholder="••••••••" value={curPwd} onChange={e => setCurPwd(e.target.value)} />
              </div>
              <div className="bv-form-group" style={{ marginBottom: 12 }}>
                <label className="bv-form-label">Nova password</label>
                <input className="bv-form-input" type="password" placeholder="••••••••" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
              </div>
              {pwdMsg && (
                <p style={{ fontSize: 13, marginBottom: 10, color: pwdMsg.ok ? "var(--green-l)" : "#fca5a5" }}>{pwdMsg.text}</p>
              )}
              <button className="bv-btn bv-btn-ghost bv-btn-sm" onClick={changePassword} disabled={pwdSaving}>
                {pwdSaving ? "A alterar…" : "Alterar password"}
              </button>
            </div>
          </div>

          {/* HISTORY */}
          <div style={{ fontFamily: "var(--f-head)", fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 16 }}>
            Histórico de análises
            {history.length > 0 && (
              <span style={{ fontSize: 13, color: "var(--text-dim)", background: "var(--surface-2)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: 100, fontWeight: 500, marginLeft: 10 }}>
                {history.length} {history.length === 1 ? "análise" : "análises"}
              </span>
            )}
          </div>

          {history.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 32px", background: "var(--surface)", border: "1px dashed var(--border-2)", borderRadius: 16 }}>
              <div style={{ fontSize: 14, color: "var(--text-muted)" }}>Nenhum vídeo analisado ainda.</div>
            </div>
          ) : (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 90px 90px 80px 80px", gap: 12, padding: "10px 20px", borderBottom: "1px solid var(--border)", fontSize: 12, fontFamily: "var(--f-head)", color: "var(--text-dim)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <span>Vídeo</span>
                <span>Data</span>
                <span style={{ textAlign: "right" }}>Rallies</span>
                <span style={{ textAlign: "right" }}>Bola</span>
                <span style={{ textAlign: "right" }}>Duração</span>
                <span style={{ textAlign: "right" }}>Tipo</span>
              </div>
              {history.map((item, i) => (
                <Link
                  key={item.id}
                  href={`/videos/${item.id}`}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr 100px 90px 90px 80px 80px",
                    gap: 12, padding: "13px 20px", alignItems: "center",
                    borderBottom: i < history.length - 1 ? "1px solid var(--border)" : "none",
                    transition: "background 0.12s", fontSize: 14,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontFamily: "var(--f-head)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 13 }}>
                    {item.filename}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{formatDate(item.created_at)}</span>
                  <span style={{ textAlign: "right", fontFamily: "var(--f-mono)", fontSize: 13 }}>{item.rally_count ?? "—"}</span>
                  <span style={{ textAlign: "right", fontFamily: "var(--f-mono)", fontSize: 13, color: item.ball_detection_pct != null && item.ball_detection_pct >= 60 ? "var(--green-l)" : "var(--text-muted)" }}>
                    {formatPct(item.ball_detection_pct)}
                  </span>
                  <span style={{ textAlign: "right", fontSize: 12, color: "var(--text-dim)" }}>{formatDuration(item.duration_s)}</span>
                  <span style={{ textAlign: "right" }}>
                    {item.is_participant
                      ? <span className="bv-badge" style={{ background: "var(--blue-bg)", color: "#93c5fd", border: "1px solid #1e3a8a", fontSize: 11 }}>Coach</span>
                      : <span className="bv-badge bv-badge-pending" style={{ fontSize: 11 }}>Meu</span>
                    }
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
