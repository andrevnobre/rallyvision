"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getSharedVideo, getStreamUrl, type VideoResult } from "@/lib/api";
import { BallHeatmap, PlayerHeatmap } from "@/components/Heatmap";
import { CourtReplay } from "@/components/CourtReplay";

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function SharedPage() {
  const { token } = useParams<{ token: string }>();
  const [videoId, setVideoId] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [result, setResult] = useState<VideoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSharedVideo(token)
      .then((v) => {
        setVideoId(v.id);
        setFilename(v.filename);
        setCreatedAt(v.created_at);
        if (v.result) setResult(JSON.parse(v.result));
        else setError("Este relatório ainda não está disponível.");
      })
      .catch(() => setError("Link de partilha inválido ou revogado."));
  }, [token]);

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg)", gap: 16 }}>
        <div style={{ fontFamily: "var(--f-head)", fontSize: 20, fontWeight: 600 }}>Link inválido</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{error}</div>
        <Link href="/" className="bv-btn bv-btn-surface" style={{ marginTop: 8 }}>Ir para BT Vision</Link>
      </div>
    );
  }

  if (!result || !videoId) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="bv-spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <header className="bv-auth-header">
        <div className="bv-container bv-auth-header-inner">
          <Link href="/" className="bv-nav-logo" style={{ fontSize: 16 }}>
            <div className="bv-nav-logo-dot" />
            BT Vision
          </Link>
          <div className="bv-header-sep" />
          <span style={{ fontSize: 14, color: "var(--text-dim)", fontFamily: "var(--f-head)" }}>Relatório partilhado</span>
          <div style={{ flex: 1 }} />
          <Link href="/auth/login" className="bv-btn bv-btn-ghost bv-btn-sm">Criar conta</Link>
        </div>
      </header>

      <main style={{ flex: 1, padding: "0 0 80px" }}>
        <div className="bv-container">
          <div style={{ padding: "32px 0 24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, borderBottom: "1px solid var(--border)", marginBottom: 32 }}>
            <div>
              <div style={{ fontFamily: "var(--f-head)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 }}>{filename}</div>
              <div style={{ fontSize: 14, color: "var(--text-dim)" }}>
                Analisado em {new Date(createdAt).toLocaleDateString("pt-PT")} · {formatDuration(result.duration_s)} de duração
              </div>
            </div>
          </div>

          {/* STAT CARDS — linha 1 */}
          <div className="bv-grid-4" style={{ gap: 16, marginBottom: 16 }}>
            <div className="bv-stat-card">
              <div className="bv-stat-label">Bola detetada</div>
              <div className="bv-stat-value" style={{ color: "var(--green-l)" }}>{result.ball_detection_pct}%</div>
              <div className="bv-stat-sub">conf. média {result.avg_ball_conf}</div>
            </div>
            <div className="bv-stat-card">
              <div className="bv-stat-label">2 Jogadores</div>
              <div className="bv-stat-value">{result.player_2_detection_pct}%</div>
              <div className="bv-stat-sub">conf. média {result.avg_player_conf}</div>
            </div>
            <div className="bv-stat-card">
              <div className="bv-stat-label">Frames utilizáveis</div>
              <div className="bv-stat-value">{result.usable_frames_pct}%</div>
              <div className="bv-stat-sub">bola + 2 jogadores</div>
            </div>
            <div className="bv-stat-card">
              <div className="bv-stat-label">Duração</div>
              <div className="bv-stat-value" style={{ fontSize: 28 }}>{formatDuration(result.duration_s)}</div>
              <div className="bv-stat-sub">{result.total_frames} frames · {Math.round(result.fps)}fps</div>
            </div>
          </div>

          {/* STAT CARDS — linha 2: rallies */}
          {result.rally_count !== undefined && (
            <div className="bv-grid-4" style={{ gap: 16, marginBottom: 32 }}>
              <div className="bv-stat-card">
                <div className="bv-stat-label">Rallies detetados</div>
                <div className="bv-stat-value" style={{ color: "var(--green-l)" }}>{result.rally_count}</div>
                <div className="bv-stat-sub">segmentos com bola contínua</div>
              </div>
              <div className="bv-stat-card">
                <div className="bv-stat-label">Duração média rally</div>
                <div className="bv-stat-value" style={{ fontSize: 28 }}>{result.avg_rally_duration_s}s</div>
                <div className="bv-stat-sub">
                  {result.rallies && result.rallies.length > 0
                    ? `${Math.min(...result.rallies.map(r => r.duration_s))}s – ${Math.max(...result.rallies.map(r => r.duration_s))}s`
                    : "—"}
                </div>
              </div>
            </div>
          )}

          {/* HEATMAPS */}
          <div className="bv-grid-2" style={{ gap: 24, marginBottom: 32 }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontFamily: "var(--f-head)", fontSize: 14, fontWeight: 600 }}>Heatmap — Bola</div>
                <div style={{ display: "flex", gap: 12 }}>
                  {[["#eab308", "Alta densidade"], ["#854d0e", "Baixa"]].map(([c, l]) => (
                    <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--f-head)" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />{l}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: 16 }}>
                <BallHeatmap positions={result.ball_positions} courtRoi={result.court_roi} cameraOrientation={result.camera_orientation} />
              </div>
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontFamily: "var(--f-head)", fontSize: 14, fontWeight: 600 }}>Heatmap — Jogadores</div>
                <div style={{ display: "flex", gap: 12 }}>
                  {[["#3b82f6", "J1"], ["#f97316", "J2"], ["#a855f7", "J3"], ["#22c55e", "J4"]].map(([c, l]) => (
                    <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--f-head)" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />{l}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: 16 }}>
                <PlayerHeatmap positions={result.player_positions} courtRoi={result.court_roi} cameraOrientation={result.camera_orientation} />
              </div>
            </div>
          </div>

          {/* REPLAY */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", marginBottom: 32 }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontFamily: "var(--f-head)", fontSize: 14, fontWeight: 600 }}>Replay interativo</div>
            </div>
            <CourtReplay videoId={videoId} result={result} />
          </div>

          {/* CTA para criar conta */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "var(--radius-lg)", padding: "24px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: "var(--f-head)", fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Analisa os teus próprios vídeos</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Cria uma conta grátis e começa a analisar as tuas partidas.</div>
            </div>
            <Link href="/auth/login" className="bv-btn" style={{ background: "var(--green)", color: "#fff", border: "none", flexShrink: 0 }}>
              Criar conta grátis
            </Link>
          </div>

          <p style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "right", marginTop: 16 }}>
            Processado em {result.processing_time_s}s · {result.resolution}
          </p>
        </div>
      </main>
    </div>
  );
}
