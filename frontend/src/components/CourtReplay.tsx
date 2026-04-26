"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { VideoResult } from "@/lib/api";
import { getStreamUrl } from "@/lib/api";
import { courtToCanvas, detectOrientation, drawCourt, pixelToCanvas } from "@/lib/court";

const TRAIL_FRAMES = 30;
const SNAP_WINDOW = 4;
const PLAYER_COLORS: Record<number, string> = { 0: "#3b82f6", 1: "#f97316", 2: "#a855f7", 3: "#22c55e" };

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

export function CourtReplay({ videoId, result }: { videoId: string; result: VideoResult }) {
  const courtRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekingRef = useRef(false);
  const [frame, setFrame] = useState(0);
  const [videoReady, setVideoReady] = useState(false);

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

  function playerColor(id: string) {
    const i = topIds.indexOf(id);
    return PLAYER_COLORS[i] ?? "#6b7280";
  }

  // sincronizar vídeo com slider
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoReady) return;
    const t = frame / result.fps;
    if (Math.abs(video.currentTime - t) > 0.15) {
      seekingRef.current = true;
      video.currentTime = t;
    }
  }, [frame, result.fps, videoReady]);

  // actualizar slider a partir do vídeo (play nativo)
  function onTimeUpdate() {
    if (seekingRef.current) return;
    const video = videoRef.current;
    if (video) setFrame(Math.round(video.currentTime * result.fps));
  }

  function onSeeked() { seekingRef.current = false; }

  // desenhar quadra
  useEffect(() => {
    const canvas = courtRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = "#0f2417";
    ctx.fillRect(0, 0, W, H);
    drawCourt(ctx, W, H, orientation);

    // trail da bola
    const trail = result.ball_positions
      .filter((p) => p.frame <= frame && p.frame > frame - TRAIL_FRAMES * 2)
      .slice(-TRAIL_FRAMES);
    trail.forEach((p, i) => {
      const alpha = ((i + 1) / trail.length) * 0.55;
      const [x, y] = pos(p.cx, p.cy, p.nx, p.ny, W, H);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(250,204,21,${alpha})`;
      ctx.fill();
    });

    const cf = closest(sortedFrames, frame, SNAP_WINDOW);
    if (cf !== null) {
      const data = index.get(cf)!;

      if (data.ball) {
        const [x, y] = pos(data.ball.cx, data.ball.cy, data.ball.nx, data.ball.ny, W, H);
        const isProxy = data.ball.proxy === true;

        if (isProxy) {
          // posição com proxy do jogador — alta confiança
          const grd = ctx.createRadialGradient(x, y, 0, x, y, 18);
          grd.addColorStop(0, "rgba(250,204,21,0.9)");
          grd.addColorStop(1, "rgba(250,204,21,0)");
          ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2);
          ctx.fillStyle = grd; ctx.fill();
          ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
          ctx.fillStyle = "#facc15"; ctx.fill();
        } else {
          // posição sem proxy — profundidade incerta (câmera lateral)
          ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(250,204,21,0.6)";
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      data.players.forEach((p) => {
        const [x, y] = pos(p.cx, p.cy, p.nx, p.ny, W, H);
        const color = playerColor(p.id);
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.fillStyle = "white";
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(p.id, x, y);
      });
    }
  }, [frame, index, sortedFrames, normalized, result, frameW, frameH, topIds]);

  // desenhar timeline
  useEffect(() => {
    const canvas = timelineRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    const RALLY_H = Math.round(H * 0.4);  // 40% superior = rallies
    const BALL_Y = RALLY_H + 2;           // 60% inferior = bola

    ctx.fillStyle = "#1f2937"; ctx.fillRect(0, 0, W, H);

    // bandas de rally (verde, metade superior)
    (result.rallies ?? []).forEach((r) => {
      const x1 = Math.round((r.start_frame / result.total_frames) * W);
      const x2 = Math.round((r.end_frame / result.total_frames) * W);
      ctx.fillStyle = "rgba(34, 197, 94, 0.4)";
      ctx.fillRect(x1, 0, Math.max(x2 - x1, 2), RALLY_H);
    });

    // bola (amarelo, metade inferior)
    result.ball_positions.forEach(({ frame: f }) => {
      const x = Math.round((f / result.total_frames) * W);
      ctx.fillStyle = "#facc15"; ctx.fillRect(x, BALL_Y, 2, H - BALL_Y);
    });

    // cursor
    const cx = Math.round((frame / result.total_frames) * W);
    ctx.fillStyle = "white"; ctx.fillRect(cx - 1, 0, 2, H);
  }, [frame, result]);

  const cf = closest(sortedFrames, frame, SNAP_WINDOW);
  const cur = cf !== null ? index.get(cf) : null;
  const timeSec = (frame / result.fps).toFixed(1);

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

      {/* painéis lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* vídeo real */}
        <div className="flex flex-col gap-1">
          <p className="text-xs text-gray-500">Vídeo original</p>
          <video
            ref={videoRef}
            src={getStreamUrl(videoId)}
            className="w-full rounded-lg border border-gray-800 bg-black"
            onCanPlay={() => setVideoReady(true)}
            onTimeUpdate={onTimeUpdate}
            onSeeked={onSeeked}
            playsInline
            controls
          />
        </div>

        {/* quadra bird's eye */}
        <div className="flex flex-col gap-1">
          <p className="text-xs text-gray-500">Vista de topo {normalized ? "· normalizado" : "· píxeis brutos"}</p>
          <canvas
            ref={courtRef}
            width={640}
            height={360}
            className="w-full rounded-lg border border-gray-800"
          />
        </div>
      </div>

      {/* timeline */}
      <canvas
        ref={timelineRef}
        width={640}
        height={24}
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
          <span>· clica para saltar</span>
        </span>
        <span>{result.duration_s}s</span>
      </div>

      {/* chips de rally — clicar salta para o início do rally */}
      {result.rallies && result.rallies.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {result.rallies.map((r) => {
            const active = frame >= r.start_frame && frame <= r.end_frame;
            return (
              <button
                key={r.rally_id}
                onClick={() => {
                  setFrame(r.start_frame);
                  const video = videoRef.current;
                  if (video && videoReady) video.currentTime = r.start_frame / result.fps;
                }}
                style={{
                  padding: "3px 10px",
                  fontSize: 12,
                  fontFamily: "var(--f-head)",
                  borderRadius: 999,
                  border: `1px solid ${active ? "rgb(34,197,94)" : "var(--border-2)"}`,
                  background: active ? "rgba(34,197,94,0.15)" : "var(--surface-2)",
                  color: active ? "rgb(134,239,172)" : "var(--text-dim)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                Rally {r.rally_id} · {r.duration_s}s
              </button>
            );
          })}
        </div>
      )}

      {/* slider */}
      <input
        type="range" min={0} max={result.total_frames} value={frame}
        onChange={(e) => setFrame(Number(e.target.value))}
        className="w-full accent-green-500"
      />
      <div className="text-xs text-gray-500 text-center">
        Frame {frame} / {result.total_frames} · {timeSec}s
        {cf !== null && cf !== frame && <span className="text-gray-600"> (deteção mais próxima: frame {cf})</span>}
      </div>

      {/* legenda */}
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
