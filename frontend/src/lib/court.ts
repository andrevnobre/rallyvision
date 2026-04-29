// Funções partilhadas de desenho de quadra e mapeamento de coordenadas
//
// Sistema de coordenadas normalizadas:
//   nx ∈ [0,1] → eixo horizontal na imagem (left→right)
//   ny ∈ [0,1] → eixo vertical na imagem (top→bottom)
//
// Câmera lateral:  nx = 16m, ny = 8m  → quadra 2:1 (landscape)
// Câmera de fundo: nx = 8m,  ny = 16m → quadra 1:2 (portrait)
//
// O PAD é calculado para manter as proporções reais da quadra no canvas 640×360:
//   lateral: PAD.x=0.08, PAD.y=0.12 → cw/ch ≈ 2.0 ≈ 16/8 ✓
//   fundo:   PAD.x=0.37, PAD.y=0.04 → cw/ch ≈ 0.5 ≈ 8/16 ✓

export type CameraOrientation = "lateral" | "fundo";

export const PADS: Record<CameraOrientation, { x: number; y: number }> = {
  lateral: { x: 0.08, y: 0.12 },
  fundo:   { x: 0.37, y: 0.04 },
};

export const PAD = PADS.lateral; // backwards compat para código antigo

export function detectOrientation(courtRoi: [number, number][] | null): CameraOrientation {
  if (!courtRoi || courtRoi.length < 4) return "lateral";
  const xs = courtRoi.map((p) => p[0]);
  const ys = courtRoi.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return w >= h ? "lateral" : "fundo";
}

export function courtToCanvas(
  nx: number,
  ny: number,
  W: number,
  H: number,
  orientation: CameraOrientation = "lateral",
): [number, number] {
  const { x: padX, y: padY } = PADS[orientation];
  const px = W * padX;
  const py = H * padY;
  return [px + nx * (W - px * 2), py + ny * (H - py * 2)];
}

export function canvasToCourt(
  px: number,
  py: number,
  W: number,
  H: number,
  orientation: CameraOrientation = "lateral",
): [number, number] {
  const { x: padX, y: padY } = PADS[orientation];
  const nx = (px / W - padX) / (1 - 2 * padX);
  const ny = (py / H - padY) / (1 - 2 * padY);
  return [Math.max(0, Math.min(1, nx)), Math.max(0, Math.min(1, ny))];
}

export function pixelToCanvas(
  cx: number,
  cy: number,
  frameW: number,
  frameH: number,
  W: number,
  H: number,
  orientation: CameraOrientation = "lateral",
): [number, number] {
  return courtToCanvas(cx / frameW, cy / frameH, W, H, orientation);
}

export function drawCourt(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  orientation: CameraOrientation = "lateral",
) {
  const { x: padX, y: padY } = PADS[orientation];
  const px = W * padX;
  const py = H * padY;
  const cw = W - px * 2;
  const ch = H - py * 2;

  if (orientation === "lateral") {
    // eixo 16m = horizontal (nx), eixo 8m = vertical (ny)
    // saque: fora das linhas de fundo (esq/dir)
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, py, px, ch);
    ctx.fillRect(px + cw, py, px, ch);

    ctx.fillStyle = "#1a6b3a";
    ctx.fillRect(px, py, cw, ch);

    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px, py, cw, ch);

    // rede vertical em nx=0.5
    ctx.beginPath();
    ctx.moveTo(px + cw / 2, py);
    ctx.lineTo(px + cw / 2, py + ch);
    ctx.stroke();

    // linhas de serviço verticais em nx=0.3125 e nx=0.6875
    const svcX1 = px + cw * 0.3125;
    const svcX2 = px + cw * 0.6875;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(svcX1, py); ctx.lineTo(svcX1, py + ch);
    ctx.moveTo(svcX2, py); ctx.lineTo(svcX2, py + ch);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SAQUE", px / 2, py + ch / 2);
    ctx.fillText("SAQUE", px + cw + px / 2, py + ch / 2);
    ctx.fillText("FUNDO", (px + svcX1) / 2, py + ch / 2);
    ctx.fillText("FUNDO", (svcX2 + px + cw) / 2, py + ch / 2);
  } else {
    // câmera de fundo: eixo 16m = vertical (ny), eixo 8m = horizontal (nx)
    // saque: fora das linhas de fundo (topo/base)
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(px, 0, cw, py);
    ctx.fillRect(px, py + ch, cw, py);

    ctx.fillStyle = "#1a6b3a";
    ctx.fillRect(px, py, cw, ch);

    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px, py, cw, ch);

    // rede horizontal em ny=0.5
    ctx.beginPath();
    ctx.moveTo(px, py + ch / 2);
    ctx.lineTo(px + cw, py + ch / 2);
    ctx.stroke();

    // linhas de serviço horizontais em ny=0.3125 e ny=0.6875
    const svcY1 = py + ch * 0.3125;
    const svcY2 = py + ch * 0.6875;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, svcY1); ctx.lineTo(px + cw, svcY1);
    ctx.moveTo(px, svcY2); ctx.lineTo(px + cw, svcY2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SAQUE", px + cw / 2, py / 2);
    ctx.fillText("SAQUE", px + cw / 2, py + ch + py / 2);
    ctx.fillText("FUNDO", px + cw / 2, (py + svcY1) / 2);
    ctx.fillText("FUNDO", px + cw / 2, (svcY2 + py + ch) / 2);
  }
}
