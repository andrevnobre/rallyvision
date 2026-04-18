"""
Spike: YOLOv8 out-of-the-box detection on beach tennis videos.

Usage:
    python detect.py --video path/to/video.mp4
    python detect.py --video path/to/video.mp4 --model yolov8m  # mais preciso, mais lento
    python detect.py --video path/to/video.mp4 --no-output      # só stats, sem vídeo anotado
"""

import argparse
import json
import time
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

# Classes COCO relevantes para beach tennis
PERSON_CLASS = 0
BALL_CLASS = 32  # "sports ball" no COCO

COLORS = {
    "person": (0, 200, 100),
    "ball": (0, 100, 255),
}


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--video", required=True, help="Caminho para o vídeo de entrada")
    p.add_argument("--model", default="yolov8s", help="Modelo YOLOv8 (n/s/m/l/x)")
    p.add_argument("--conf", type=float, default=0.3, help="Confiança mínima de detecção")
    p.add_argument("--no-output", action="store_true", help="Não gerar vídeo anotado")
    p.add_argument("--sample-rate", type=int, default=1, help="Processar 1 a cada N frames")
    return p.parse_args()


def run_spike(args):
    video_path = Path(args.video)
    if not video_path.exists():
        raise FileNotFoundError(f"Vídeo não encontrado: {video_path}")

    print(f"\n{'='*60}")
    print(f"RallyVision — Spike de Detecção YOLOv8")
    print(f"{'='*60}")
    print(f"Vídeo  : {video_path.name}")
    print(f"Modelo : {args.model}")
    print(f"Conf   : {args.conf}")
    print(f"{'='*60}\n")

    print(f"Carregando modelo {args.model}...")
    model = YOLO(f"{args.model}.pt")

    cap = cv2.VideoCapture(str(video_path))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    print(f"Vídeo  : {width}x{height} @ {fps:.1f} fps — {total_frames} frames ({total_frames/fps:.1f}s)\n")

    out = None
    if not args.no_output:
        out_path = video_path.parent / f"{video_path.stem}_annotated.mp4"
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out = cv2.VideoWriter(str(out_path), fourcc, fps, (width, height))

    stats = {
        "video": video_path.name,
        "model": args.model,
        "conf_threshold": args.conf,
        "total_frames": total_frames,
        "processed_frames": 0,
        "frames_with_ball": 0,
        "frames_with_players": 0,
        "frames_with_2_players": 0,
        "ball_confidences": [],
        "player_confidences": [],
        "processing_time_s": 0,
    }

    start = time.time()
    frame_idx = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1

        if frame_idx % args.sample_rate != 0:
            if out:
                out.write(frame)
            continue

        results = model(frame, classes=[PERSON_CLASS, BALL_CLASS], conf=args.conf, verbose=False)[0]

        persons = []
        balls = []

        for box in results.boxes:
            cls = int(box.cls)
            conf = float(box.conf)
            x1, y1, x2, y2 = map(int, box.xyxy[0])

            if cls == PERSON_CLASS:
                persons.append((x1, y1, x2, y2, conf))
                stats["player_confidences"].append(conf)
            elif cls == BALL_CLASS:
                balls.append((x1, y1, x2, y2, conf))
                stats["ball_confidences"].append(conf)

        stats["processed_frames"] += 1
        if balls:
            stats["frames_with_ball"] += 1
        if persons:
            stats["frames_with_players"] += 1
        if len(persons) >= 2:
            stats["frames_with_2_players"] += 1

        if out:
            annotated = frame.copy()
            for (x1, y1, x2, y2, conf) in persons:
                cv2.rectangle(annotated, (x1, y1), (x2, y2), COLORS["person"], 2)
                cv2.putText(annotated, f"player {conf:.2f}", (x1, y1 - 6),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLORS["person"], 1)
            for (x1, y1, x2, y2, conf) in balls:
                cv2.rectangle(annotated, (x1, y1), (x2, y2), COLORS["ball"], 2)
                cv2.putText(annotated, f"ball {conf:.2f}", (x1, y1 - 6),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLORS["ball"], 1)
            out.write(annotated)

        if frame_idx % 100 == 0:
            elapsed = time.time() - start
            pct = frame_idx / total_frames * 100
            print(f"  Frame {frame_idx}/{total_frames} ({pct:.0f}%) — "
                  f"bola: {len(balls)} | jogadores: {len(persons)} | {elapsed:.1f}s")

    cap.release()
    if out:
        out.release()

    stats["processing_time_s"] = round(time.time() - start, 2)
    _print_report(stats, fps)

    report_path = video_path.parent / f"{video_path.stem}_spike_report.json"
    with open(report_path, "w") as f:
        json.dump(stats, f, indent=2)
    print(f"\nRelatório salvo em: {report_path}")
    if not args.no_output:
        print(f"Vídeo anotado em : {out_path}")


