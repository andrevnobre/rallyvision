"use client";

import { useEffect, useRef, useState } from "react";
import {
  getAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getMe,
  type Annotation,
  type AnnotationTag,
} from "@/lib/api";

const TAG_CFG: Record<AnnotationTag, { label: string; color: string; bg: string }> = {
  tecnica:        { label: "Técnica",        color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  posicionamento: { label: "Posicionamento", color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  tatico:         { label: "Tático",         color: "#a855f7", bg: "rgba(168,85,247,0.12)" },
  mental:         { label: "Mental",         color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
};

function TagPill({ tag }: { tag: AnnotationTag }) {
  const cfg = TAG_CFG[tag];
  return (
    <span style={{
      fontSize: 11, fontFamily: "var(--f-head)", fontWeight: 600, letterSpacing: "0.04em",
      padding: "2px 8px", borderRadius: 100,
      color: cfg.color, background: cfg.bg,
    }}>{cfg.label}</span>
  );
}

function AuthorAvatar({ name, email }: { name: string | null; email: string }) {
  const initials = (name || email).slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
      background: "var(--surface-2)", border: "1px solid var(--border-2)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--f-head)", fontWeight: 700, fontSize: 11, color: "var(--text-dim)",
    }}>{initials}</div>
  );
}

function formatTs(s: number | null) {
  if (s === null) return null;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

interface AnnotationItemProps {
  ann: Annotation;
  currentUserId: string;
  videoId: string;
  onSeek?: (s: number) => void;
  onUpdated: (updated: Annotation) => void;
  onDeleted: (id: string) => void;
  onReply: (ann: Annotation) => void;
  isReply?: boolean;
}

function AnnotationItem({ ann, currentUserId, videoId, onSeek, onUpdated, onDeleted, onReply, isReply }: AnnotationItemProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(ann.content);
  const [editTag, setEditTag] = useState<AnnotationTag | "">(ann.tag ?? "");
  const [editPrivate, setEditPrivate] = useState(ann.is_private);
  const [saving, setSaving] = useState(false);
  const isOwn = ann.author_id === currentUserId;

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateAnnotation(videoId, ann.id, {
        content: editContent,
        tag: editTag || null,
        is_private: editPrivate,
      });
      onUpdated(updated);
      setEditing(false);
    } catch {
      // silences
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteAnnotation(videoId, ann.id);
      onDeleted(ann.id);
    } catch { /* silencia */ }
  }

  return (
    <div style={{
      display: "flex", gap: 10,
      paddingLeft: isReply ? 40 : 0,
    }}>
      <AuthorAvatar name={ann.author_name} email={ann.author_email} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <span style={{ fontFamily: "var(--f-head)", fontSize: 13, fontWeight: 600 }}>
            {ann.author_name || ann.author_email}
          </span>
          {ann.timestamp_s !== null && (
            <button
              onClick={() => onSeek?.(ann.timestamp_s!)}
              style={{ fontSize: 11, fontFamily: "var(--f-head)", color: "var(--green-l)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {formatTs(ann.timestamp_s)}
            </button>
          )}
          {ann.tag && <TagPill tag={ann.tag as AnnotationTag} />}
          {ann.is_private && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          )}
          <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: "auto" }}>
            {new Date(ann.created_at).toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}
          </span>
        </div>

        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              rows={2}
              style={{ width: "100%", resize: "vertical", background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", padding: "8px 10px", fontSize: 13, color: "var(--text)", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <select
                value={editTag}
                onChange={e => setEditTag(e.target.value as AnnotationTag | "")}
                style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", padding: "5px 8px", fontSize: 12, color: "var(--text)", fontFamily: "var(--f-head)", outline: "none" }}
              >
                <option value="">Sem tag</option>
                {(Object.keys(TAG_CFG) as AnnotationTag[]).map(t => (
                  <option key={t} value={t}>{TAG_CFG[t].label}</option>
                ))}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-dim)", cursor: "pointer" }}>
                <input type="checkbox" checked={editPrivate} onChange={e => setEditPrivate(e.target.checked)} />
                Privado
              </label>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button className="bv-btn bv-btn-ghost bv-btn-sm" onClick={() => setEditing(false)}>Cancelar</button>
                <button className="bv-btn bv-btn-green bv-btn-sm" onClick={handleSave} disabled={saving || !editContent.trim()}>
                  {saving ? "…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, margin: 0, wordBreak: "break-word" }}>
            {ann.content}
          </p>
        )}

        {!editing && (
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            {!isReply && (
              <button
                onClick={() => onReply(ann)}
                style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--f-head)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}
              >
                Responder
              </button>
            )}
            {isOwn && (
              <>
                <button
                  onClick={() => { setEditing(true); setEditContent(ann.content); setEditTag(ann.tag ?? ""); setEditPrivate(ann.is_private); }}
                  style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--f-head)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}
                >
                  Editar
                </button>
                <button
                  onClick={handleDelete}
                  style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--f-head)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#fca5a5")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}
                >
                  Eliminar
                </button>
              </>
            )}
          </div>
        )}

        {/* replies */}
        {!isReply && ann.replies.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            {ann.replies.map(r => (
              <AnnotationItem
                key={r.id}
                ann={r}
                currentUserId={currentUserId}
                videoId={videoId}
                onSeek={onSeek}
                onUpdated={onUpdated}
                onDeleted={onDeleted}
                onReply={onReply}
                isReply
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  videoId: string;
  currentTimeS?: number;
  onSeek?: (s: number) => void;
}

export function AnnotationPanel({ videoId, currentTimeS, onSeek }: Props) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [content, setContent] = useState("");
  const [tag, setTag] = useState<AnnotationTag | "">("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [useTimestamp, setUseTimestamp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Annotation | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getMe().then(u => setCurrentUserId(u.id)).catch(() => {});
    getAnnotations(videoId).then(setAnnotations).catch(() => {});
  }, [videoId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const ann = await createAnnotation(videoId, {
        content: content.trim(),
        tag: tag || null,
        is_private: isPrivate,
        timestamp_s: useTimestamp && currentTimeS !== undefined ? currentTimeS : null,
      });
      setAnnotations(prev => [ann, ...prev]);
      setContent("");
      setTag("");
      setIsPrivate(false);
      setUseTimestamp(false);
    } catch { /* silencia */ } finally {
      setSubmitting(false);
    }
  }

  async function handleReplySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!replyingTo || !replyContent.trim()) return;
    setReplySubmitting(true);
    try {
      const ann = await createAnnotation(videoId, {
        content: replyContent.trim(),
        parent_id: replyingTo.id,
      });
      setAnnotations(prev => prev.map(a =>
        a.id === replyingTo.id ? { ...a, replies: [...a.replies, ann] } : a
      ));
      setReplyingTo(null);
      setReplyContent("");
    } catch { /* silencia */ } finally {
      setReplySubmitting(false);
    }
  }

  function handleUpdated(updated: Annotation) {
    setAnnotations(prev => prev.map(a => {
      if (a.id === updated.id) return { ...a, ...updated };
      // check replies
      const newReplies = a.replies.map(r => r.id === updated.id ? { ...r, ...updated } : r);
      return { ...a, replies: newReplies };
    }));
  }

  function handleDeleted(id: string) {
    setAnnotations(prev => prev
      .filter(a => a.id !== id)
      .map(a => ({ ...a, replies: a.replies.filter(r => r.id !== id) }))
    );
  }

  function handleReply(ann: Annotation) {
    setReplyingTo(ann);
    setReplyContent("");
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* New annotation form */}
      <form onSubmit={handleSubmit} style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
        <textarea
          placeholder="Adicionar uma anotação…"
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={2}
          style={{ width: "100%", resize: "vertical", background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", padding: "10px 12px", fontSize: 13, color: "var(--text)", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          onFocus={e => (e.target.style.borderColor = "var(--surface-3)")}
          onBlur={e => (e.target.style.borderColor = "var(--border-2)")}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select
            value={tag}
            onChange={e => setTag(e.target.value as AnnotationTag | "")}
            style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", padding: "5px 8px", fontSize: 12, color: tag ? "var(--text)" : "var(--text-dim)", fontFamily: "var(--f-head)", outline: "none" }}
          >
            <option value="">Sem tag</option>
            {(Object.keys(TAG_CFG) as AnnotationTag[]).map(t => (
              <option key={t} value={t}>{TAG_CFG[t].label}</option>
            ))}
          </select>

          {currentTimeS !== undefined && (
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-dim)", cursor: "pointer", fontFamily: "var(--f-head)" }}>
              <input type="checkbox" checked={useTimestamp} onChange={e => setUseTimestamp(e.target.checked)} />
              {formatTs(currentTimeS) ?? "0:00"}
            </label>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-dim)", cursor: "pointer", fontFamily: "var(--f-head)" }}>
            <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} />
            Privado
          </label>

          <button
            type="submit"
            className="bv-btn bv-btn-green bv-btn-sm"
            disabled={submitting || !content.trim()}
            style={{ marginLeft: "auto" }}
          >
            {submitting ? "…" : "Publicar"}
          </button>
        </div>
      </form>

      {/* Reply form */}
      {replyingTo && (
        <form onSubmit={handleReplySubmit} style={{ padding: "14px 24px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--f-head)" }}>
            A responder a <span style={{ color: "var(--text)" }}>{replyingTo.author_name || replyingTo.author_email}</span>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: 11 }}
            >✕</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <textarea
              ref={textareaRef}
              placeholder="Escreve a tua resposta…"
              value={replyContent}
              onChange={e => setReplyContent(e.target.value)}
              rows={2}
              style={{ flex: 1, resize: "vertical", background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", padding: "8px 10px", fontSize: 13, color: "var(--text)", fontFamily: "inherit", outline: "none" }}
            />
            <button
              type="submit"
              className="bv-btn bv-btn-green bv-btn-sm"
              disabled={replySubmitting || !replyContent.trim()}
              style={{ alignSelf: "flex-end" }}
            >
              {replySubmitting ? "…" : "Responder"}
            </button>
          </div>
        </form>
      )}

      {/* Annotation list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {annotations.length === 0 ? (
          <div style={{ padding: "32px 24px", textAlign: "center", fontSize: 13, color: "var(--text-dim)" }}>
            Sem anotações ainda. Sê o primeiro a comentar.
          </div>
        ) : (
          annotations.map(ann => (
            <div key={ann.id} style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
              <AnnotationItem
                ann={ann}
                currentUserId={currentUserId}
                videoId={videoId}
                onSeek={onSeek}
                onUpdated={handleUpdated}
                onDeleted={handleDeleted}
                onReply={handleReply}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
