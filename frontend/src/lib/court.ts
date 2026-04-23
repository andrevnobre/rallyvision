// Funções partilhadas de desenho de quadra e mapeamento de coordenadas
//
// Sistema de coordenadas normalizadas (câmera lateral):
//   nx ∈ [0,1] → eixo dos 16m (esq=linha de fundo 1, dir=linha de fundo 2)
//   ny ∈ [0,1] → eixo dos 8m  (topo=lateral distante, base=lateral próxima da câmera)
//   Rede: linha vertical em nx=0.5
//   Linha de serviço: linhas verticais em nx=0.3125 e nx=0.6875 (3m da rede)
//   Saque: fora das linhas de fundo (nx<0 e nx>1)

export const PAD = { x: 0.08, y: 0.12 }; // fracção do canvas (inclui zona de saque)

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

  // zonas de saque (fora das linhas de fundo — esquerda e direita)
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(0, py, px, ch);        // zona de saque esq.
  ctx.fillRect(px + cw, py, px, ch);  // zona de saque dir.

  // fundo da quadra
  ctx.fillStyle = "#1a6b3a";
  ctx.fillRect(px, py, cw, ch);

  // contorno da quadra
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px, py, cw, ch);

  // rede — linha vertical ao centro (nx = 0.5)
  ctx.beginPath();
  ctx.moveTo(px + cw / 2, py);
  ctx.lineTo(px + cw / 2, py + ch);
  ctx.stroke();

  // linhas de serviço — verticais a 3m da rede (3/16 = 18.75% de cada metade)
  // nx = 0.5 ± 0.1875  →  0.3125 e 0.6875
  const svcX1 = px + cw * 0.3125;
  const svcX2 = px + cw * 0.6875;
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(svcX1, py);
  ctx.lineTo(svcX1, py + ch);
  ctx.moveTo(svcX2, py);
  ctx.lineTo(svcX2, py + ch);
  ctx.stroke();
  ctx.setLineDash([]);

  // labels de zona
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.font = "9px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // saque: centrado no padding lateral
  ctx.fillText("SAQUE", px / 2, py + ch / 2);
  ctx.fillText("SAQUE", px + cw + px / 2, py + ch / 2);
  // fundo de quadra (entre linha de fundo e linha de serviço)
  ctx.fillText("FUNDO", (px + svcX1) / 2, py + ch / 2);
  ctx.fillText("FUNDO", (svcX2 + px + cw) / 2, py + ch / 2);
}