def _print_report(stats: dict, fps: float):
    pf = stats["processed_frames"]
    ball_pct = stats["frames_with_ball"] / pf * 100 if pf else 0
    players_pct = stats["frames_with_players"] / pf * 100 if pf else 0
    two_players_pct = stats["frames_with_2_players"] / pf * 100 if pf else 0

    avg_ball_conf = np.mean(stats["ball_confidences"]) if stats["ball_confidences"] else 0
    avg_player_conf = np.mean(stats["player_confidences"]) if stats["player_confidences"] else 0

    real_time = stats["total_frames"] / fps
    proc_ratio = stats["processing_time_s"] / real_time if real_time else 0

    print(f"\n{'='*60}")
    print("RESULTADO DO SPIKE")
    print(f"{'='*60}")
    print(f"Frames processados   : {pf} de {stats['total_frames']}")
    print(f"Tempo de proc.       : {stats['processing_time_s']}s ({proc_ratio:.1f}x tempo real)")
    print()
    print(f"BOLA")
    print(f"  Detectada em       : {ball_pct:.1f}% dos frames")
    print(f"  Confiança média    : {avg_ball_conf:.2f}")
    print(f"  Total detecções    : {len(stats['ball_confidences'])}")
    print()
    print(f"JOGADORES")
    print(f"  Detectados em      : {players_pct:.1f}% dos frames")
    print(f"  2 jogadores visíveis: {two_players_pct:.1f}% dos frames")
    print(f"  Confiança média    : {avg_player_conf:.2f}")
    print()

    # Diagnóstico automático
    print("DIAGNÓSTICO")
    if ball_pct >= 70:
        print(f"  ✓ Bola: ÓTIMO ({ball_pct:.0f}% detecção) — sem fine-tuning necessário no MVP")
    elif ball_pct >= 40:
        print(f"  ~ Bola: ACEITÁVEL ({ball_pct:.0f}%) — fine-tuning vai melhorar")
    else:
        print(f"  ✗ Bola: INSUFICIENTE ({ball_pct:.0f}%) — fine-tuning obrigatório ou trocar por TrackNet")

    if two_players_pct >= 80:
        print(f"  ✓ Jogadores: ÓTIMO ({two_players_pct:.0f}% com 2 detectados)")
    elif two_players_pct >= 50:
        print(f"  ~ Jogadores: ACEITÁVEL ({two_players_pct:.0f}%) — ajuste de conf pode ajudar")
    else:
        print(f"  ✗ Jogadores: INSUFICIENTE ({two_players_pct:.0f}%) — verificar ângulo da câmera")

    if proc_ratio <= 3:
        print(f"  ✓ Velocidade: OK ({proc_ratio:.1f}x tempo real)")
    else:
        print(f"  ~ Velocidade: LENTO ({proc_ratio:.1f}x tempo real) — usar modelo menor ou GPU")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    run_spike(parse_args())
