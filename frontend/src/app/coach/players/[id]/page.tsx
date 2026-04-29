"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import {
  getToken, removeToken,
  getCoachPlayer, getCoachPlayerVideos,
  type PlayerStats, type VideoHistoryItem,
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

function initials(name: string | null, email: string) {
  const src = name || email;
  return src.slice(0, 2).toUpperCase();
}

export default function CoachPlayerPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [videos, setVideos] = useState<VideoHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) { router.push("/landing"); return; }
    Promise.all([getCoachPlayer(id), getCoachPlayerVideos(id)])
      .then(([s, v]) => { setStats(s); setVideos(v); })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [router, id]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="bv-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 14, color: "#fca5a5" }}>{error || "Aluno não encontrado."}</div>
        <Link href="/coach" className="bv-btn bv-btn-ghost bv-btn-sm">← Voltar ao Coach</Link>
      </div>
    );
  }

  const statCards = [
    { val: String(stats.total_videos), lbl: stats.total_videos === 1 ? "análise" : "análises" },
    { val: stats.avg_rally_count != null ? stats.avg_rally_count.toFixed(1) : "—", lbl: "rallies médios" },
    { val: formatPct(stats.avg_ball_detection_pct), lbl: "deteção de bola" },
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="bv-auth-header">
        <div className="bv-container bv-auth-header-inner">
          <Link href="/" className="bv-nav-logo">
            <div className="bv-nav-logo-dot" />
            BT Vision
          </Link>
          <div className="bv-header-sep" />
          <Link href="/coach" style={{ fontSize: 14, fontFamily: "var(--f-head)", fontWeight: 500, color: "var(--text-dim)" }}>Coach</Link>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--border-2)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          <span style={{ fontSize: 14, fontFamily: "var(--f-head)", fontWeight: 500, color: "var(--text-muted)" }}>
            {stats.player_name || stats.player_email}
          </span>
          <div style={{ flex: 1 }} />
          <Link href="/coach" className="bv-btn bv-btn-ghost bv-btn-sm">← Coach</Link>
          <button className="bv-btn-logout" onClick={() => { removeToken(); router.push("/auth/login"); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            Sair
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: "40px 0 80px" }}>
        <div className="bv-container" style={{ maxWidth: 900 }}>

          {/* PLAYER HEADER */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 32 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--green-bg)", border: "1px solid var(--green-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--f-head)", fontWeight: 700, fontSize: 18, color: "var(--green-l)", flexShrink: 0 }}>
              {initials(stats.player_name, stats.player_email)}
            </div>
            <div>
              <div style={{ fontFamily: "var(--f-head)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                {stats.player_name || stats.player_email}
              </div>
              {stats.player_name && (
                <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 2 }}>{stats.player_email}</div>
              )}
              <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>
                Aluno desde {formatDate(stats.linked_at)}
              </div>
            </div>
          </div>

          {/* STAT CARDS */}
          <div className="bv-grid-3" style={{ gap: 16, marginBottom: 40 }}>
            {statCards.map(s => (
              <div key={s.lbl} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
                <div style={{ fontFamily: "var(--f-head)", fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, color: "var(--text)" }}>{s.val}</div>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>{s.lbl}</div>
              </div>
            ))}
          </div>

          {/* VIDEO LIST */}
          <div style={{ fontFamily: "var(--f-head)", fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 16 }}>
            Análises
            {videos.length > 0 && (
              <span style={{ fontSize: 13, color: "var(--text-dim)", background: "var(--surface-2)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: 100, fontWeight: 500, marginLeft: 10 }}>
                {videos.length}
              </span>
            )}
          </div>

          {videos.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 32px", background: "var(--surface)", border: "1px dashed var(--border-2)", borderRadius: 16 }}>
              <div style={{ fontSize: 14, color: "var(--text-muted)" }}>Este aluno ainda não tem análises concluídas.</div>
            </div>
          ) : (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 90px 90px 80px 80px", gap: 12, padding: "10px 20px", borderBottom: "1px solid var(--border)", fontSize: 12, fontFamily: "var(--f-head)", color: "var(--text-dim)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <span>Vídeo</span>
                <span>Data</span>
                <span style={{ textAlign: "right" }}>Rallies</span>
                <span style={{ textAlign: "right" }}>Bola</span>
                <span style={{ textAlign: "right" }}>Duração</span>
                <span style={{ textAlign: "right" }}>Tipo</span>
              </div>
              {videos.map((item, i) => (
                <Link
                  key={item.id}
                  href={`/videos/${item.id}`}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr 100px 90px 90px 80px 80px",
                    gap: 12, padding: "13px 20px", alignItems: "center",
                    borderBottom: i < videos.length - 1 ? "1px solid var(--border)" : "none",
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
                      : <span className="bv-badge bv-badge-pending" style={{ fontSize: 11 }}>Aluno</span>
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
