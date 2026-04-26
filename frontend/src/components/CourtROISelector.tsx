"use client";

import { useEffect, useRef, useState } from "react";
import { detectOrientation, type CameraOrientation } from "@/lib/court";

export interface ROIResult {
  points: [number, number][];
  orientation: CameraOrientation;
  netPoints: [number, number][] | null;
}

interface Props {
  thumbnailUrl: string;
  onConfirm: (result: ROIResult) => void;
}

type Phase = "corners" | "net" | "ready";

const CORNER_COLORS = ["#22c55e", "#3b82f6", "#f97316", "#a855f7"];
const CORNER_DESCS  = ["Fundo esq.", "Fundo dir.", "Próximo dir.", "Próximo esq."];
const NET_COLOR     = "#facc15";

// Mini diagram of the court for the corner guide
function CourtGuide({ next }: { next: number }) {
  const cx = [14, 86, 86, 14];
  const cy = [12, 12, 58, 58];
  return (
    <svg width="100" height="70" className="shrink-0">
      {/* court */}
      <rect x="14" y="12" width="72" height="46" fill="#1a5c32" stroke="white" strokeWidth="1.5" />
      {/* net */}
      <line x1="50" y1="12" x2="50" y2="58" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="3,2" />
      {/* corner dots */}
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <circle
            cx={cx[i]} cy={cy[i]} r={i === next ? 8 : 6}
            fill={i < next ? CORNER_COLORS[i] : i === next ? CORNER_COLORS[i] : "rgba(255,255,255,0.15)"}
            stroke={i === next ? "white" : "none"}
            strokeWidth="2"
          />
          <text
            x={cx[i]} y={cy[i]}
            textAnchor="middle" dominantBaseline="central"
            fontSize="7" fontWeight="bold" fill="white"
          >
            {i + 1}
          </text>
        </g>
      ))}
      {/* near/far labels */}
      <text x="50" y="5"  textAnchor="middle" fontSize="5" fill="rgba(255,255,255,0.5)">FUNDO</text>
      <text x="50" y="66" textAnchor="middle" fontSize="5" fill="rgba(255,255,255,0.5)">PRÓXIMO</text>
    </svg>
  );
}

