"use client";

import { useRef, useState } from "react";
import {
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  type Annotation,
} from "@/lib/api";
import { TAG_CFG, TAGS, type AnnotationTag } from "@/lib/annotation-tags";

function TagPill({ tag }: { tag: AnnotationTag }) {
  const { label, rgb } = TAG_CFG[tag];
  return (
    <span style={{
      fontSize: 11, fontFamily: "var(--f-head)", fontWeight: 600, letterSpacing: "0.04em",
      padding: "2px 8px", borderRadius: 100,
      color: `rgb(${rgb})`, background: `rgba(${rgb},0.12)`,
    }}>{label}</span>
  );
}

function AuthorAvatar({ name, email }: { name: string | null; email: string }) {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
      background: "var(--surface-2)", border: "1px solid var(--border-2)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--f-head)", fontWeight: 700, fontSize: 11, color: "var(--text-dim)",
    }}>
      {(name || email).slice(0, 2).toUpperCase()}
    </div>
  );
}

function formatTs(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

interface ItemProps {
  ann: Annotation;
  currentUserId: string;
  videoId: string;
  onSeek?: (s: number) => void;
  onUpdated: (ann: Annotation) => void;
  onDeleted: (id: string) => void;
  onReply: (ann: Annotation) => void;
  isReply?: boolean;
}

function AnnotationItem({ ann, currentUserId, videoId, onSeek, onUpdated, onDeleted, onReply, isReply }: ItemProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(ann.content);
  const [editTag, setEditTag] = useState<AnnotationTag | "">(ann.tag as AnnotationTag ?? "");
  const [editPrivate, setEditPrivate] = useState(ann.is_private);
  const [saving, setSaving] = useState(false);
  const isOwn = ann.author_id === currentUserId;

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateAnnotation(videoId, ann.id, {
        content: editContent, tag: editTag || null, is_private: editPrivate,
      });
      onUpdated(updated);
      setEditing(false);
    } catch { /* silencia */ } finally { setSaving(false); }
  }

  return (
    <div style={{ display: "flex", gap: 10, paddingLeft: isReply ? 40 : 0 }}>
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
          {ann.court_x !== null && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={2}><circle cx="12" cy="10" r="3" /><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /></svg>
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
              <select value={editTag} onChange={e => setEditTag(e.target.value as AnnotationTag | "")}
                style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", padding: "5px 8px", fontSize: 12, color: "var(--text)", fontFamily: "var(--f-head)", outline: "none" }}>
                <option value="">Sem tag</option>
                {TAGS.map(t => <option key={t} value={t}>{TAG_CFG[t].label}</option>)}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-dim)", cursor: "pointer" }}>
                <input type="checkbox" checked={editPrivate} onChange={e => setEditPrivate(e.target.checked)} /> Privado
              </label>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button className="bv-btn bv-btn-ghost bv-btn-sm" onClick={() => setEditing(false)}>Cancelar</button>
                <button className="bv-btn bv-btn-green bv-btn-sm" onClick={handleSave} disabled={saving || !editContent.trim()}>{saving ? "…" : "Guardar"}</button>
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
              <button onClick={() => onReply(ann)}
                style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--f-head)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}>
                Responder
              </button>
            )}
            {isOwn && <>
              <button onClick={() => { setEditing(true); setEditContent(ann.content); setEditTag(ann.tag as AnnotationTag ?? ""); setEditPrivate(ann.is_private); }}
                style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--f-head)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}>
                Editar
              </button>
              <button onClick={() => deleteAnnotation(videoId, ann.id).then(() => onDeleted(ann.id))}
                style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--f-head)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#fca5a5")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}>
                Eliminar
              </button>
            </>}
          </div>
        )}

        {!isReply && ann.replies.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            {ann.replies.map(r => (
              <AnnotationItem key={r.id} ann={r} currentUserId={currentUserId} videoId={videoId}
                onSeek={onSeek} onUpdated={onUpdated} onDeleted={onDeleted} onReply={onReply} isReply />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  videoId: string;
  currentUserId: string;
  annotations: Annotation[];
  currentTimeS?: number;
  onSeek?: (s: number) => void;
  onCreated: (ann: Annotation) => void;
  onUpdated: (ann: Annotation) => void;
  onDeleted: (id: string) => void;
}

export function AnnotationPanel({ videoId, currentUserId, annotations, currentTimeS, onSeek, onCreated, onUpdated, onDeleted }: Props) {
  const [content, setContent] = useState("");
  const [tag, setTag] = useState<AnnotationTag | "">("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [useTimestamp, setUseTimestamp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Annotation | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

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
      onCreated(ann);
      setContent(""); setTag(""); setIsPrivate(false); setUseTimestamp(false);
    } catch { /* silencia */ } finally { setSubmitting(false); }
  }

  async function handleReplySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!replyingTo || !replyContent.trim()) return;
    setReplySubmitting(true);
    try {
      const ann = await createAnnotation(videoId, { content: replyContent.trim(), parent_id: replyingTo.id });
      // inject reply into parent annotation
      onUpdated({ ...replyingTo, replies: [...replyingTo.replies, ann] });
      setReplyingTo(null); setReplyContent("");
    } catch { /* silencia */ } finally { setReplySubmitting(false); }
  }

  function handleReply(ann: Annotation) {
    setReplyingTo(ann); setReplyContent("");
    setTimeout(() => replyRef.current?.focus(), 50);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
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
          <select value={tag} onChange={e => setTag(e.target.value as AnnotationTag | "")}
            style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", padding: "5px 8px", fontSize: 12, color: tag ? "var(--text)" : "var(--text-dim)", fontFamily: "var(--f-head)", outline: "none" }}>
            <option value="">Sem tag</option>
            {TAGS.map(t => <option key={t} value={t}>{TAG_CFG[t].label}</option>)}
          </select>
          {currentTimeS !== undefined && (
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-dim)", cursor: "pointer", fontFamily: "var(--f-head)" }}>
              <input type="checkbox" checked={useTimestamp} onChange={e => setUseTimestamp(e.target.checked)} />
              {formatTs(currentTimeS)}
            </label>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-dim)", cursor: "pointer", fontFamily: "var(--f-head)" }}>
            <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} /> Privado
          </label>
          <button type="submit" className="bv-btn bv-btn-green bv-btn-sm" disabled={submitting || !content.trim()} style={{ marginLeft: "auto" }}>
            {submitting ? "…" : "Publicar"}
          </button>
        </div>
      </form>

      {/* Reply form */}
      {replyingTo && (
        <form onSubmit={handleReplySubmit} style={{ padding: "14px 24px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--f-head)" }}>
            A responder a <span style={{ color: "var(--text)" }}>{replyingTo.author_name || replyingTo.author_email}</span>
            <button type="button" onClick={() => setReplyingTo(null)} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: 11 }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <textarea ref={replyRef} placeholder="Escreve a tua resposta…" value={replyContent} onChange={e => setReplyContent(e.target.value)} rows={2}
              style={{ flex: 1, resize: "vertical", background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", padding: "8px 10px", fontSize: 13, color: "var(--text)", fontFamily: "inherit", outline: "none" }} />
            <button type="submit" className="bv-btn bv-btn-green bv-btn-sm" disabled={replySubmitting || !replyContent.trim()} style={{ alignSelf: "flex-end" }}>
              {replySubmitting ? "…" : "Responder"}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {annotations.length === 0 ? (
        <div style={{ padding: "32px 24px", textAlign: "center", fontSize: 13, color: "var(--text-dim)" }}>
          Sem anotações ainda. Clica na quadra para ancorar uma ao vídeo.
        </div>
      ) : (
        annotations.map(ann => (
          <div key={ann.id} style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
            <AnnotationItem ann={ann} currentUserId={currentUserId} videoId={videoId}
              onSeek={onSeek} onUpdated={onUpdated} onDeleted={onDeleted} onReply={handleReply} />
          </div>
        ))
      )}
    </div>
  );
}
