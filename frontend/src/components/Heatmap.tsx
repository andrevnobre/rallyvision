"use client";

import { useEffect, useRef } from "react";
import type { VideoResult } from "@/lib/api";

const COURT_W = 1920;
const COURT_H = 1080;

const PLAYER_COLORS = ["#3b82f6", "#f97316", "#a855f7", "#22c55e"];

function topPlayers(positions: VideoResult["player_positions"], n = 2) {
  return Object.entries(positions)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, n);
}

export function BallHeatmap({ positions }: { positions: VideoResult["ball_positions"] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    const sx = W / COURT_W, sy = H / COURT_H;

    // fundo
    ctx.fillStyle = "#14532d";
    ctx.fillRect(0, 0, W, H);

    // linhas da quadra
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9);
    ctx.beginPath();
    ctx.moveTo(W / 2, H * 0.05);
    ctx.lineTo(W / 2, H * 0.95);
    ctx.stroke();

    // posições da bola
    positions.forEach(({ cx, cy, conf }) => {
      const x = cx * sx, y = cy * sy;
      const radius = 5 + conf * 6;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(250, 204, 21, ${0.4 + conf * 0.5})`;
      ctx.fill();
    });
  }, [positions]);

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-400 mb-2">Trajetória da bola</h3>
      <canvas ref={canvasRef} width={640} height={360}
        className="rounded-lg w-full border border-gray-800" />
    </div>
  );
}

export function PlayerHeatmap({ positions }: { positions: VideoResult["player_positions"] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const players = topPlayers(positions);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    const sx = W / COURT_W, sy = H / COURT_H;

    ctx.fillStyle = "#14532d";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9);
    ctx.beginPath();
    ctx.moveTo(W / 2, H * 0.05);
    ctx.lineTo(W / 2, H * 0.95);
    ctx.stroke();

    players.forEach(([, frames], i) => {
      const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
      frames.forEach(({ cx, cy }) => {
        ctx.beginPath();
        ctx.arc(cx * sx, cy * sy, 6, 0, Math.PI * 2);
        ctx.fillStyle = color.replace(")", ", 0.5)").replace("rgb", "rgba").replace("#", "rgba(").replace("rgba(", "rgba(") ;
        // simpler approach:
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    });
  }, [players]);

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-400 mb-2">Posicionamento dos jogadores</h3>
      <canvas ref={canvasRef} width={640} height={360}
        className="rounded-lg w-full border border-gray-800" />
      <div className="flex gap-4 mt-2">
        {players.map(([id], i) => (
          <span key={id} className="text-xs flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: PLAYER_COLORS[i] }} />
            Jogador {i + 1}
          </span>
        ))}
      </div>
    </div>
  );
}
