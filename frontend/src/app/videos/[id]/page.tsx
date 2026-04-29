"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getVideo, getVideoProgress, getThumbnailUrl, processVideo, createShareLink, revokeShareLink, removeToken, listVideoParticipants, addVideoParticipants, removeVideoParticipant, listCoachPlayers, type VideoStatus, type VideoResult, type ParticipantItem, type CoachPlayerItem } from "@/lib/api";
import { exportToPdf } from "@/lib/export-pdf";
import { BallHeatmap, PlayerHeatmap } from "@/components/Heatmap";
import { CourtROISelector, type ROIResult } from "@/components/CourtROISelector";
import { CourtReplay } from "@/components/CourtReplay";
import { AnnotationPanel } from "@/components/AnnotationPanel";

const STATUS_CFG: Record<VideoStatus["status"], { label: string; cls: string }> = {
  pending_roi:  { label: "Aguarda ROI",  cls: "bv-badge bv-badge-roi" },
  pending:      { label: "Na fila",      cls: "bv-badge bv-badge-pending" },
  processing:   { label: "A processar", cls: "bv-badge bv-badge-processing" },
  done:         { label: "Concluído",   cls: "bv-badge bv-badge-done" },
  failed:       { label: "Falhou",      cls: "bv-badge bv-badge-failed" },
};

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function VideoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [video, setVideo] = useState<VideoStatus | null>(null);
  const [result, setResult] = useState<VideoResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [processingPct, setProcessingPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [participants, setParticipants] = useState<ParticipantItem[]>([]);
  const [participantEmail, setParticipantEmail] = useState("");
  const [participantAdding, setParticipantAdding] = useState(false);
  const [participantErr, setParticipantErr] = useState<string | null>(null);
  const [coachPlayers, setCoachPlayers] = useState<CoachPlayerItem[]>([]);
  const [quickAdding, setQuickAdding] = useState<string | null>(null);
  const [replayTimeS, setReplayTimeS] = useState<number | undefined>(undefined);

  function logout() { removeToken(); router.push("/auth/login"); }

  async function handleExportPdf() {
    if (!video || !result) return;
    setPdfLoading(true);
    try {
      await exportToPdf(video.filename, video.created_at, result);
    } finally {
      setPdfLoading(false);
    }
  }

  useEffect(() => {
    let statusTimer: ReturnType<typeof setTimeout>;
    let progressTimer: ReturnType<typeof setInterval>;

    async function pollStatus() {
      const v = await getVideo(id);
      setVideo(v);
      if (v.status === "done" && v.result) {
        clearInterval(progressTimer);
        setProcessingPct(100);
        setResult(JSON.parse(v.result));
      } else if (v.status === "pending" || v.status === "processing") {
        statusTimer = setTimeout(pollStatus, 4000);
      } else {
        clearInterval(progressTimer);
      }
    }

    async function pollProgress() {
      try {
        const { progress } = await getVideoProgress(id);
        setProcessingPct(progress);
      } catch {
        // silencia erros de progresso
      }
    }

    listVideoParticipants(id).then(setParticipants).catch(() => {});
    listCoachPlayers().then(setCoachPlayers).catch(() => {});
    pollStatus();
    progressTimer = setInterval(pollProgress, 2000);

    return () => {
      clearTimeout(statusTimer);
      clearInterval(progressTimer);
    };
  }, [id]);

  async function handleROIConfirm({ points, orientation, netPoints }: ROIResult) {
    setSubmitting(true);
    setError(null);
    try {
      await processVideo(id, points, orientation, netPoints);
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
      return;
    }

    // Atualizar estado imediatamente após submit bem-sucedido
    setVideo(v => v ? { ...v, status: "pending" } : v);

    const progressInterval = setInterval(async () => {
      try {
        const { progress } = await getVideoProgress(id);
        setProcessingPct(progress);
      } catch { /* silencia */ }
    }, 2000);

    const statusInterval = setInterval(async () => {
      try {
        const updated = await getVideo(id);
        setVideo(updated);
        if (updated.status === "done" && updated.result) {
          setResult(JSON.parse(updated.result));
          clearInterval(statusInterval);
          clearInterval(progressInterval);
        } else if (updated.status === "failed") {
          clearInterval(statusInterval);
          clearInterval(progressInterval);
        }
      } catch { /* silencia erros de rede no polling */ }
    }, 4000);
  }

  async function handleAddParticipant(e: React.FormEvent) {
    e.preventDefault();
    const email = participantEmail.trim();
    if (!email) return;
    setParticipantAdding(true);
    setParticipantErr(null);
    try {
      const added = await addVideoParticipants(id, [email]);
      if (added.length === 0) {
        setParticipantErr("Email não encontrado ou já adicionado.");
      } else {
        setParticipants(prev => [...prev, ...added]);
        setParticipantEmail("");
      }
    } catch (e) {
      setParticipantErr(String(e).replace(/^Error: /, ""));
    } finally {
      setParticipantAdding(false);
    }
  }

  async function handleQuickAdd(player: CoachPlayerItem) {
    setQuickAdding(player.player_id);
    setParticipantErr(null);
    try {
      const added = await addVideoParticipants(id, [player.player_email]);
      if (added.length > 0) setParticipants(prev => [...prev, ...added]);
    } catch (e) {
      setParticipantErr(String(e).replace(/^Error: /, ""));
    } finally {
      setQuickAdding(null);
    }
  }

  async function handleRemoveParticipant(userId: string) {
    try {
      await removeVideoParticipant(id, userId);
      setParticipants(prev => prev.filter(p => p.user_id !== userId));
    } catch { /* silencia */ }
  }

  async function handleShare() {
    if (!video) return;
    setShareLoading(true);
    try {
      const updated = video.share_token
        ? await revokeShareLink(video.id)
        : await createShareLink(video.id);
      setVideo(updated);
      if (updated.share_token) setShareOpen(true);
    } finally {
      setShareLoading(false);
    }
  }

  function copyShareLink() {
    if (!video?.share_token) return;
    navigator.clipboard.writeText(`${window.location.origin}/shared/${video.share_token}`);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  if (!video) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="bv-spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
      </div>
    );
  }

  const statusCfg = STATUS_CFG[video.status];
  const shareUrl = video.share_token ? `${typeof window !== "undefined" ? window.location.origin : ""}/shared/${video.share_token}` : null;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>

      {/* AUTH HEADER */}
      <header className="bv-auth-header">
        <div className="bv-container bv-auth-header-inner">
          <Link href="/" className="bv-nav-logo" style={{ fontSize: 16 }}>
            <div className="bv-nav-logo-dot" />
            BT Vision
          </Link>
          <div className="bv-header-sep" />
          <nav style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--text-dim)", fontFamily: "var(--f-head)" }}>
            <Link href="/" style={{ color: "var(--text-dim)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}>Vídeos</Link>
            <span style={{ color: "var(--surface-3)" }}>/</span>
            <span style={{ color: "var(--text)", fontWeight: 500, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{video.filename}</span>
          </nav>
          <div style={{ flex: 1 }} />
          <button className="bv-btn-logout" onClick={logout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            Sair
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: "0 0 80px" }}>
        <div className="bv-container">

          {/* ── PENDING_ROI ── */}
          {video.status === "pending_roi" && (
            <div className="bv-grid-sidebar" style={{ gap: 32, padding: "32px 0" }}>
              <div>
                {submitting ? (
                  <div style={{ aspectRatio: "16/9", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "var(--radius-lg)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
                    <div className="bv-spinner" style={{ width: 48, height: 48, borderWidth: 3 }} />
                    <span style={{ fontSize: 14, color: "var(--text-muted)" }}>A enviar para processamento…</span>
                  </div>
                ) : (
                  <CourtROISelector thumbnailUrl={getThumbnailUrl(id)} onConfirm={handleROIConfirm} />
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "var(--radius-lg)", padding: 24 }}>
                  <h3 style={{ fontFamily: "var(--f-head)", fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Marca os cantos da quadra</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {["Canto superior esquerdo","Canto superior direito","Canto inferior direito","Canto inferior esquerdo"].map((label, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, fontSize: 14, color: "var(--text-muted)" }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, background: "var(--surface-2)", border: "1px solid var(--border-2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--f-head)", fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>{i + 1}</div>
                        <div style={{ paddingTop: 2 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Participantes */}
                <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "var(--radius-lg)", padding: 24 }}>
                  <h3 style={{ fontFamily: "var(--f-head)", fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Participantes</h3>
                  <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 14, lineHeight: 1.5 }}>
                    Adiciona os alunos presentes neste vídeo — o vídeo ficará visível no perfil deles.
                  </p>

                  {/* Selecção rápida pelos alunos do coach */}
                  {coachPlayers.length > 0 && (() => {
                    const participantIds = new Set(participants.map(p => p.user_id));
                    return (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 12, fontFamily: "var(--f-head)", color: "var(--text-dim)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                          Os meus alunos
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {coachPlayers.map(p => {
                            const added = participantIds.has(p.player_id);
                            const loading = quickAdding === p.player_id;
                            return (
                              <button
                                key={p.player_id}
                                disabled={added || loading}
                                onClick={() => !added && handleQuickAdd(p)}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 6,
                                  padding: "5px 10px", borderRadius: 100,
                                  fontSize: 12, fontFamily: "var(--f-head)", fontWeight: 500,
                                  cursor: added ? "default" : "pointer",
                                  transition: "all 0.15s",
                                  background: added ? "var(--green-bg)" : "var(--surface-2)",
                                  border: `1px solid ${added ? "var(--green-dim)" : "var(--border-2)"}`,
                                  color: added ? "var(--green-l)" : "var(--text-muted)",
                                }}
                                onMouseEnter={e => { if (!added && !loading) { e.currentTarget.style.borderColor = "var(--surface-3)"; e.currentTarget.style.color = "var(--text)"; } }}
                                onMouseLeave={e => { if (!added && !loading) { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.color = "var(--text-muted)"; } }}
                              >
                                {added ? (
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                                ) : loading ? (
                                  <div className="bv-spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} />
                                ) : (
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                )}
                                {p.player_name || p.player_email}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Adicionar por email (outros utilizadores) */}
                  <form onSubmit={handleAddParticipant} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <input
                      className="bv-form-input"
                      type="email"
                      placeholder="outro email…"
                      value={participantEmail}
                      onChange={e => { setParticipantEmail(e.target.value); setParticipantErr(null); }}
                      style={{ flex: 1, fontSize: 13, padding: "8px 12px" }}
                    />
                    <button
                      type="submit"
                      className="bv-btn bv-btn-green bv-btn-sm"
                      disabled={participantAdding || !participantEmail.trim()}
                      style={{ flexShrink: 0 }}
                    >
                      {participantAdding ? "…" : "Adicionar"}
                    </button>
                  </form>

                  {participantErr && (
                    <p style={{ fontSize: 12, color: "#fca5a5", marginBottom: 10 }}>{participantErr}</p>
                  )}

                  {participants.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {participants.map(p => (
                        <div key={p.user_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--green-bg)", border: "1px solid var(--green-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--f-head)", fontWeight: 700, fontSize: 11, color: "var(--green-l)", flexShrink: 0 }}>
                            {(p.name || p.email).slice(0, 2).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {p.name && <div style={{ fontFamily: "var(--f-head)", fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{p.name}</div>}
                            <div style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.email}</div>
                          </div>
                          <button
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 4, borderRadius: 4, flexShrink: 0, lineHeight: 0 }}
                            onClick={() => handleRemoveParticipant(p.user_id)}
                            title="Remover"
                            onMouseEnter={e => (e.currentTarget.style.color = "#fca5a5")}
                            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {error && <p style={{ fontSize: 13, color: "#fca5a5", padding: "10px 14px", background: "var(--red-bg)", borderRadius: "var(--radius)", border: "1px solid #7f1d1d" }}>{error}</p>}
              </div>
            </div>
          )}

          {/* ── PENDING / PROCESSING ── */}
          {(video.status === "pending" || video.status === "processing") && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "100px 24px", textAlign: "center" }}>
              <div className="bv-spinner" style={{ width: 80, height: 80, borderWidth: 3, marginBottom: 32 }} />
              <div style={{ fontFamily: "var(--f-head)", fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.02em" }}>A analisar o teu vídeo…</div>
              <div style={{ fontSize: 16, color: "var(--text-muted)", fontWeight: 300, marginBottom: 48, maxWidth: 480 }}>
                Isto pode demorar alguns minutos. Podes fechar esta página — podes voltar mais tarde para ver os resultados.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", maxWidth: 400, textAlign: "left" }}>
                {[
                  { label: "Upload concluído", done: true },
                  { label: "ROI confirmado", done: true },
                  {
                    label: video.status === "pending" ? "A iniciar infraestrutura…" : "Infraestrutura pronta",
                    active: video.status === "pending",
                    done: video.status === "processing",
                  },
                  { label: "A detetar jogadores e bola", active: video.status === "processing", waiting: video.status === "pending" },
                  { label: "A gerar heatmaps", waiting: true },
                  { label: "A gerar relatório", waiting: true },
                ].map(s => (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 10, fontFamily: "var(--f-head)", fontSize: 14, fontWeight: 500, color: s.done ? "var(--text-muted)" : s.active ? "var(--text)" : "var(--text-dim)", background: s.active ? "var(--surface)" : "transparent" }}>
                    <div style={{ width: 24, height: 24, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: s.done ? "var(--green-l)" : s.active ? "var(--text-muted)" : "var(--surface-3)" }}>
                      {s.done ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                      ) : s.active ? (
                        <div className="bv-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      {s.label}
                      {s.active && processingPct > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
                            <span>frames analisados</span>
                            <span>{processingPct}%</span>
                          </div>
                          <div style={{ height: 3, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${processingPct}%`, background: "var(--green)", borderRadius: 2, transition: "width 0.4s ease" }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── FAILED ── */}
          {video.status === "failed" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "100px 24px", textAlign: "center" }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--red-bg)", border: "2px solid var(--red)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 28px" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              </div>
              <div style={{ fontFamily: "var(--f-head)", fontSize: 24, fontWeight: 700, marginBottom: 10 }}>Análise falhou</div>
              <div style={{ fontSize: 16, color: "var(--text-muted)", fontWeight: 300, maxWidth: 480, marginBottom: 32, lineHeight: 1.6 }}>
                Ocorreu um erro durante o processamento do vídeo. O problema pode ser a qualidade do vídeo, formato não suportado, ou o vídeo não contém frames suficientes.
              </div>
              {video.error && (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", padding: "14px 20px", marginBottom: 32, fontFamily: "var(--f-mono)", fontSize: 13, color: "#fca5a5", width: "100%", maxWidth: 480, textAlign: "left" }}>
                  {video.error}
                </div>
              )}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                <Link href="/" className="bv-btn bv-btn-surface">← Voltar ao dashboard</Link>
                <a href="mailto:suporte@btvision.pt" className="bv-btn bv-btn-ghost">Contactar suporte</a>
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {video.status === "done" && result && (
            <>
              <div style={{ padding: "32px 0 24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, borderBottom: "1px solid var(--border)", marginBottom: 32 }}>
                <div>
                  <div style={{ fontFamily: "var(--f-head)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 }}>{video.filename}</div>
                  <div style={{ fontSize: 14, color: "var(--text-dim)" }}>
                    Analisado em {new Date(video.created_at).toLocaleDateString("pt-PT")} · {formatDuration(result.duration_s)} de duração · Processado em {result.processing_time_s}s
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    className="bv-btn bv-btn-ghost bv-btn-sm"
                    onClick={handleExportPdf}
                    disabled={pdfLoading}
                  >
                    {pdfLoading
                      ? <div className="bv-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    }
                    {pdfLoading ? "A gerar…" : "Exportar PDF"}
                  </button>
                  <button
                    className="bv-btn bv-btn-sm"
                    style={{ background: video.share_token ? "var(--surface-2)" : "var(--green)", color: video.share_token ? "var(--text)" : "#fff", border: "none" }}
                    onClick={() => video.share_token ? setShareOpen(true) : handleShare()}
                    disabled={shareLoading}
                  >
                    {shareLoading ? <div className="bv-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
                    )}
                    {video.share_token ? "Partilhado" : "Partilhar"}
                  </button>
                </div>

                {/* Modal de partilha */}
                {shareOpen && (
                  <div
                    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
                    onClick={() => setShareOpen(false)}
                  >
                    <div
                      style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "var(--radius-lg)", padding: 28, width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 20 }}
                      onClick={e => e.stopPropagation()}
                    >
                      <div>
                        <div style={{ fontFamily: "var(--f-head)", fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Partilhar relatório</div>
                        <div style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.5 }}>
                          Qualquer pessoa com este link pode ver o relatório sem precisar de conta.
                        </div>
                      </div>
                      {shareUrl && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            readOnly
                            value={shareUrl}
                            style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", padding: "8px 12px", fontSize: 13, color: "var(--text-dim)", fontFamily: "var(--f-mono)", outline: "none" }}
                            onFocus={e => e.target.select()}
                          />
                          <button
                            className="bv-btn bv-btn-sm"
                            style={{ background: shareCopied ? "var(--green)" : "var(--surface-2)", color: shareCopied ? "#fff" : "var(--text)", border: "none", flexShrink: 0 }}
                            onClick={copyShareLink}
                          >
                            {shareCopied ? "Copiado!" : "Copiar"}
                          </button>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4, borderTop: "1px solid var(--border)" }}>
                        <button
                          style={{ fontSize: 13, color: "#fca5a5", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                          onClick={handleShare}
                          disabled={shareLoading}
                        >
                          {shareLoading ? "A revogar…" : "Revogar link"}
                        </button>
                        <button className="bv-btn bv-btn-ghost bv-btn-sm" onClick={() => setShareOpen(false)}>Fechar</button>
                      </div>
                    </div>
                  </div>
                )}
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

              {/* STAT CARDS — linha 2: rallies (só se o resultado tiver estes dados) */}
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
                      {[["#eab308","Alta densidade"],["#854d0e","Baixa"]].map(([c,l]) => (
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
                      {[["#3b82f6","J1"],["#f97316","J2"],["#a855f7","J3"],["#22c55e","J4"]].map(([c,l]) => (
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
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontFamily: "var(--f-head)", fontSize: 14, fontWeight: 600 }}>Replay interativo</div>
                  <span className="bv-badge bv-badge-done">
                    <span className="bv-badge-dot" />
                    Concluído
                  </span>
                </div>
                <CourtReplay videoId={id} result={result} onTimeUpdate={setReplayTimeS} />
              </div>

              {/* ANNOTATIONS */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", marginTop: 24 }}>
                <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontFamily: "var(--f-head)", fontSize: 14, fontWeight: 600 }}>Anotações</div>
                </div>
                <AnnotationPanel
                  videoId={id}
                  currentTimeS={replayTimeS}
                  onSeek={() => {}}
                />
              </div>

              <p style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "right", marginTop: 16 }}>
                Processado em {result.processing_time_s}s · {result.resolution}
              </p>
            </>
          )}

        </div>
      </main>
    </div>
  );
}
