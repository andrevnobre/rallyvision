"""
Pipeline de análise de vídeo: deteção combinada de bola + jogadores.
Aceita court_roi opcional (4 pontos normalizados [0,1]) para filtrar deteções
à quadra e normalizar posições via homografia.
"""
import logging
import time
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

logger = logging.getLogger(__name__)

BALL_CONF = 0.3
PLAYER_CONF = 0.3
SAMPLE_RATE = 2  # processa 1 em cada 2 frames (30fps efetivo em vídeo 60fps)
LOG_INTERVAL = 50  # linhas de log a cada N frames processados
PLAYER_PROXY_PX = 220  # distância máxima (px) para usar ny do jogador como proxy de profundidade da bola

MODELS_DIR = Path("/ml/spike")
BALL_WEIGHTS = MODELS_DIR / "ball_yolo.pt"
PLAYER_WEIGHTS = "yolov8s.pt"


def _detect_orientation(court_roi: list[list[float]]) -> str:
    """lateral: eixo 16m é horizontal (nx). fundo: eixo 16m é vertical (ny)."""
    xs = [p[0] for p in court_roi]
    ys = [p[1] for p in court_roi]
    return "lateral" if (max(xs) - min(xs)) >= (max(ys) - min(ys)) else "fundo"


def _sort_corners(pts: np.ndarray) -> np.ndarray:
    """
    Ordena 4 cantos em: topo-esq, topo-dir, base-dir, base-esq.
    Robusto à ordem de clique do utilizador.
    """
    by_y = pts[np.argsort(pts[:, 1])]          # ordena por y (topo = y menor)
    top = by_y[:2][np.argsort(by_y[:2, 0])]    # par de cima: esq → dir
    bot = by_y[2:][np.argsort(by_y[2:, 0])]    # par de baixo: esq → dir
    return np.array([top[0], top[1], bot[1], bot[0]])  # TL, TR, BR, BL


def _build_homography(
    court_roi: list[list[float]], width: int, height: int
) -> tuple[np.ndarray, np.ndarray]:
    raw = np.float32([[nx * width, ny * height] for nx, ny in court_roi])
    src = _sort_corners(raw)                   # garante ordem TL→TR→BR→BL
    dst = np.float32([[0, 0], [1, 0], [1, 1], [0, 1]])
    H, _ = cv2.findHomography(src, dst)
    return src.astype(np.int32), H


def _normalize(cx: int, cy: int, H: np.ndarray) -> tuple[float, float]:
    pt = cv2.perspectiveTransform(np.float32([[[cx, cy]]]), H)[0][0]
    return round(float(pt[0]), 4), round(float(pt[1]), 4)


