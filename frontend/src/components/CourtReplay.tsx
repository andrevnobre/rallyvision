"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { VideoResult, Annotation } from "@/lib/api";
import { createAnnotation, getStreamUrl } from "@/lib/api";
import { canvasToCourt, courtToCanvas, detectOrientation, drawCourt, pixelToCanvas } from "@/lib/court";
import { TAG_CFG, TAGS, type AnnotationTag } from "@/lib/annotation-tags";

const TRAIL_FRAMES = 30;
const SNAP_WINDOW = 4;
const PLAYER_COLORS: Record<number, string> = { 0: "#3b82f6", 1: "#f97316", 2: "#a855f7", 3: "#22c55e" };
const ANN_WINDOW_S = 3;

interface FrameEntry {
  ball?: VideoResult["ball_positions"][number];
  players: { id: string; cx: number; cy: number; nx?: number; ny?: number }[];
}

function buildIndex(result: VideoResult): Map<number, FrameEntry> {
  const index = new Map<number, FrameEntry>();
  const ensure = (f: number): FrameEntry => {
    if (!index.has(f)) index.set(f, { players: [] });
    return index.get(f)!;
  };
  result.ball_positions.forEach((p) => { ensure(p.frame).ball = p; });
  Object.entries(result.player_positions).forEach(([id, frames]) => {
    frames.forEach((f) => {
      ensure(f.frame).players.push({ id, cx: f.cx, cy: f.cy, nx: f.nx, ny: f.ny });
    });
  });
  return index;
}

function closest(frames: number[], target: number, win: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const f of frames) {
    const d = Math.abs(f - target);
    if (d <= win && d < bestD) { best = f; bestD = d; }
  }
  return best;
}

type PendingPin =
  | { kind: "court"; nx: number; ny: number; pctX: number; pctY: number }
  | { kind: "video"; fx: number; fy: number; pctX: number; pctY: number };

interface TooltipState { ann: Annotation; pctX: number; pctY: number; surface: "court" | "video" }

interface Props {
  videoId: string;
  result: VideoResult;
  onTimeUpdate?: (s: number) => void;
  annotations?: Annotation[];
  currentUserId?: string;
  onAnnotationCreated?: (ann: Annotation) => void;
}

