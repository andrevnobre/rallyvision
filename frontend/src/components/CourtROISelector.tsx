"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  thumbnailUrl: string;
  onConfirm: (points: [number, number][]) => void;
}

const POINT_COLORS = ["#22c55e", "#3b82f6", "#f97316", "#a855f7"];
const LABELS = ["1", "2", "3", "4"];
// ordem: sup-esq, sup-dir, inf-dir, inf-esq
const POINT_LABELS = ["Sup. esq.", "Sup. dir.", "Inf. dir.", "Inf. esq."];

export function CourtROISelector({ thumbnailUrl, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = thumbnailUrl;
    img.onload = () => { imgRef.current = img; setImgLoaded(true); };
  }, [thumbnailUrl]);

  useEffect(() => { redraw(points); }, [points, imgLoaded]);

  function midpoint(a: [number, number], b: [number, number]): [number, number] {
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }

  function sortCorners(pts: [number, number][]): [number, number][] {
    const byY = [...pts].sort((a, b) => a[1] - b[1]);
    const top = byY.slice(0, 2).sort((a, b) => a[0] - b[0]);
    const bot = byY.slice(2).sort((a, b) => a[0] - b[0]);
    return [top[0], top[1], bot[1], bot[0]]; // TL, TR, BR, BL
  }

  function redraw(pts: [number, number][]) {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    if (pts.length === 0) return;

    // polígono da quadra
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * W, pts[0][1] * H);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * W, pts[i][1] * H);
    if (pts.length === 4) {
      ctx.closePath();
      ctx.fillStyle = "rgba(34, 197, 94, 0.1)";
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(34, 197, 94, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // linha da rede estimada — usa sortCorners para ser robusto à ordem de clique
    if (pts.length === 4) {
      const sorted = sortCorners(pts); // TL, TR, BR, BL
      const netFar = midpoint(sorted[0], sorted[1]);   // meio do topo (lado distante)
      const netNear = midpoint(sorted[3], sorted[2]);  // meio da base (lado próximo)
      const nfx = netFar[0] * W, nfy = netFar[1] * H;
      const nnx = netNear[0] * W, nny = netNear[1] * H;

      ctx.beginPath();
      ctx.moveTo(nfx, nfy);
      ctx.lineTo(nnx, nny);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // label "REDE"
      const mx = (nfx + nnx) / 2, my = (nfy + nny) / 2;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath(); ctx.roundRect(mx - 22, my - 10, 44, 20, 4); ctx.fill();
      ctx.fillStyle = "white";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("REDE", mx, my);
    }

    // pontos numerados
    pts.forEach(([nx, ny], i) => {
      const x = nx * W, y = ny * H;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fillStyle = POINT_COLORS[i]; ctx.fill();
      ctx.fillStyle = "white";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(LABELS[i], x, y);
    });
  }

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (points.length >= 4) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    setPoints((prev) => [...prev, [nx, ny]]);
  }

  const nextLabel = points.length < 4
    ? `Ponto ${points.length + 1} de 4 — ${POINT_LABELS[points.length]}`
    : "Verifica se a linha da REDE coincide com a rede real no vídeo";

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <p className="text-sm text-gray-400">
          Clique nos <strong className="text-white">4 cantos da quadra</strong> em sentido horário.
          A linha branca a tracejado indica onde o sistema estima que a rede está.
        </p>
        <p className={`text-xs ${points.length === 4 ? "text-yellow-400" : "text-gray-600"}`}>
          {nextLabel}
        </p>
      </div>

      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        className={`rounded-lg w-full border border-gray-700 ${points.length < 4 ? "cursor-crosshair" : "cursor-default"} ${!imgLoaded ? "bg-gray-900" : ""}`}
        onClick={onClick}
      />

      {points.length === 4 && (
        <div className="bg-yellow-950/40 border border-yellow-800/50 rounded-lg px-4 py-2 text-xs text-yellow-300">
          Verifica se a linha branca a tracejado coincide com a rede real no vídeo acima.
          Se não coincidir, clica em <strong>Resetar</strong> e repete a seleção com mais precisão.
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          {LABELS.map((label, i) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span
                className="inline-block w-4 h-4 rounded-full text-white text-center leading-4 text-[10px] font-bold"
                style={{ background: POINT_COLORS[i], opacity: i < points.length ? 1 : 0.3 }}
              >
                {label}
              </span>
              {POINT_LABELS[i]}
            </span>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setPoints([])}
            disabled={points.length === 0}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            Resetar
          </button>
          <button
            onClick={() => onConfirm(points)}
            disabled={points.length < 4}
            className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-semibold text-sm transition-colors"
          >
            Analisar
          </button>
        </div>
      </div>
    </div>
  );
}
