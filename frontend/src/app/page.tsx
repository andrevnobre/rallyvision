"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadVideo, listVideos, getToken, removeToken, getMe, type VideoStatus } from "@/lib/api";

const STATUS_CFG: Record<VideoStatus["status"], { label: string; cls: string }> = {
  pending_roi:  { label: "Aguarda ROI",  cls: "bv-badge bv-badge-roi" },
  pending:      { label: "Na fila",      cls: "bv-badge bv-badge-pending" },
  processing:   { label: "A processar", cls: "bv-badge bv-badge-processing" },
  done:         { label: "Concluído",   cls: "bv-badge bv-badge-done" },
  failed:       { label: "Falhou",      cls: "bv-badge bv-badge-failed" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

export default function Home() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoStatus[]>([]);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userPlan, setUserPlan] = useState<string>("free");

  const ALLOWED = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"];

  useEffect(() => {
    if (!getToken()) { router.push("/landing"); return; }
    listVideos().then(setVideos).catch(() => {});
    getMe().then(u => { setUserEmail(u.email); setUserPlan(u.plan); }).catch(() => {});
  }, [router]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && ALLOWED.includes(f.type)) setFile(f);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }

  async function onUpload() {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadLabel(`A enviar "${file.name}" — 0%`);
    setError(null);

    try {
      const video = await uploadVideo(file, (pct) => {
        setUploadProgress(pct);
        setUploadLabel(
          pct < 100
            ? `A enviar "${file.name}" — ${pct}%`
            : `A guardar no servidor…`,
        );
      });
      setUploadProgress(100);
      setUploadLabel("Upload concluído!");
      setTimeout(() => router.push(`/videos/${video.id}`), 600);
    } catch (e) {
      setError(String(e));
      setUploading(false);
      setUploadProgress(0);
    }
  }

  function logout() {
    removeToken();
    router.push("/auth/login");
  }

  const doneCount = videos.filter(v => v.status === "done").length;
  const planAnalyses = userPlan === "pro" ? 8 : userPlan === "club" ? 20 : 2;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* AUTH HEADER */}
      <header className="bv-auth-header">
        <div className="bv-container bv-auth-header-inner">
          <Link href="/" className="bv-nav-logo">
            <div className="bv-nav-logo-dot" />
            BT Vision
          </Link>
          <div className="bv-header-sep" />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className={`bv-badge bv-badge-${userPlan}`} style={{ textTransform: "capitalize" }}>{userPlan}</span>
            <span className="bv-hide-mobile" style={{ fontSize: 13, color: "var(--text-dim)" }}>{doneCount} de {planAnalyses} análises usadas este mês</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {userEmail && <span className="bv-hide-mobile" style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "var(--f-head)" }}>{userEmail}</span>}
            <button className="bv-btn-logout" onClick={logout}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, padding: "40px 0 80px" }}>
        <div className="bv-container">

          {/* PAGE HEADER */}
          <div style={{ marginBottom: 32, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ fontFamily: "var(--f-head)", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 }}>Os meus vídeos</div>
              <div style={{ fontSize: 14, color: "var(--text-dim)" }}>Carrega partidas e treinos para análise automática.</div>
            </div>
            <Link href="/landing#pricing" className="bv-btn bv-btn-ghost bv-btn-sm" style={{ whiteSpace: "nowrap" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
              Fazer upgrade
            </Link>
          </div>

          {/* STAT STRIP */}
          <div className="bv-grid-3" style={{ gap: 16, marginBottom: 40 }}>
            {[
              { icon: <svg viewBox="0 0 24 24" fill="none" stroke="var(--green-l)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>, val: String(videos.length), lbl: "Vídeos carregados", iconBg: "var(--green-bg)" },
              { icon: <svg viewBox="0 0 24 24" fill="none" stroke="var(--green-l)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>, val: String(doneCount), lbl: "Análises concluídas", iconBg: "var(--green-bg)" },
              { icon: <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>, val: `${Math.max(0, planAnalyses - doneCount)} / ${planAnalyses}`, lbl: "Análises disponíveis", iconBg: "var(--surface-2)" },
            ].map(s => (
              <div key={s.lbl} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "18px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: s.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18 }}>{s.icon}</div>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--f-head)", fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>{s.val}</div>
                  <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>{s.lbl}</div>
                </div>
              </div>
            ))}
          </div>

          {/* UPLOAD ZONE */}
          <div
            onClick={() => !uploading && inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            style={{
              border: "2px dashed var(--border-2)", borderRadius: 16, padding: "clamp(28px, 5vw, 52px) clamp(16px, 4vw, 32px)",
              textAlign: "center", cursor: uploading ? "default" : "pointer",
              transition: "all 0.2s", position: "relative",
              background: dragOver ? "var(--green-bg)" : "var(--surface)",
              borderColor: dragOver ? "var(--green)" : file ? "var(--green-dim)" : "var(--border-2)",
              transform: dragOver ? "scale(1.01)" : "none",
              marginBottom: 40,
            }}
          >
            <input ref={inputRef} type="file" accept="video/*" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%" }} onChange={onFileChange} onClick={e => e.stopPropagation()} />

            <div style={{ width: 56, height: 56, borderRadius: 14, background: dragOver || file ? "var(--green-bg)" : "var(--surface-2)", border: `1px solid ${dragOver || file ? "var(--green-dim)" : "var(--border-2)"}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", transition: "all 0.2s" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={dragOver || file ? "var(--green-l)" : "var(--text-dim)"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transition: "all 0.2s" }}>
                <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
              </svg>
            </div>

            <div style={{ fontFamily: "var(--f-head)", fontSize: 17, fontWeight: 600, marginBottom: 6 }}>
              {file ? file.name : "Arrasta o vídeo aqui ou clica para seleccionar"}
            </div>
            <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 16 }}>
              {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "MP4, MOV, AVI ou MKV · Máximo 2 GB por ficheiro"}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              {[".mp4",".mov",".avi",".mkv"].map(t => (
                <span key={t} style={{ background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "3px 9px", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-dim)" }}>{t}</span>
              ))}
            </div>

            {uploading && (
              <div style={{ marginTop: 16 }} onClick={e => e.stopPropagation()}>
                <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "var(--green)", borderRadius: 2, width: `${uploadProgress}%`, transition: "width 0.3s ease" }} />
                </div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6, textAlign: "left" }}>{uploadLabel}</div>
              </div>
            )}
          </div>

          {file && !uploading && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: -24, marginBottom: 40 }}>
              <button onClick={onUpload} className="bv-btn bv-btn-green" style={{ minWidth: 180 }}>
                Analisar vídeo
              </button>
            </div>
          )}

          {error && <p style={{ fontSize: 13, color: "#fca5a5", padding: "10px 14px", background: "var(--red-bg)", borderRadius: "var(--radius)", border: "1px solid #7f1d1d", marginBottom: 24 }}>{error}</p>}

          {/* VIDEO LIST */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontFamily: "var(--f-head)", fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>Histórico</div>
            {videos.length > 0 && (
              <span style={{ fontSize: 13, color: "var(--text-dim)", background: "var(--surface-2)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: 100, fontFamily: "var(--f-head)", fontWeight: 500 }}>
                {videos.length} {videos.length === 1 ? "vídeo" : "vídeos"}
              </span>
            )}
          </div>

          {videos.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 32px", background: "var(--surface)", border: "1px dashed var(--border-2)", borderRadius: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: "var(--surface-2)", border: "1px solid var(--border-2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <div style={{ fontFamily: "var(--f-head)", fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Ainda sem vídeos</div>
              <div style={{ fontSize: 14, color: "var(--text-muted)", fontWeight: 300 }}>Carrega o teu primeiro vídeo para começar a análise.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {videos.map(v => {
                const cfg = STATUS_CFG[v.status];
                const actionLabel = v.status === "done" ? "Ver resultados" : v.status === "pending_roi" ? "Marcar quadra" : v.status === "processing" ? "Ver progresso" : v.status === "failed" ? "Ver erro" : null;
                return (
                  <Link key={v.id} href={`/videos/${v.id}`} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", transition: "border-color 0.15s", textDecoration: "none" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-2)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                    {/* Mini court thumbnail */}
                    <div style={{ width: 80, height: 52, borderRadius: 8, background: "var(--surface-2)", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="60" height="40" viewBox="0 0 60 40" fill="none">
                        <rect x="2" y="2" width="56" height="36" rx="2" stroke={v.status === "done" ? "#16a34a" : v.status === "failed" ? "#dc2626" : v.status === "processing" ? "#ca8a04" : "#334155"} strokeWidth="1" strokeOpacity="0.5" />
                        <line x1="30" y1="2" x2="30" y2="38" stroke={v.status === "done" ? "#16a34a" : "#334155"} strokeWidth="1" strokeOpacity="0.4" />
                        <line x1="2" y1="20" x2="58" y2="20" stroke={v.status === "done" ? "#16a34a" : "#334155"} strokeWidth="1" strokeOpacity="0.4" />
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--f-head)", fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.filename}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "var(--text-dim)" }}>
                        <span>{formatDate(v.created_at)}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <span className={cfg.cls}>
                        <span className="bv-badge-dot" />
                        {cfg.label}
                      </span>
                      {actionLabel && (
                        <span className={`bv-btn ${v.status === "done" ? "bv-btn-surface" : "bv-btn-ghost"} bv-btn-sm`}>{actionLabel}</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
