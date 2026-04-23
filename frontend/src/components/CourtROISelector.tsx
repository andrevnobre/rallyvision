"use client";

import { useEffect, useRef, useState } from "react";
import { detectOrientation, type CameraOrientation } from "@/lib/court";

interface Props {
  thumbnailUrl: string;
  onConfirm: (points: [number, number][], orientation: CameraOrientation) => void;
}

const POINT_COLORS = ["#22c55e", "#3b82f6", "#f97316", "#a855f7"];
const LABELS = ["1", "2", "3", "4"];
const POINT_LABELS = ["Sup. esq.", "Sup. dir.", "Inf. dir.", "Inf. esq."];

export function CourtROISelector({ thumbnailUrl, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [orientation, setOrientation] = useState<CameraOrientation | null>(null);
  const [manualOverride, setManualOverride] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = thumbnailUrl;
    img.onload = () => { imgRef.current = img; setImgLoaded(true); };
  }, [thumbnailUrl]);

  // auto-detectar orientação quando 4 cantos estão marcados (só se sem override manual)
  useEffect(() => {
    if (points.length === 4 && !manualOverride) {
      setOrientation(detectOrientation(points));
    }
    if (points.length < 4) {
      setOrientation(null);
      setManualOverride(false);
    }
  }, [points, manualOverride]);

  useEffect(() => { redraw(points, orientation); }, [points, imgLoaded, orientation]);

  function midpoint(a: [number, number], b: [number, number]): [number, number] {
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }

  function sortCorners(pts: [number, number][]): [number, number][] {
    const byY = [...pts].sort((a, b) => a[1] - b[1]);
    const top = byY.slice(0, 2).sort((a, b) => a[0] - b[0]);
    const bot = byY.slice(2).sort((a, b) => a[0] - b[0]);
    return [top[0], top[1], bot[1], bot[0]]; // TL, TR, BR, BL
  }

  function redraw(pts: [number, number][], ori: CameraOrientation | null) {
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

    // linha da rede estimada — adapta-se à orientação
    if (pts.length === 4 && ori) {
      const sorted = sortCorners(pts); // TL, TR, BR, BL

      // lateral: rede liga meio-topo ↔ meio-base (perpendicular ao eixo 16m → linha vertical)
      // fundo:   rede liga meio-esq  ↔ meio-dir  (perpendicular ao eixo 16m → linha horizontal)
      const netA = ori === "lateral"
        ? midpoint(sorted[0], sorted[1])  // meio da aresta de topo
        : midpoint(sorted[0], sorted[3]); // meio da aresta esquerda
      const netB = ori === "lateral"
        ? midpoint(sorted[3], sorted[2])  // meio da aresta de base
        : midpoint(sorted[1], sorted[2]); // meio da aresta direita

      const ax = netA[0] * W, ay = netA[1] * H;
      const bx = netB[0] * W, by = netB[1] * H;

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      const mx = (ax + bx) / 2, my = (ay + by) / 2;
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

  function handleOrientationOverride(o: CameraOrientation) {
    setOrientation(o);
    setManualOverride(true);
  }

  function handleReset() {
    setPoints([]);
    setOrientation(null);
    setManualOverride(false);
  }

  const nextLabel = points.length < 4
    ? `Ponto ${points.length + 1} de 4 — ${POINT_LABELS[points.length]}`
    : "Verifica se a linha da REDE coincide com a rede real no vídeo";

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1.5">
        <p className="text-sm text-gray-400">
          Clique nos <strong className="text-white">4 cantos da quadra</strong> em sentido horário.
          A linha branca a tracejado indica onde o sistema estima que a rede está.
        </p>
        <p className={`text-xs ${points.length === 4 ? "text-yellow-400" : "text-gray-600"}`}>
          {nextLabel}
        </p>

        {/* toggle de orientação — visível após 4 cantos */}
        {points.length === 4 && orientation && (
          <div className="flex items-center gap-2 pt-0.5">
            <span className="text-xs text-gray-500">Câmera:</span>
            <div className="flex rounded-md overflow-hidden border border-gray-700 text-xs">
              {(["lateral", "fundo"] as CameraOrientation[]).map((o) => (
                <button
                  key={o}
                  onClick={() => handleOrientationOverride(o)}
                  className={`px-3 py-1 transition-colors ${
                    orientation === o
                      ? "bg-green-700 text-white font-semibold"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  {o === "lateral" ? "Lateral (16m ↔)" : "Fundo (16m ↕)"}
                </button>
              ))}
            </div>
            {manualOverride && (
              <span className="text-xs text-yellow-500">corrigido manualmente</span>
            )}
            {!manualOverride && (
              <span className="text-xs text-green-600">auto-detetado</span>
            )}
          </div>
        )}
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
          Se não coincidir, ajusta a orientação acima ou clica em <strong>Resetar</strong> e repete.
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
            onClick={handleReset}
            disabled={points.length === 0}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            Resetar
          </button>
          <button
            onClick={() => orientation && onConfirm(points, orientation)}
            disabled={points.length < 4 || !orientation}
            className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-semibold text-sm transition-colors"
          >
            Analisar
          </button>
        </div>
      </div>
    </div>
  );
}