def run_pipeline(
    video_path: Path,
    court_roi: list[list[float]] | None = None,
    progress_cb: Callable[[int], None] | None = None,
) -> dict:
    from ultralytics import YOLO

    if not BALL_WEIGHTS.exists():
        raise FileNotFoundError(f"Pesos não encontrados: {BALL_WEIGHTS}")

    # --- carregar modelos ---
    logger.info("A carregar modelos YOLO...")
    t0 = time.time()
    ball_model = YOLO(str(BALL_WEIGHTS))
    player_model = YOLO(PLAYER_WEIGHTS)
    logger.info(f"Modelos carregados em {time.time() - t0:.1f}s")

    # --- abrir vídeo ---
    cap = cv2.VideoCapture(str(video_path))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration_s = round(total_frames / fps, 1) if fps else 0

    logger.info(
        f"Vídeo: {width}x{height} @ {fps:.1f}fps | "
        f"{total_frames} frames ({duration_s}s) | "
        f"sample_rate=1/{SAMPLE_RATE} → ~{total_frames // SAMPLE_RATE} frames a processar"
    )

    # --- orientação da câmera e ROI / homografia ---
    camera_orientation = _detect_orientation(court_roi) if court_roi else "lateral"
    logger.info(f"Orientação da câmera detectada: {camera_orientation}")

    if court_roi:
        roi_pts, H = _build_homography(court_roi, width, height)
        roi_px = [(int(nx * width), int(ny * height)) for nx, ny in court_roi]
        # margem para zona de saque: ~15% da altura da quadra em píxeis
        court_h_px = max(p[1] for p in roi_px) - min(p[1] for p in roi_px)
        roi_margin_px = int(court_h_px * 0.15)
        logger.info(f"ROI definida: {roi_px} | margem jogadores: {roi_margin_px}px | homografia ativada")
    else:
        roi_pts = np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=np.int32)
        roi_margin_px = 0
        H = None
        logger.info("ROI: frame completo (sem homografia)")

    stats = {
        "fps": fps,
        "total_frames": total_frames,
        "duration_s": duration_s,
        "width": width,
        "height": height,
        "processed_frames": 0,
        "frames_with_ball": 0,
        "frames_with_1_player": 0,
        "frames_with_2_players": 0,
        "frames_with_ball_and_2_players": 0,
        "ball_confidences": [],
        "player_confidences": [],
        "ball_positions": [],
        "player_positions": {},
    }

    frame_idx = 0
    start = time.time()
    last_progress = -1
    last_log_pf = 0

    logger.info("Iniciando loop de deteção...")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1

        if frame_idx % SAMPLE_RATE != 0:
            continue

        # --- bola (sem filtro de ROI — a bola voa acima da quadra) ---
        ball_results = ball_model(frame, conf=BALL_CONF, verbose=False)[0]
        balls = []
        for box in ball_results.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            balls.append({"cx": cx, "cy": cy, "conf": round(float(box.conf), 3)})

        # --- jogadores: filtrar por ROI expandida para incluir zona de saque ---
        player_results = player_model.track(
            frame, persist=True, tracker="bytetrack.yaml",
            classes=[0], conf=PLAYER_CONF, verbose=False,
        )[0]
        players = []
        if player_results.boxes.id is not None:
            for box, tid in zip(player_results.boxes, player_results.boxes.id):
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                fx, fy = (x1 + x2) // 2, y2  # pés do jogador
                # ROI expandida: jogadores podem estar fora da quadra no saque
                dist = cv2.pointPolygonTest(roi_pts, (float(fx), float(fy)), measureDist=True)
                if dist >= -roi_margin_px:
                    players.append({
                        "id": int(tid),
                        "cx": fx,
                        "cy": fy,
                        "conf": round(float(box.conf), 3),
                    })

        # --- acumular stats ---
        pf = stats["processed_frames"] + 1
        stats["processed_frames"] = pf

        if balls:
            stats["frames_with_ball"] += 1
            stats["ball_confidences"].append(balls[0]["conf"])
            pos = {"frame": frame_idx, **balls[0]}
            if H is not None:
                bx, by = balls[0]["cx"], balls[0]["cy"]
                nx, ny = _normalize(bx, by, H)
                pos["nx"], pos["ny"] = round(nx, 4), round(ny, 4)

                # proxy de profundidade: a câmera não capta bem o eixo de profundidade da bola no ar.
                # lateral → eixo ambíguo é ny; fundo → eixo ambíguo é nx.
                if players:
                    nearest = min(players, key=lambda p: (p["cx"] - bx) ** 2 + (p["cy"] - by) ** 2)
                    dist_px = ((nearest["cx"] - bx) ** 2 + (nearest["cy"] - by) ** 2) ** 0.5
                    if dist_px <= PLAYER_PROXY_PX:
                        player_nx, player_ny = _normalize(nearest["cx"], nearest["cy"], H)
                        if camera_orientation == "fundo":
                            pos["nx"] = round(max(0.0, min(1.0, player_nx)), 4)
                        else:
                            pos["ny"] = round(max(0.0, min(1.0, player_ny)), 4)
                        pos["proxy"] = True
                        pos["proxy_player_id"] = str(nearest["id"])
                        pos["proxy_dist_px"] = round(dist_px, 1)

            stats["ball_positions"].append(pos)

        if len(players) >= 1:
            stats["frames_with_1_player"] += 1
        if len(players) >= 2:
            stats["frames_with_2_players"] += 1
            stats["player_confidences"].extend(p["conf"] for p in players)
        if balls and len(players) >= 2:
            stats["frames_with_ball_and_2_players"] += 1

        for p in players:
            tid = str(p["id"])
            entry = {"frame": frame_idx, "cx": p["cx"], "cy": p["cy"]}
            if H is not None:
                nx, ny = _normalize(p["cx"], p["cy"], H)
                entry["nx"], entry["ny"] = max(0.0, min(1.0, nx)), max(0.0, min(1.0, ny))
            stats["player_positions"].setdefault(tid, []).append(entry)

        # --- progresso ---
        pct = int(frame_idx / total_frames * 100)
        if pct != last_progress and progress_cb:
            progress_cb(pct)
            last_progress = pct

        # --- log periódico ---
        if pf == 1 or pf - last_log_pf >= LOG_INTERVAL:
            elapsed = time.time() - start
            fps_proc = pf / elapsed if elapsed > 0 else 0
            eta_s = int((total_frames // SAMPLE_RATE - pf) / fps_proc) if fps_proc > 0 else 0
            ball_pct = stats["frames_with_ball"] / pf * 100
            p2_pct = stats["frames_with_2_players"] / pf * 100
            avg_ball_conf = (
                sum(stats["ball_confidences"]) / len(stats["ball_confidences"])
                if stats["ball_confidences"] else 0
            )
            logger.info(
                f"[{pct:3d}%] frame {frame_idx}/{total_frames} | "
                f"proc {pf} frames ({fps_proc:.1f} fps) | "
                f"ETA ~{eta_s}s | "
                f"bola {ball_pct:.0f}% (conf {avg_ball_conf:.2f}) | "
                f"2 jogadores {p2_pct:.0f}%"
            )
            last_log_pf = pf

    cap.release()

    pf = stats["processed_frames"]
    elapsed = time.time() - start
    ball_pct = round(stats["frames_with_ball"] / pf * 100, 1) if pf else 0
    p2_pct = round(stats["frames_with_2_players"] / pf * 100, 1) if pf else 0
    usable_pct = round(stats["frames_with_ball_and_2_players"] / pf * 100, 1) if pf else 0
    avg_ball = round(float(np.mean(stats["ball_confidences"])), 3) if stats["ball_confidences"] else 0
    avg_player = round(float(np.mean(stats["player_confidences"])), 3) if stats["player_confidences"] else 0

    logger.info(
        f"Concluído em {elapsed:.1f}s ({elapsed / duration_s:.1f}x tempo real) | "
        f"bola {ball_pct}% (conf {avg_ball}) | "
        f"2 jogadores {p2_pct}% (conf {avg_player}) | "
        f"utilizáveis {usable_pct}% | "
        f"{len(stats['ball_positions'])} pts bola | "
        f"jogadores rastreados: {list(stats['player_positions'].keys())}"
    )

    return {
        "fps": stats["fps"],
        "total_frames": stats["total_frames"],
        "duration_s": stats["duration_s"],
        "resolution": f"{width}x{height}",
        "court_roi": court_roi,
        "camera_orientation": camera_orientation,
        "ball_detection_pct": ball_pct,
        "player_1_detection_pct": round(stats["frames_with_1_player"] / pf * 100, 1) if pf else 0,
        "player_2_detection_pct": p2_pct,
        "usable_frames_pct": usable_pct,
        "avg_ball_conf": avg_ball,
        "avg_player_conf": avg_player,
        "processing_time_s": round(elapsed, 1),
        "ball_positions": stats["ball_positions"],
        "player_positions": stats["player_positions"],
    }
