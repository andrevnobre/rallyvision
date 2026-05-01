"use client";

import { useEffect, useState } from "react";
import { adminListFeedback, adminFeedbackAudioUrl, getToken, type AdminFeedback } from "@/lib/api";

function FeedbackRow({ item }: { item: AdminFeedback }) {
  const [expanded, setExpanded] = useState(false);
  const date = new Date(item.created_at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 24px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--f-head)", fontWeight: 600, fontSize: 15 }}>
            {item.name ?? <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Anónimo</span>}
            {item.email && <span style={{ fontSize: 13, color: "var(--text-dim)", marginLeft: 8 }}>{item.email}</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{date}</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {item.has_audio && (
            <span style={{ fontSize: 11, fontWeight: 600, background: "#E3F2F9", color: "#1A5F7A", padding: "3px 10px", borderRadius: 100 }}>
              🎙️ Áudio
            </span>
          )}
          {item.text_feedback && (
            <span style={{ fontSize: 11, fontWeight: 600, background: "#E8F5EE", color: "#3A9A6E", padding: "3px 10px", borderRadius: 100 }}>
              ✍️ Texto
            </span>
          )}
          {(item.text_feedback || item.has_audio) && (
            <button
              onClick={() => setExpanded(v => !v)}
              style={{ fontSize: 12, color: "var(--text-dim)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 12px", cursor: "pointer" }}
            >
              {expanded ? "Fechar" : "Ver detalhes"}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {item.text_feedback && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>
                Feedback escrito
              </div>
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", fontSize: 14, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {item.text_feedback}
              </div>
            </div>
          )}

          {item.has_audio && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>
                Nota de voz
              </div>
              <AudioPlayer feedbackId={item.id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AudioPlayer({ feedbackId }: { feedbackId: string }) {
  const token = getToken();
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(adminFeedbackAudioUrl(feedbackId), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Erro " + res.status);
      const blob = await res.blob();
      setSrc(URL.createObjectURL(blob));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  if (error) return <span style={{ fontSize: 13, color: "#fca5a5" }}>{error}</span>;
  if (!src) {
    return (
      <button
        onClick={load}
        disabled={loading}
        style={{ fontSize: 13, padding: "7px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", color: "var(--text)" }}
      >
        {loading ? "A carregar…" : "▶ Carregar áudio"}
      </button>
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio controls src={src} style={{ width: "100%", borderRadius: 8 }} />
  );
}

export default function FeedbackPage() {
  const [items, setItems] = useState<AdminFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminListFeedback()
      .then(setItems)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: "var(--f-head)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Feedback de coaches</div>
        <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 4 }}>
          Respostas recebidas pela página de pré-lançamento — texto e áudio.
        </div>
      </div>

      {loading && <p style={{ color: "var(--text-dim)" }}>A carregar…</p>}
      {error && <p style={{ color: "#fca5a5" }}>{error}</p>}

      {!loading && !error && items.length === 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "40px 24px", textAlign: "center", color: "var(--text-dim)" }}>
          Ainda não há feedback. Partilha a página com coaches para começar a recolher opiniões.
        </div>
      )}

      {items.map(item => (
        <FeedbackRow key={item.id} item={item} />
      ))}
    </div>
  );
}