export function CourtROISelector({ thumbnailUrl, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef    = useRef<HTMLImageElement | null>(null);

  const [points,    setPoints]    = useState<[number, number][]>([]);
  const [netPoints, setNetPoints] = useState<[number, number][]>([]);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [orientation,    setOrientation]    = useState<CameraOrientation | null>(null);
  const [manualOverride, setManualOverride] = useState(false);
  const [phase, setPhase] = useState<Phase>("corners");

  // Load image
  useEffect(() => {
    const img = new Image();
    img.src = thumbnailUrl;
    img.onload = () => { imgRef.current = img; setImgLoaded(true); };
  }, [thumbnailUrl]);

  // Auto-detect orientation when 4 corners are marked
  useEffect(() => {
    if (points.length === 4 && !manualOverride) {
      setOrientation(detectOrientation(points));
    }
    if (points.length < 4) { setOrientation(null); setManualOverride(false); }
  }, [points, manualOverride]);

  useEffect(() => { redraw(); }, [points, netPoints, imgLoaded, orientation, phase]);

  // ── Derived state ──────────────────────────────────────────────────────────

  function sortedCorners(pts: [number, number][]): [number, number][] {
    const byY = [...pts].sort((a, b) => a[1] - b[1]);
    const top = byY.slice(0, 2).sort((a, b) => a[0] - b[0]);
    const bot = byY.slice(2).sort((a, b) => a[0] - b[0]);
    return [top[0], top[1], bot[1], bot[0]]; // TL, TR, BR, BL
  }

  function estimatedNet(pts: [number, number][], ori: CameraOrientation): [[number,number],[number,number]] {
    const s = sortedCorners(pts); // TL, TR, BR, BL
    const mid = (a: [number,number], b: [number,number]): [number,number] =>
      [(a[0]+b[0])/2, (a[1]+b[1])/2];
    if (ori === "lateral") {
      return [mid(s[0], s[1]), mid(s[3], s[2])]; // top-mid ↔ bottom-mid
    } else {
      return [mid(s[0], s[3]), mid(s[1], s[2])]; // left-mid ↔ right-mid
    }
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  function redraw() {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    if (points.length === 0) return;

    // Court polygon
    ctx.beginPath();
    ctx.moveTo(points[0][0]*W, points[0][1]*H);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0]*W, points[i][1]*H);
    if (points.length === 4) {
      ctx.closePath();
      ctx.fillStyle = "rgba(34,197,94,0.08)";
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(34,197,94,0.75)";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();

    // Net line
    if (points.length === 4 && orientation) {
      let netA: [number,number], netB: [number,number];
      const hasActualNet = netPoints.length === 2;

      if (hasActualNet) {
        [netA, netB] = netPoints as [[number,number],[number,number]];
      } else {
        [netA, netB] = estimatedNet(points, orientation);
      }

      const ax = netA[0]*W, ay = netA[1]*H;
      const bx = netB[0]*W, by = netB[1]*H;

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = hasActualNet ? NET_COLOR : "rgba(255,255,255,0.85)";
      ctx.lineWidth   = hasActualNet ? 3 : 2.5;
      ctx.setLineDash(hasActualNet ? [] : [8, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // "REDE" label
      const mx = (ax+bx)/2, my = (ay+by)/2;
      ctx.fillStyle = hasActualNet ? "rgba(250,204,21,0.85)" : "rgba(0,0,0,0.6)";
      ctx.beginPath(); ctx.roundRect(mx-24, my-11, 48, 22, 4); ctx.fill();
      ctx.fillStyle = hasActualNet ? "#000" : "white";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("REDE", mx, my);

      // Net point markers
      if (hasActualNet) {
        for (const [nx, ny] of netPoints) {
          ctx.beginPath();
          ctx.arc(nx*W, ny*H, 7, 0, Math.PI*2);
          ctx.fillStyle = NET_COLOR;
          ctx.fill();
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    // Corner dots
    points.forEach(([nx, ny], i) => {
      const x = nx*W, y = ny*H;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI*2);
      ctx.fillStyle = CORNER_COLORS[i]; ctx.fill();
      ctx.fillStyle = "white";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(i+1), x, y);
    });

    // Net-mode crosshair hint on last net point
    if (phase === "net" && netPoints.length === 1) {
      const [nx, ny] = netPoints[0];
      ctx.beginPath(); ctx.arc(nx*W, ny*H, 7, 0, Math.PI*2);
      ctx.fillStyle = NET_COLOR; ctx.fill();
    }
  }

  // ── Click handler ─────────────────────────────────────────────────────────

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const nx = (e.clientX - rect.left)  / rect.width;
    const ny = (e.clientY - rect.top)   / rect.height;

    if (phase === "corners" && points.length < 4) {
      const next = [...points, [nx, ny] as [number, number]];
      setPoints(next);
      if (next.length === 4) setPhase("ready");
    } else if (phase === "net" && netPoints.length < 2) {
      const next = [...netPoints, [nx, ny] as [number, number]];
      setNetPoints(next);
      if (next.length === 2) setPhase("ready");
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleReset() {
    setPoints([]); setNetPoints([]);
    setOrientation(null); setManualOverride(false);
    setPhase("corners");
  }

  function handleResetNet() { setNetPoints([]); setPhase("ready"); }

  function handleStartNet() { setPhase("net"); }

  function handleConfirm() {
    if (orientation) {
      onConfirm({
        points,
        orientation,
        netPoints: netPoints.length === 2 ? netPoints : null,
      });
    }
  }

  // ── Computed UI state ─────────────────────────────────────────────────────

  const cornersLeft = 4 - points.length;
  const isNetMode   = phase === "net";
  const hasNet      = netPoints.length === 2;
  const canConfirm  = points.length === 4 && !!orientation && phase !== "net";

  const cursorClass = (phase === "corners" && points.length < 4) || isNetMode
    ? "cursor-crosshair" : "cursor-default";

  let statusText = "";
  if (phase === "corners") {
    statusText = `Clique no canto ${points.length+1} de 4 — ${CORNER_DESCS[points.length]}`;
  } else if (phase === "net" && netPoints.length === 0) {
    statusText = "Clique no poste esquerdo da rede (ou no extremo esq. da linha da rede)";
  } else if (phase === "net" && netPoints.length === 1) {
    statusText = "Agora clique no poste direito da rede";
  } else if (hasNet) {
    statusText = "Rede ajustada manualmente (amarelo). Pronto para analisar.";
  } else {
    statusText = "A linha branca a tracejado indica a estimativa da rede. Verifique se coincide.";
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Instructions + guide */}
      <div className="space-y-2">
        <p className="text-sm text-gray-400">
          Clique nos <strong className="text-white">4 cantos da quadra</strong> na
          ordem mostrada no diagrama. Depois pode ajustar a posição da rede.
        </p>

        {/* Corner guide row */}
        {phase === "corners" && (
          <div className="flex items-center gap-4 py-1">
            <CourtGuide next={points.length} />
            <div className="flex flex-col gap-1">
              {CORNER_DESCS.map((desc, i) => (
                <span key={i} className="flex items-center gap-2 text-xs">
                  <span
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white font-bold text-[10px]"
                    style={{ background: CORNER_COLORS[i], opacity: i < points.length ? 1 : i === points.length ? 1 : 0.3 }}
                  >
                    {i+1}
                  </span>
                  <span className={i < points.length ? "text-gray-500 line-through" : i === points.length ? "text-white font-semibold" : "text-gray-600"}>
                    {desc}
                  </span>
                  {i < points.length && <span className="text-green-500 text-[10px]">✓</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Status text */}
        <p className={`text-xs ${isNetMode ? "text-yellow-400" : points.length === 4 ? "text-gray-300" : "text-gray-500"}`}>
          {statusText}
        </p>

        {/* Orientation toggle — visible after 4 corners */}
        {points.length === 4 && orientation && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Câmera:</span>
            <div className="flex rounded-md overflow-hidden border border-gray-700 text-xs">
              {(["lateral", "fundo"] as CameraOrientation[]).map((o) => (
                <button
                  key={o}
                  onClick={() => { setOrientation(o); setManualOverride(true); }}
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
            {!manualOverride && <span className="text-xs text-green-600">auto-detetado</span>}
          </div>
        )}
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        className={`rounded-lg w-full border border-gray-700 ${cursorClass} ${!imgLoaded ? "bg-gray-900" : ""}`}
        onClick={onClick}
      />

      {/* Net adjustment warning */}
      {points.length === 4 && !hasNet && !isNetMode && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 flex items-center justify-between gap-4">
          <p className="text-xs text-gray-400">
            A linha branca é uma estimativa. Se não coincidir com a rede real,
            ajuste para melhorar a precisão das coordenadas.
          </p>
          <button
            onClick={handleStartNet}
            className="shrink-0 px-3 py-1.5 text-xs bg-yellow-700/40 hover:bg-yellow-700/60 border border-yellow-700/60 text-yellow-300 rounded-md transition-colors whitespace-nowrap"
          >
            Ajustar rede
          </button>
        </div>
      )}

      {/* Net mode active */}
      {isNetMode && (
        <div className="bg-yellow-950/40 border border-yellow-800/50 rounded-lg px-4 py-2 text-xs text-yellow-300 flex items-center justify-between">
          <span>
            {netPoints.length === 0
              ? "Clique no poste / extremo esquerdo da rede"
              : "Agora clique no poste / extremo direito da rede"}
          </span>
          <button onClick={handleResetNet} className="text-gray-500 hover:text-white transition-colors">
            Cancelar
          </button>
        </div>
      )}

      {/* Net adjusted confirmation */}
      {hasNet && (
        <div className="bg-yellow-950/30 border border-yellow-800/40 rounded-lg px-4 py-2 text-xs text-yellow-400 flex items-center justify-between">
          <span>Rede definida manualmente — homografia com 6 pontos ativada.</span>
          <button onClick={handleResetNet} className="text-gray-500 hover:text-white transition-colors">
            Resetar rede
          </button>
        </div>
      )}

      {/* Footer buttons */}
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={handleReset}
          disabled={points.length === 0}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
        >
          Resetar
        </button>
        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-semibold text-sm transition-colors"
        >
          Analisar
        </button>
      </div>
    </div>
  );
}
