import type { VideoResult } from "./api";
import {
  courtToCanvas,
  detectOrientation,
  drawCourt,
  pixelToCanvas,
  type CameraOrientation,
} from "./court";

const FRAME_W = 1920;
const FRAME_H = 1080;

const PLAYER_COLORS_RGB: [number, number, number][] = [
  [59, 130, 246],
  [249, 115, 22],
  [168, 85, 247],
  [34, 197, 94],
];

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function renderBallCanvas(
  positions: VideoResult["ball_positions"],
  courtRoi: VideoResult["court_roi"],
  orientation: CameraOrientation,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  const normalized = courtRoi !== null && positions.some((p) => p.nx !== undefined);

  ctx.fillStyle = "#0f2417";
  ctx.fillRect(0, 0, W, H);
  drawCourt(ctx, W, H, orientation);

  positions
    .filter(({ nx, ny }) =>
      !normalized || nx === undefined || (nx >= 0 && nx <= 1 && ny! >= 0 && ny! <= 1),
    )
    .forEach(({ cx, cy, conf, nx, ny, proxy }) => {
      const [x, y] =
        normalized && nx !== undefined
          ? courtToCanvas(nx, ny!, W, H, orientation)
          : pixelToCanvas(cx, cy, FRAME_W, FRAME_H, W, H, orientation);

      const radius = (4 + conf * 8) * 1.5;
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

  return canvas.toDataURL("image/png");
}

function renderPlayerCanvas(
  positions: VideoResult["player_positions"],
  courtRoi: VideoResult["court_roi"],
  orientation: CameraOrientation,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  const players = Object.entries(positions)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 4);
  const normalized =
    courtRoi !== null &&
    players.some(([, frames]) => frames.some((f) => f.nx !== undefined));

  ctx.fillStyle = "#0f2417";
  ctx.fillRect(0, 0, W, H);
  drawCourt(ctx, W, H, orientation);

  players.forEach(([, frames], i) => {
    const [r, g, b] = PLAYER_COLORS_RGB[i % PLAYER_COLORS_RGB.length];
    const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    frames.forEach(({ cx, cy, nx, ny }) => {
      const [x, y] =
        normalized && nx !== undefined
          ? courtToCanvas(nx, ny!, W, H, orientation)
          : pixelToCanvas(cx, cy, FRAME_W, FRAME_H, W, H, orientation);

      const grd = ctx.createRadialGradient(x, y, 0, x, y, 21);
      grd.addColorStop(0, hex + "99");
      grd.addColorStop(1, hex + "00");
      ctx.beginPath();
      ctx.arc(x, y, 21, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = hex + "cc";
      ctx.fill();
    });
  });

  return canvas.toDataURL("image/png");
}

export async function exportToPdf(
  filename: string,
  createdAt: string,
  result: VideoResult,
) {
  const { jsPDF } = await import("jspdf");

  const camOrientation = result.camera_orientation ?? detectOrientation(result.court_roi);
  const ballImg = renderBallCanvas(result.ball_positions, result.court_roi, camOrientation);
  const playerImg = renderPlayerCanvas(result.player_positions, result.court_roi, camOrientation);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210;
  const PH = 297;
  const M = 15;
  const CW = PW - M * 2; // 180mm

  // Heatmap dimensions preserving 16:9 ratio
  const HM_W = CW;
  const HM_H = HM_W * (540 / 960); // = 101.25mm

  const GREEN: [number, number, number] = [22, 163, 74];
  const DARK: [number, number, number] = [17, 24, 39];
  const TEXT_MUTED: [number, number, number] = [107, 114, 128];
  const TEXT_DIM: [number, number, number] = [156, 163, 175];
  const BORDER: [number, number, number] = [229, 231, 235];

  function statCard(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
    sub: string,
    valueColor: [number, number, number] = DARK,
  ) {
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(x, y, w, h, 2, 2, "F");
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, w, h, 2, 2, "S");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(label, x + 4, y + 5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...valueColor);
    doc.text(value, x + 4, y + 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...TEXT_DIM);
    doc.text(sub, x + 4, y + 18.5);
  }

  function sectionDivider(y: number) {
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(M, y, PW - M, y);
  }

  function sectionLabel(label: string, y: number) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_DIM);
    doc.text(label, M, y);
  }

  function pageFooter(pageNum: number, totalPages: number) {
    sectionDivider(PH - 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...TEXT_DIM);
    doc.text(
      `Gerado por BT Vision · Processado em ${result.processing_time_s}s`,
      M,
      PH - 8,
    );
    doc.text(`${pageNum} / ${totalPages}`, PW - M, PH - 8, { align: "right" });
  }

  // Draw a rally table starting at y, returns final y after table
  function rallyTable(
    startY: number,
    fromIdx: number,
    maxY: number,
  ): { y: number; nextIdx: number } {
    if (!result.rallies || result.rallies.length === 0) return { y: startY, nextIdx: 0 };

    const colWidths = [15, 28, 28, 28, 38];
    const colLabels = ["Rally", "Início (s)", "Fim (s)", "Duração (s)", "Deteções bola"];
    const ROW_H = 6.5;

    let y = startY;

    // Header row
    doc.setFillColor(243, 244, 246);
    doc.rect(M, y, CW, ROW_H, "F");
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.15);
    doc.rect(M, y, CW, ROW_H, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(75, 85, 99);
    let cx = M + 3;
    colLabels.forEach((col, i) => {
      doc.text(col, cx, y + 4.3);
      cx += colWidths[i];
    });
    y += ROW_H;

    let i = fromIdx;
    while (i < result.rallies.length && y + ROW_H <= maxY) {
      const rally = result.rallies[i];
      if (i % 2 === 1) {
        doc.setFillColor(249, 250, 251);
        doc.rect(M, y, CW, ROW_H, "F");
      }
      doc.setDrawColor(243, 244, 246);
      doc.setLineWidth(0.1);
      doc.line(M, y + ROW_H, M + CW, y + ROW_H);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...DARK);
      const vals = [
        `${rally.rally_id + 1}`,
        `${(rally.start_frame / result.fps).toFixed(1)}`,
        `${(rally.end_frame / result.fps).toFixed(1)}`,
        `${rally.duration_s.toFixed(1)}`,
        `${rally.ball_detections}`,
      ];
      cx = M + 3;
      vals.forEach((val, j) => {
        doc.text(val, cx, y + 4.3);
        cx += colWidths[j];
      });
      y += ROW_H;
      i++;
    }

    return { y, nextIdx: i };
  }

  // ─── PAGE 1 ────────────────────────────────────────────────────────────────

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PW, PH, "F");

  let y = M;

  // Header
  doc.setFillColor(...GREEN);
  doc.circle(M + 3, y + 3.5, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...DARK);
  doc.text("BT Vision", M + 9, y + 5.5);

  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(55, 65, 81);
  doc.text(filename, M, y);

  y += 6;
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_MUTED);
  const dateStr = new Date(createdAt).toLocaleDateString("pt-PT");
  doc.text(
    `Analisado em ${dateStr} · ${fmtDuration(result.duration_s)} · ${result.resolution} · ${Math.round(result.fps)} fps`,
    M,
    y,
  );

  y += 5;
  sectionDivider(y);
  y += 8;

  // Stats section
  sectionLabel("MÉTRICAS DE DETEÇÃO", y);
  y += 5;

  const CARD_W = (CW - 9) / 4;
  const CARD_H = 21;

  statCard(M + 0 * (CARD_W + 3), y, CARD_W, CARD_H, "Bola detetada", `${result.ball_detection_pct}%`, `conf. média ${result.avg_ball_conf}`, GREEN);
  statCard(M + 1 * (CARD_W + 3), y, CARD_W, CARD_H, "2 Jogadores", `${result.player_2_detection_pct}%`, `conf. média ${result.avg_player_conf}`);
  statCard(M + 2 * (CARD_W + 3), y, CARD_W, CARD_H, "Frames utilizáveis", `${result.usable_frames_pct}%`, "bola + 2 jogadores");
  statCard(M + 3 * (CARD_W + 3), y, CARD_W, CARD_H, "Duração", fmtDuration(result.duration_s), `${result.total_frames} fr · ${Math.round(result.fps)} fps`);
  y += CARD_H + 4;

  if (result.rally_count !== undefined && result.rallies) {
    const rallyList = result.rallies;
    const minR = rallyList.length > 0 ? Math.min(...rallyList.map((r) => r.duration_s)) : null;
    const maxR = rallyList.length > 0 ? Math.max(...rallyList.map((r) => r.duration_s)) : null;
    statCard(M + 0 * (CARD_W + 3), y, CARD_W, CARD_H, "Rallies detetados", `${result.rally_count}`, "segmentos contínuos", GREEN);
    statCard(M + 1 * (CARD_W + 3), y, CARD_W, CARD_H, "Duração média rally", `${result.avg_rally_duration_s}s`, minR !== null ? `${minR}s – ${maxR}s` : "—");
    y += CARD_H + 4;
  }

  y += 4;

  // Ball heatmap
  sectionLabel("TRAJETÓRIA DA BOLA", y);
  y += 5;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, HM_W, HM_H, 2, 2, "S");
  doc.addImage(ballImg, "PNG", M, y, HM_W, HM_H);
  y += HM_H + 8;

  // Rally table on page 1 if there's room
  let rallyNextIdx = 0;
  if (result.rallies && result.rallies.length > 0) {
    sectionDivider(y);
    y += 7;
    sectionLabel("RALLIES DETETADOS", y);
    y += 6;
    const { y: afterTable, nextIdx } = rallyTable(y, 0, PH - 16);
    y = afterTable;
    rallyNextIdx = nextIdx;
  }

  pageFooter(1, 2);

  // ─── PAGE 2 ────────────────────────────────────────────────────────────────

  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PW, PH, "F");

  y = M;

  // Mini header
  doc.setFillColor(...GREEN);
  doc.circle(M + 2.5, y + 2.5, 2.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text("BT Vision", M + 7, y + 4.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(filename, M + 32, y + 4.5, { maxWidth: PW - M - 32 - M });

  y += 8;
  sectionDivider(y);
  y += 8;

  // Player heatmap
  sectionLabel("POSICIONAMENTO DOS JOGADORES", y);
  y += 5;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, HM_W, HM_H, 2, 2, "S");
  doc.addImage(playerImg, "PNG", M, y, HM_W, HM_H);
  y += HM_H + 5;

  // Player legend
  const playersSorted = Object.entries(result.player_positions)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 4);

  playersSorted.forEach(([, frames], i) => {
    const [r, g, b] = PLAYER_COLORS_RGB[i];
    doc.setFillColor(r, g, b);
    doc.circle(M + i * 44 + 3, y - 1, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Jogador ${i + 1} (${frames.length} pts)`, M + i * 44 + 7, y);
  });
  y += 9;

  // Continued rally table (rows that didn't fit on page 1)
  if (result.rallies && rallyNextIdx < result.rallies.length) {
    sectionDivider(y);
    y += 7;
    sectionLabel("RALLIES DETETADOS (continuação)", y);
    y += 6;
    rallyTable(y, rallyNextIdx, PH - 16);
  }

  pageFooter(2, 2);

  const safeName = filename.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/gi, "_");
  doc.save(`rallyvision_${safeName}.pdf`);
}