export function CourtReplay({ videoId, result, onTimeUpdate: onTimeUpdateProp, annotations, currentUserId, onAnnotationCreated }: Props) {
  const courtRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekingRef = useRef(false);
  const [frame, setFrame] = useState(0);
  const [videoReady, setVideoReady] = useState(false);

  const [annotateMode, setAnnotateMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [pinContent, setPinContent] = useState("");
  const [pinTag, setPinTag] = useState<AnnotationTag | "">("");
  const [pinPrivate, setPinPrivate] = useState(false);
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const normalized = result.court_roi !== null && result.ball_positions.some((p) => p.nx !== undefined);
  const orientation = (result.camera_orientation as "lateral" | "fundo" | undefined) ?? detectOrientation(result.court_roi);
  const [frameW, frameH] = result.resolution.split("x").map(Number);

  const topIds = useMemo(
    () => Object.entries(result.player_positions).sort((a, b) => b[1].length - a[1].length).slice(0, 4).map(([id]) => id),
    [result],
  );
  const index = useMemo(() => buildIndex(result), [result]);
  const sortedFrames = useMemo(() => [...index.keys()].sort((a, b) => a - b), [index]);

  function pos(cx: number, cy: number, nx: number | undefined, ny: number | undefined, W: number, H: number): [number, number] {
    return normalized && nx !== undefined
      ? courtToCanvas(nx, ny!, W, H, orientation)
      : pixelToCanvas(cx, cy, frameW, frameH, W, H, orientation);
  }

  // sync frame → video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoReady) return;
    const t = frame / result.fps;
    if (Math.abs(video.currentTime - t) > 0.15) {
      seekingRef.current = true;
      video.currentTime = t;
    }
  }, [frame, result.fps, videoReady]);

  function onTimeUpdate() {
    if (seekingRef.current) return;
    const video = videoRef.current;
    if (video) {
      setFrame(Math.round(video.currentTime * result.fps));
      onTimeUpdateProp?.(video.currentTime);
    }
  }
  function onSeeked() { seekingRef.current = false; }

  // draw court canvas
  useEffect(() => {
    const canvas = courtRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = "#0f2417";
    ctx.fillRect(0, 0, W, H);
    drawCourt(ctx, W, H, orientation);

    const trail = result.ball_positions
      .filter((p) => p.frame <= frame && p.frame > frame - TRAIL_FRAMES * 2)
      .slice(-TRAIL_FRAMES);
    trail.forEach((p, i) => {
      const alpha = ((i + 1) / trail.length) * 0.55;
      const [x, y] = pos(p.cx, p.cy, p.nx, p.ny, W, H);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(250,204,21,${alpha})`; ctx.fill();
    });

    const cf = closest(sortedFrames, frame, SNAP_WINDOW);
    if (cf !== null) {
      const data = index.get(cf)!;
      if (data.ball) {
        const [x, y] = pos(data.ball.cx, data.ball.cy, data.ball.nx, data.ball.ny, W, H);
        if (data.ball.proxy) {
          const grd = ctx.createRadialGradient(x, y, 0, x, y, 18);
          grd.addColorStop(0, "rgba(250,204,21,0.9)"); grd.addColorStop(1, "rgba(250,204,21,0)");
          ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
          ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fillStyle = "#facc15"; ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(250,204,21,0.6)"; ctx.setLineDash([3, 3]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
        }
      }
      data.players.forEach((p) => {
        const [x, y] = pos(p.cx, p.cy, p.nx, p.ny, W, H);
        const color = PLAYER_COLORS[topIds.indexOf(p.id)] ?? "#6b7280";
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
        ctx.fillStyle = "white"; ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.id, x, y);
      });
    }

    // annotation pins on court canvas
    const currentTimeS = frame / result.fps;
    (annotations ?? []).forEach((ann) => {
      // court-anchored pins
      if (ann.court_x !== null && ann.court_y !== null) {
        let alpha = 1.0;
        if (ann.timestamp_s !== null) {
          const dist = Math.abs(ann.timestamp_s - currentTimeS);
          if (dist > ANN_WINDOW_S) return;
          alpha = Math.max(0.15, 1 - dist / ANN_WINDOW_S);
        }
        const [x, y] = courtToCanvas(ann.court_x, ann.court_y, W, H, orientation);
        drawCourtPin(ctx, x, y, alpha, ann);
      }
      // frame-anchored pins projected onto court canvas
      if (ann.frame_x !== null && ann.frame_y !== null) {
        if (ann.timestamp_s === null) return;
        const dist = Math.abs(ann.timestamp_s - currentTimeS);
        if (dist > ANN_WINDOW_S) return;
        const alpha = Math.max(0.15, 1 - dist / ANN_WINDOW_S);
        const [x, y] = pixelToCanvas(ann.frame_x * frameW, ann.frame_y * frameH, frameW, frameH, W, H, orientation);
        drawCourtPin(ctx, x, y, alpha, ann);
      }
    });

    // pending pin
    if (pendingPin?.kind === "court") {
      const [x, y] = courtToCanvas(pendingPin.nx, pendingPin.ny, W, H, orientation);
      ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fill();
    }
  }, [frame, index, sortedFrames, normalized, result, frameW, frameH, topIds, annotations, pendingPin, orientation]);

  function drawCourtPin(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number, ann: Annotation) {
    const rgb = ann.tag ? (TAG_CFG[ann.tag as AnnotationTag]?.rgb ?? "226,232,240") : "226,232,240";
    ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${rgb},${alpha * 0.7})`; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${rgb},${alpha * 0.85})`; ctx.fill();
    ctx.fillStyle = `rgba(0,0,0,${alpha * 0.8})`;
    ctx.font = "bold 6px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText((ann.author_name || ann.author_email).slice(0, 2).toUpperCase(), x, y);
  }

  // draw timeline
  useEffect(() => {
    const canvas = timelineRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    const RALLY_H = Math.round(H * 0.4);
    const BALL_Y = RALLY_H + 2;

    ctx.fillStyle = "#1f2937"; ctx.fillRect(0, 0, W, H);
    (result.rallies ?? []).forEach((r) => {
      const x1 = Math.round((r.start_frame / result.total_frames) * W);
      const x2 = Math.round((r.end_frame / result.total_frames) * W);
      ctx.fillStyle = "rgba(34,197,94,0.4)"; ctx.fillRect(x1, 0, Math.max(x2 - x1, 2), RALLY_H);
    });
    result.ball_positions.forEach(({ frame: f }) => {
      const x = Math.round((f / result.total_frames) * W);
      ctx.fillStyle = "#facc15"; ctx.fillRect(x, BALL_Y, 2, H - BALL_Y);
    });
    (annotations ?? []).forEach((ann) => {
      if (ann.timestamp_s === null) return;
      const x = Math.round((ann.timestamp_s / result.duration_s) * W);
      const rgb = ann.tag ? (TAG_CFG[ann.tag as AnnotationTag]?.rgb ?? "226,232,240") : "226,232,240";
      ctx.fillStyle = `rgba(${rgb},0.9)`; ctx.fillRect(x - 1, 0, 2, H);
    });
    const cx = Math.round((frame / result.total_frames) * W);
    ctx.fillStyle = "white"; ctx.fillRect(cx - 1, 0, 2, H);
  }, [frame, result, annotations]);

  // ── click handlers ──

  function handleCourtClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!annotateMode) return;
    const canvas = courtRef.current!;
    const rect = canvas.getBoundingClientRect();
    const lx = (e.clientX - rect.left) * (640 / rect.width);
    const ly = (e.clientY - rect.top) * (360 / rect.height);
    const [nx, ny] = canvasToCourt(lx, ly, 640, 360, orientation);
    const [pcx, pcy] = courtToCanvas(nx, ny, 100, 100, orientation);
    setPendingPin({ kind: "court", nx, ny, pctX: Math.min(pcx, 72), pctY: pcy });
    setPinContent(""); setPinTag(""); setPinPrivate(false);
  }

  function handleVideoOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!annotateMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const pctX = Math.min(fx * 100, 72);
    const pctY = fy * 100;
    setPendingPin({ kind: "video", fx, fy, pctX, pctY });
    setPinContent(""); setPinTag(""); setPinPrivate(false);
  }

  function handleCourtMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (annotateMode) return;
    const canvas = courtRef.current!;
    const rect = canvas.getBoundingClientRect();
    const lx = (e.clientX - rect.left) * (640 / rect.width);
    const ly = (e.clientY - rect.top) * (360 / rect.height);
    const currentTimeS = frame / result.fps;

    for (const ann of (annotations ?? [])) {
      let ax: number, ay: number;
      if (ann.court_x !== null && ann.court_y !== null) {
        if (ann.timestamp_s !== null && Math.abs(ann.timestamp_s - currentTimeS) > ANN_WINDOW_S) continue;
        [ax, ay] = courtToCanvas(ann.court_x, ann.court_y, 640, 360, orientation);
      } else if (ann.frame_x !== null && ann.frame_y !== null) {
        if (ann.timestamp_s === null || Math.abs(ann.timestamp_s - currentTimeS) > ANN_WINDOW_S) continue;
        [ax, ay] = pixelToCanvas(ann.frame_x * frameW, ann.frame_y * frameH, frameW, frameH, 640, 360, orientation);
      } else continue;
      if (Math.hypot(lx - ax, ly - ay) < 16) {
        setTooltip({ ann, pctX: (e.clientX - rect.left) / rect.width * 100, pctY: (e.clientY - rect.top) / rect.height * 100, surface: "court" });
        return;
      }
    }
    setTooltip(null);
  }

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingPin || !pinContent.trim()) return;
    setPinSubmitting(true);
    try {
      const body = {
        content: pinContent.trim(),
        timestamp_s: frame / result.fps,
        tag: pinTag || null,
        is_private: pinPrivate,
        ...(pendingPin.kind === "court"
          ? { court_x: pendingPin.nx, court_y: pendingPin.ny }
          : { frame_x: pendingPin.fx, frame_y: pendingPin.fy }),
      };
      const ann = await createAnnotation(videoId, body);
      onAnnotationCreated?.(ann);
      setPendingPin(null);
    } catch { /* silencia */ } finally { setPinSubmitting(false); }
  }

  const cf = closest(sortedFrames, frame, SNAP_WINDOW);
  const cur = cf !== null ? index.get(cf) : null;
  const timeSec = (frame / result.fps).toFixed(1);
  const currentTimeS = frame / result.fps;

  // visible frame-anchored annotations for the video overlay
  const videoOverlayAnns = (annotations ?? []).filter(ann =>
    ann.frame_x !== null && ann.frame_y !== null && ann.timestamp_s !== null &&
    Math.abs(ann.timestamp_s - currentTimeS) <= ANN_WINDOW_S
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-400">Replay frame a frame</h3>
        <div className="flex gap-4 text-xs">
          {cur?.ball
            ? <span className="text-yellow-400">● bola conf {cur.ball.conf}</span>
            : <span className="text-gray-600">○ sem bola</span>}
          {cur && cur.players.length > 0
            ? <span className="text-blue-400">● {cur.players.length} jogadores</span>
            : <span className="text-gray-600">○ sem jogadores</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── VIDEO ── */}
        <div className="flex flex-col gap-1">
          <p className="text-xs text-gray-500">Vídeo original</p>
          {/* wrapper with overlay */}
          <div style={{ position: "relative" }}>
            <video
              ref={videoRef}
              src={getStreamUrl(videoId)}
              className="w-full rounded-lg border border-gray-800 bg-black"
              style={{ aspectRatio: `${frameW}/${frameH}`, display: "block" }}
              onCanPlay={() => setVideoReady(true)}
              onTimeUpdate={onTimeUpdate}
              onSeeked={onSeeked}
              playsInline
              controls
            />

            {/* transparent click overlay — só activo em annotate mode */}
            <div
              onClick={handleVideoOverlayClick}
              style={{
                position: "absolute", inset: 0,
                cursor: annotateMode ? "crosshair" : "default",
                pointerEvents: annotateMode ? "all" : "none",
                borderRadius: "var(--radius-lg)",
                // highlight border when active
                outline: annotateMode ? "2px solid rgba(34,197,94,0.5)" : "none",
                outlineOffset: -2,
              }}
            />

            {/* frame-anchored annotation pins */}
            {videoOverlayAnns.map(ann => {
              const dist = Math.abs(ann.timestamp_s! - currentTimeS);
              const alpha = Math.max(0.15, 1 - dist / ANN_WINDOW_S);
              const rgb = ann.tag ? (TAG_CFG[ann.tag as AnnotationTag]?.rgb ?? "226,232,240") : "226,232,240";
              return (
                <div
                  key={ann.id}
                  onMouseEnter={() => setTooltip({ ann, pctX: ann.frame_x! * 100, pctY: ann.frame_y! * 100, surface: "video" })}
                  onMouseLeave={() => setTooltip(null)}
                  style={{
                    position: "absolute",
                    left: `${ann.frame_x! * 100}%`,
                    top: `${ann.frame_y! * 100}%`,
                    transform: "translate(-50%, -50%)",
                    width: 26, height: 26, borderRadius: "50%",
                    background: `rgba(${rgb},${alpha * 0.75})`,
                    border: `2px solid rgba(${rgb},${alpha * 0.9})`,
                    opacity: alpha,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 7, fontWeight: 700, color: "rgba(0,0,0,0.85)",
                    fontFamily: "var(--f-head)",
                    pointerEvents: "all",
                    cursor: "default",
                    backdropFilter: "blur(2px)",
                    transition: "opacity 0.3s",
                    zIndex: 5,
                  }}
                >
                  {(ann.author_name || ann.author_email).slice(0, 2).toUpperCase()}
                </div>
              );
            })}

            {/* pending video pin popover */}
            {pendingPin?.kind === "video" && (
              <div onClick={e => e.stopPropagation()}
                style={{
                  position: "absolute",
                  left: `${pendingPin.pctX}%`,
                  top: `${pendingPin.pctY > 60 ? pendingPin.pctY - 2 : pendingPin.pctY + 2}%`,
                  transform: pendingPin.pctY > 60 ? "translate(-50%, -100%)" : "translate(-50%, 16px)",
                  background: "var(--surface)", border: "1px solid var(--border-2)",
                  borderRadius: "var(--radius-lg)", padding: 14, width: 240, zIndex: 20,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                }}>
                <PinForm timeSec={timeSec} content={pinContent} setContent={setPinContent}
                  tag={pinTag} setTag={setPinTag} isPrivate={pinPrivate} setPrivate={setPinPrivate}
                  submitting={pinSubmitting} onSubmit={handlePinSubmit} onCancel={() => setPendingPin(null)}
                  label="Anotação no vídeo" />
              </div>
            )}

            {/* video pin tooltip */}
            {tooltip?.surface === "video" && (
              <Tooltip tooltip={tooltip} />
            )}
          </div>
        </div>

        {/* ── COURT CANVAS ── */}
        <div className="flex flex-col gap-1">
          <p className="text-xs text-gray-500">Vista de topo {normalized ? "· normalizado" : "· píxeis brutos"}</p>
          <div style={{ position: "relative" }}>
            {/* botão Anotar — overlay no canto superior direito da canvas */}
            <button
              onClick={() => { setAnnotateMode(m => !m); setPendingPin(null); }}
              style={{
                position: "absolute", top: 8, right: 8, zIndex: 10,
                fontSize: 11, fontFamily: "var(--f-head)", fontWeight: 600,
                padding: "3px 10px", borderRadius: 100, cursor: "pointer",
                background: annotateMode ? "rgba(34,197,94,0.25)" : "rgba(15,36,23,0.75)",
                border: `1px solid ${annotateMode ? "rgba(34,197,94,0.7)" : "rgba(255,255,255,0.15)"}`,
                color: annotateMode ? "rgb(134,239,172)" : "rgba(255,255,255,0.6)",
                backdropFilter: "blur(4px)",
                transition: "all 0.15s",
              }}
            >
              {annotateMode ? "✕ Sair" : "+ Anotar"}
            </button>
            {/* label de instrução no modo anotação */}
            {annotateMode && (
              <div style={{
                position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
                fontSize: 11, color: "rgb(134,239,172)", fontFamily: "var(--f-head)",
                background: "rgba(15,36,23,0.8)", padding: "3px 10px", borderRadius: 100,
                backdropFilter: "blur(4px)", zIndex: 10, whiteSpace: "nowrap",
              }}>
                Clica no vídeo ou na quadra · {timeSec}s
              </div>
            )}
            <canvas
              ref={courtRef}
              width={640} height={360}
              className="w-full rounded-lg border border-gray-800"
              style={{ cursor: annotateMode ? "crosshair" : "default" }}
              onClick={handleCourtClick}
              onMouseMove={handleCourtMouseMove}
              onMouseLeave={() => setTooltip(null)}
            />

            {/* court pin popover */}
            {pendingPin?.kind === "court" && (
              <div onClick={e => e.stopPropagation()}
                style={{
                  position: "absolute",
                  left: `${pendingPin.pctX}%`,
                  top: `${pendingPin.pctY > 60 ? pendingPin.pctY - 2 : pendingPin.pctY + 2}%`,
                  transform: pendingPin.pctY > 60 ? "translate(-50%, -100%)" : "translate(-50%, 16px)",
                  background: "var(--surface)", border: "1px solid var(--border-2)",
                  borderRadius: "var(--radius-lg)", padding: 14, width: 240, zIndex: 20,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                }}>
                <PinForm timeSec={timeSec} content={pinContent} setContent={setPinContent}
                  tag={pinTag} setTag={setPinTag} isPrivate={pinPrivate} setPrivate={setPinPrivate}
                  submitting={pinSubmitting} onSubmit={handlePinSubmit} onCancel={() => setPendingPin(null)}
                  label="Anotação na quadra" />
              </div>
            )}

            {/* court tooltip */}
            {tooltip?.surface === "court" && (
              <Tooltip tooltip={tooltip} />
            )}
          </div>
        </div>
      </div>

      {/* timeline */}
      <canvas
        ref={timelineRef} width={640} height={24}
        className="w-full rounded cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setFrame(Math.round(((e.clientX - rect.left) / rect.width) * result.total_frames));
        }}
      />
      <div className="flex justify-between text-xs text-gray-600">
        <span>0s</span>
        <span className="flex gap-3">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-green-600/60" />rally</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-yellow-400" />bola</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-white/40" />anotação</span>
          <span>· clica para saltar</span>
        </span>
        <span>{result.duration_s}s</span>
      </div>

      {/* rally chips */}
      {result.rallies && result.rallies.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {result.rallies.map((r) => {
            const active = frame >= r.start_frame && frame <= r.end_frame;
            return (
              <button key={r.rally_id}
                onClick={() => { setFrame(r.start_frame); const v = videoRef.current; if (v && videoReady) v.currentTime = r.start_frame / result.fps; }}
                style={{
                  padding: "3px 10px", fontSize: 12, fontFamily: "var(--f-head)", borderRadius: 999,
                  border: `1px solid ${active ? "rgb(34,197,94)" : "var(--border-2)"}`,
                  background: active ? "rgba(34,197,94,0.15)" : "var(--surface-2)",
                  color: active ? "rgb(134,239,172)" : "var(--text-dim)",
                  cursor: "pointer", transition: "all 0.15s",
                }}>
                Rally {r.rally_id} · {r.duration_s}s
              </button>
            );
          })}
        </div>
      )}

      <input type="range" min={0} max={result.total_frames} value={frame}
        onChange={(e) => setFrame(Number(e.target.value))} className="w-full accent-green-500" />
      <div className="text-xs text-gray-500 text-center">
        Frame {frame} / {result.total_frames} · {timeSec}s
        {cf !== null && cf !== frame && <span className="text-gray-600"> (deteção mais próxima: frame {cf})</span>}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        {topIds.map((id, i) => (
          <span key={id} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: PLAYER_COLORS[i] }} />
            Jogador {i + 1} · ID {id} · {result.player_positions[id]?.length ?? 0} frames
          </span>
        ))}
        {Object.keys(result.player_positions).length > 4 && (
          <span className="text-gray-600">+ {Object.keys(result.player_positions).length - 4} IDs fragmentados</span>
        )}
      </div>
    </div>
  );
}

// ── sub-components ──

function PinForm({ timeSec, content, setContent, tag, setTag, isPrivate, setPrivate, submitting, onSubmit, onCancel, label }: {
  timeSec: string; content: string; setContent: (v: string) => void;
  tag: AnnotationTag | ""; setTag: (v: AnnotationTag | "") => void;
  isPrivate: boolean; setPrivate: (v: boolean) => void;
  submitting: boolean; onSubmit: (e: React.FormEvent) => void; onCancel: () => void;
  label: string;
}) {
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--f-head)", marginBottom: 2 }}>
        {label} @ {timeSec}s
      </div>
      <textarea autoFocus placeholder="O que aconteceu aqui?" value={content} onChange={e => setContent(e.target.value)} rows={2}
        style={{ width: "100%", resize: "none", background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", padding: "7px 10px", fontSize: 12, color: "var(--text)", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <select value={tag} onChange={e => setTag(e.target.value as AnnotationTag | "")}
          style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", padding: "4px 6px", fontSize: 11, color: "var(--text)", fontFamily: "var(--f-head)", outline: "none" }}>
          <option value="">Sem tag</option>
          {TAGS.map(t => <option key={t} value={t}>{TAG_CFG[t].label}</option>)}
        </select>
        <label style={{ fontSize: 11, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={isPrivate} onChange={e => setPrivate(e.target.checked)} /> Privado
        </label>
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button type="button" className="bv-btn bv-btn-ghost bv-btn-sm" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="bv-btn bv-btn-green bv-btn-sm" disabled={submitting || !content.trim()}>
          {submitting ? "…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}

function Tooltip({ tooltip }: { tooltip: TooltipState }) {
  const { ann, pctX, pctY } = tooltip;
  return (
    <div style={{
      position: "absolute",
      left: `${Math.min(pctX, 75)}%`,
      top: `${pctY > 60 ? pctY - 2 : pctY + 2}%`,
      transform: pctY > 60 ? "translate(-50%, -100%)" : "translate(-50%, 12px)",
      background: "var(--surface)", border: "1px solid var(--border-2)",
      borderRadius: "var(--radius)", padding: "8px 12px",
      fontSize: 12, maxWidth: 200, zIndex: 10, pointerEvents: "none",
      boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
    }}>
      <div style={{ fontFamily: "var(--f-head)", fontSize: 11, color: "var(--text-dim)", marginBottom: 3 }}>
        {ann.author_name || ann.author_email}
        {ann.timestamp_s !== null && ` · ${Math.floor(ann.timestamp_s / 60)}:${String(Math.round(ann.timestamp_s % 60)).padStart(2, "0")}`}
      </div>
      <div style={{ color: "var(--text-muted)", lineHeight: 1.4 }}>{ann.content}</div>
    </div>
  );
}
