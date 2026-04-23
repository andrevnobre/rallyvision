// Funções partilhadas de desenho de quadra e mapeamento de coordenadas

export const PAD = { x: 0.06, y: 0.15 }; // fracção do canvas

export function courtToCanvas(
  nx: number,
  ny: number,
  W: number,
  H: number,
): [number, number] {
  const px = W * PAD.x;
  const py = H * PAD.y;
  return [px + nx * (W - px * 2), py + ny * (H - py * 2)];
}

export function pixelToCanvas(
  cx: number,
  cy: number,
  frameW: number,
  frameH: number,
  W: number,
  H: number,
): [number, number] {
  return courtToCanvas(cx / frameW, cy / frameH, W, H);
}

export function drawCourt(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const px = W * PAD.x;
  const py = H * PAD.y;
  const cw = W - px * 2;
  const ch = H - py * 2;

  // zona lob / saque
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(px, py - H * 0.1, cw, H * 0.1);
  ctx.fillRect(px, py + ch, cw, H * 0.1);

  // fundo da quadra
  ctx.fillStyle = "#1a6b3a";
  ctx.fillRect(px, py, cw, ch);

  // linhas
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px, py, cw, ch);

  // rede
  ctx.beginPath();
  ctx.moveTo(px + cw / 2, py);
  ctx.lineTo(px + cw / 2, py + ch);
  ctx.stroke();

  // linhas de serviço (3m / 16m ≈ 18.75%)
  const svc = ch * 0.1875;
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, py + svc);
  ctx.lineTo(px + cw, py + svc);
  ctx.moveTo(px, py + ch - svc);
  ctx.lineTo(px + cw, py + ch - svc);
  ctx.stroke();
  ctx.setLineDash([]);

  // labels
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("LOB", px + cw / 2, py - 5);
  ctx.fillText("SAQUE", px + cw / 4, py + ch + 13);
  ctx.fillText("SAQUE", px + (cw * 3) / 4, py + ch + 13);
}
