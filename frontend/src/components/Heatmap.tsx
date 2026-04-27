"use client";

import { useEffect, useRef } from "react";
import type { VideoResult } from "@/lib/api";
import { type CameraOrientation, courtToCanvas, detectOrientation, drawCourt, pixelToCanvas } from "@/lib/court";

const COURT_W = 1920;
const COURT_H = 1080;
const PLAYER_COLORS = ["#3b82f6", "#f97316", "#a855f7", "#22c55e"];

function topPlayers(positions: VideoResult["player_positions"], n = 4) {
  return Object.entries(positions)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, n);
}

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
  const players = topPlayers(positions);
  const normalized =
    courtRoi !== null &&
    players.some(([, frames]) => frames.some((f) => f.nx !== undefined));
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

    players.forEach(([, frames], i) => {
      const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
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
  }, [players, normalized, orientation]);

  const totalPoints = players.reduce((s, [, f]) => s + f.length, 0);

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
      <div className="flex gap-4 mt-2">
        {players.map(([id], i) => (
          <span key={id} className="text-xs flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: PLAYER_COLORS[i] }}
            />
            Jogador {i + 1} ({positions[id]?.length ?? 0} pts)
          </span>
        ))}
      </div>
    </div>
  );
}
