"""
Pipeline de análise de vídeo: deteção combinada de bola + jogadores.
Wrapper assíncrono-friendly do combined_spike.py para uso no worker Celery.
"""
import json
import time
from collections import deque
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

BALL_CONF = 0.3
PLAYER_CONF = 0.3
SAMPLE_RATE = 2  # processa 1 em cada 2 frames (30fps efetivo em vídeo 60fps)

MODELS_DIR = Path("/ml/spike")
BALL_WEIGHTS = MODELS_DIR / "ball_yolo.pt"
PLAYER_WEIGHTS = "yolov8s.pt"


def run_pipeline(
    video_path: Path,
    progress_cb: Callable[[int], None] | None = None,
) -> dict:
    """
    Executa deteção de bola + jogadores num vídeo.

    Args:
        video_path: caminho local para o ficheiro de vídeo
        progress_cb: chamada com percentagem (0-100) durante o processamento

    Returns:
        dict com stats de deteção + posições para heatmap
    """
    from ultralytics import YOLO

    if not BALL_WEIGHTS.exists():
        raise FileNotFoundError(f"Pesos não encontrados: {BALL_WEIGHTS}")

    ball_model = YOLO(str(BALL_WEIGHTS))
    player_model = YOLO(PLAYER_WEIGHTS)

    cap = cv2.VideoCapture(str(video_path))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # ROI = frame completo (deteção de quadra via homografia vem na fase seguinte)
    roi_pts = np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=np.int32)

    stats = {
        "fps": fps,
        "total_frames": total_frames,
        "duration_s": round(total_frames / fps, 1) if fps else 0,
        "width": width,
        "height": height,
        "processed_frames": 0,
        "frames_with_ball": 0,
        "frames_with_1_player": 0,
        "frames_with_2_players": 0,
        "frames_with_ball_and_2_players": 0,
        "ball_confidences": [],
        "player_confidences": [],
        # posições amostradas para heatmap (1 em cada 10 frames processados)
        "ball_positions": [],     # [{frame, x, y, conf}]
        "player_positions": {},   # {track_id: [{frame, cx, cy}]}
    }

    frame_idx = 0
    start = time.time()
    last_progress = -1

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1

        if frame_idx % SAMPLE_RATE != 0:
            continue

        # --- bola ---
        ball_results = ball_model(frame, conf=BALL_CONF, verbose=False)[0]
        balls = []
        for box in ball_results.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            if cv2.pointPolygonTest(roi_pts, (float(cx), float(cy)), False) >= 0:
                balls.append({"cx": cx, "cy": cy, "conf": round(float(box.conf), 3)})

        # --- jogadores (ByteTrack) ---
        player_results = player_model.track(
            frame, persist=True, tracker="bytetrack.yaml",
            classes=[0], conf=PLAYER_CONF, verbose=False,
        )[0]
        players = []
        if player_results.boxes.id is not None:
            for box, tid in zip(player_results.boxes, player_results.boxes.id):
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                players.append({
                    "id": int(tid),
                    "cx": (x1 + x2) // 2,
                    "cy": (y1 + y2) // 2,
                    "conf": round(float(box.conf), 3),
                })

        # --- acumular stats ---
        pf = stats["processed_frames"] + 1
        stats["processed_frames"] = pf

        if balls:
            stats["frames_with_ball"] += 1
            stats["ball_confidences"].append(balls[0]["conf"])
            if pf % 10 == 0:
                stats["ball_positions"].append({"frame": frame_idx, **balls[0]})

        if len(players) >= 1:
            stats["frames_with_1_player"] += 1
        if len(players) >= 2:
            stats["frames_with_2_players"] += 1
            stats["player_confidences"].extend(p["conf"] for p in players)
        if balls and len(players) >= 2:
            stats["frames_with_ball_and_2_players"] += 1

        if pf % 10 == 0:
            for p in players:
                tid = str(p["id"])
                stats["player_positions"].setdefault(tid, []).append(
                    {"frame": frame_idx, "cx": p["cx"], "cy": p["cy"]}
                )

        # --- progresso ---
        pct = int(frame_idx / total_frames * 100)
        if pct != last_progress and progress_cb:
            progress_cb(pct)
            last_progress = pct

    cap.release()

    pf = stats["processed_frames"]
    result = {
        "fps": stats["fps"],
        "total_frames": stats["total_frames"],
        "duration_s": stats["duration_s"],
        "resolution": f"{width}x{height}",
        "ball_detection_pct": round(stats["frames_with_ball"] / pf * 100, 1) if pf else 0,
        "player_1_detection_pct": round(stats["frames_with_1_player"] / pf * 100, 1) if pf else 0,
        "player_2_detection_pct": round(stats["frames_with_2_players"] / pf * 100, 1) if pf else 0,
        "usable_frames_pct": round(stats["frames_with_ball_and_2_players"] / pf * 100, 1) if pf else 0,
        "avg_ball_conf": round(float(np.mean(stats["ball_confidences"])), 3) if stats["ball_confidences"] else 0,
        "avg_player_conf": round(float(np.mean(stats["player_confidences"])), 3) if stats["player_confidences"] else 0,
        "processing_time_s": round(time.time() - start, 1),
        "ball_positions": stats["ball_positions"],
        "player_positions": stats["player_positions"],
    }
    return result
