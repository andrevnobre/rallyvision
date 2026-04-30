"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Shot, VideoResult } from "@/lib/api";
import { type CameraOrientation, courtToCanvas, detectOrientation, drawCourt, pixelToCanvas } from "@/lib/court";

const COURT_W = 1920;
const COURT_H = 1080;
const PLAYER_COLORS = ["#3b82f6", "#f97316", "#a855f7", "#22c55e"];

function topPlayers(positions: VideoResult["player_positions"], n = 4) {
  return Object.entries(positions)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, n);
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  color: string,
  alpha: number,
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 9;
  const headAngle = Math.PI / 5;
  const hex = Math.round(alpha * 255).toString(16).padStart(2, "0");

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color + hex;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - headAngle),
    y2 - headLen * Math.sin(angle - headAngle),
  );
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + headAngle),
    y2 - headLen * Math.sin(angle + headAngle),
  );
  ctx.closePath();
  ctx.fillStyle = color + hex;
  ctx.fill();
}

// ── ShotHeatmap ──────────────────────────────────────────────────────────────

export function ShotHeatmap({
  shots,
  playerPositions,
  courtRoi,
  cameraOrientation,
}: {
  shots: Shot[];
  playerPositions: VideoResult["player_positions"];
  courtRoi: VideoResult["court_roi"];
  cameraOrientation?: CameraOrientation;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const players = topPlayers(playerPositions);
  const colorMap = Object.fromEntries(
    players.map(([id], i) => [id, PLAYER_COLORS[i % PLAYER_COLORS.length]]),
  );
  const orientation: CameraOrientation = cameraOrientation ?? detectOrientation(courtRoi);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = "#0f2417";
    ctx.fillRect(0, 0, W, H);
    drawCourt(ctx, W, H, orientation);

    const visible = selectedPlayer
      ? shots.filter((s) => s.player_id === selectedPlayer)
      : shots;

    visible.forEach((shot) => {
      const color = shot.player_id ? (colorMap[shot.player_id] ?? "#9ca3af") : "#9ca3af";
      const [x1, y1] = courtToCanvas(shot.nx_start, shot.ny_start, W, H, orientation);
      const [x2, y2] = courtToCanvas(shot.nx_end, shot.ny_end, W, H, orientation);
      drawArrow(ctx, x1, y1, x2, y2, color, 0.65);
    });
  }, [shots, colorMap, orientation, selectedPlayer]);

  const btnBase =
    "px-2.5 py-1 rounded text-xs font-medium transition-colors border";
  const btnActive = "border-transparent text-white";
  const btnInactive = "border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500";

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <h3 className="text-sm font-medium text-gray-400">Trajectórias de shots</h3>
        <span className="text-xs text-gray-600">· {shots.length} shots</span>
        <span className="text-xs text-gray-600">· {orientation}</span>

        {/* Player filter */}
        <div className="ml-auto flex gap-1.5 flex-wrap">
          <button
            className={`${btnBase} ${selectedPlayer === null ? btnActive + " bg-gray-600" : btnInactive}`}
            onClick={() => setSelectedPlayer(null)}
          >
            Todos
          </button>
          {players.map(([id], i) => {
            const count = shots.filter((s) => s.player_id === id).length;
            const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
            const active = selectedPlayer === id;
            return (
              <button
                key={id}
                className={`${btnBase} ${active ? btnActive : btnInactive}`}
                style={active ? { backgroundColor: color + "33", borderColor: color, color } : {}}
                onClick={() => setSelectedPlayer(active ? null : id)}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5"
                  style={{ background: color }}
                />
                J{i + 1}
                <span className="ml-1 text-gray-500 font-normal">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={640}
        height={360}
        className="rounded-lg w-full border border-gray-800"
      />
    </div>
  );
}

// ── BallHeatmap ───────────────────────────────────────────────────────────────

export function BallHeatmap({
  positions,
  courtRoi,
  cameraOrientation,
}: {
  positions: VideoResult["ball_positions"];
  courtRoi: VideoResult["court_roi"];
  cameraOrientation?: CameraOrientation;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const normalized = courtRoi !== null && positions.some((p) => p.nx !== undefined);
  const orientation: CameraOrientation = cameraOrientation ?? detectOrientation(courtRoi);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = "#0f2417";
    ctx.fillRect(0, 0, W, H);
    drawCourt(ctx, W, H, orientation);

    positions
      .filter(({ nx, ny }) =>
        !normalized || nx === undefined || (nx >= 0 && nx <= 1 && ny! >= 0 && ny! <= 1)
      )
      .forEach(({ cx, cy, conf, nx, ny, proxy }) => {
      const [x, y] = normalized && nx !== undefined
        ? courtToCanvas(nx, ny!, W, H, orientation)
        : pixelToCanvas(cx, cy, COURT_W, COURT_H, W, H, orientation);

      const radius = 4 + conf * 8;
      const alpha = proxy ? 1.0 : 0.35;

      const grd = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.5);
      grd.addColorStop(0, `rgba(250, 204, 21, ${(0.7 + conf * 0.3) * alpha})`);
      grd.addColorStop(1, "rgba(250, 204, 21, 0)");
      ctx.beginPath();
      ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 220, 50, ${(0.85 + conf * 0.15) * alpha})`;
      ctx.fill();
    });
  }, [positions, normalized, orientation]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-medium text-gray-400">Trajetória da bola</h3>
        {normalized
          ? <span className="text-xs text-green-600">normalizado</span>
          : <span className="text-xs text-gray-600">píxeis brutos</span>}
        <span className="text-xs text-gray-600">· {orientation}</span>
        <span className="ml-auto text-xs text-gray-600">
          {positions.length} pontos · {positions.filter(p => p.proxy).length} com proxy
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={640}
        height={360}
        className="rounded-lg w-full border border-gray-800"
      />
    </div>
  );
}

// ── Player grouping by court quadrant ────────────────────────────────────────

type PlayerFrame = VideoResult["player_positions"][string][number];

interface PlayerGroup {
  frames: PlayerFrame[];
  label: string;
  color: string;
}

// Minimum frames a track needs to count as a real player (filters noise/passers-by)
const MIN_TRACK_FRAMES = 15;

function groupPlayersByQuadrant(
  positions: VideoResult["player_positions"],
  orientation: CameraOrientation,
): PlayerGroup[] {
  // fundo camera: net axis = ny (net at ny=0.5); lateral = ny splits partners
  // lateral camera: net axis = nx (net at nx=0.5); lateral = ny splits partners
  const netIsNy = orientation === "fundo";

  const groups: PlayerFrame[][] = [[], [], [], []];
  // index:  0 = teamA-left, 1 = teamA-right, 2 = teamB-left, 3 = teamB-right
  // teamA = near side (fundo for fundo cam / left for lateral cam)

  for (const frames of Object.values(positions)) {
    const validNx = frames.map(f => f.nx).filter((v): v is number => v !== undefined && v >= 0 && v <= 1);
    const validNy = frames.map(f => f.ny).filter((v): v is number => v !== undefined && v >= 0 && v <= 1);
    if (validNx.length < MIN_TRACK_FRAMES) continue;

    const meanNx = validNx.reduce((a, b) => a + b, 0) / validNx.length;
    const meanNy = validNy.reduce((a, b) => a + b, 0) / validNy.length;

    const netVal  = netIsNy ? meanNy : meanNx;  // which team
    const sideVal = netIsNy ? meanNx : meanNy;  // which partner within team

    const teamIdx = netVal >= 0.5 ? 0 : 2;
    const sideIdx = sideVal >= 0.5 ? 1 : 0;
    groups[teamIdx + sideIdx].push(...frames);
  }

  const LABELS = netIsNy
    ? ["Fundo ←", "Fundo →", "Saque ←", "Saque →"]
    : ["Esq. ↑",  "Esq. ↓",  "Dir. ↑",  "Dir. ↓"];

  return groups
    .map((frames, i) => ({ frames, label: LABELS[i], color: PLAYER_COLORS[i] }))
    .filter(g => g.frames.length > 0);
}

// ── PlayerHeatmap ─────────────────────────────────────────────────────────────

export function PlayerHeatmap({
  positions,
  courtRoi,
  cameraOrientation,
}: {
  positions: VideoResult["player_positions"];
  courtRoi: VideoResult["court_roi"];
  cameraOrientation?: CameraOrientation;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orientation: CameraOrientation = cameraOrientation ?? detectOrientation(courtRoi);

  const normalized =
    courtRoi !== null &&
    Object.values(positions).some((frames) => frames.some((f) => f.nx !== undefined));

  // Use quadrant grouping for normalised data; fall back to top-4 for raw pixels
  const drawGroups = useMemo<PlayerGroup[]>(() => {
    if (normalized) {
      const grouped = groupPlayersByQuadrant(positions, orientation);
      if (grouped.length > 0) return grouped;
    }
    return topPlayers(positions).map(([, frames], i) => ({
      frames,
      label: `Jogador ${i + 1}`,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    }));
  }, [positions, normalized, orientation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = "#0f2417";
    ctx.fillRect(0, 0, W, H);
    drawCourt(ctx, W, H, orientation);

    drawGroups.forEach(({ frames, color }) => {
      frames.forEach(({ cx, cy, nx, ny }) => {
        const [x, y] = normalized && nx !== undefined
          ? courtToCanvas(nx, ny!, W, H, orientation)
          : pixelToCanvas(cx, cy, COURT_W, COURT_H, W, H, orientation);

        const grd = ctx.createRadialGradient(x, y, 0, x, y, 14);
        grd.addColorStop(0, color + "99");
        grd.addColorStop(1, color + "00");
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = color + "cc";
        ctx.fill();
      });
    });
  }, [drawGroups, normalized, orientation]);

  const totalPoints = drawGroups.reduce((s, g) => s + g.frames.length, 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-medium text-gray-400">Posicionamento dos jogadores</h3>
        {normalized
          ? <span className="text-xs text-green-600">normalizado</span>
          : <span className="text-xs text-gray-600">píxeis brutos</span>}
        <span className="text-xs text-gray-600">· {orientation}</span>
        <span className="ml-auto text-xs text-gray-600">{totalPoints} pontos</span>
      </div>
      <canvas
        ref={canvasRef}
        width={640}
        height={360}
        className="rounded-lg w-full border border-gray-800"
      />
      <div className="flex gap-4 mt-2 flex-wrap">
        {drawGroups.map((g) => (
          <span key={g.label} className="text-xs flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: g.color }}
            />
            {g.label} ({g.frames.length} pts)
          </span>
        ))}
      </div>
    </div>
  );
}
