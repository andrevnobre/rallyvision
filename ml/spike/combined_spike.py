"""
Spike: deteção combinada de bola + jogadores em beach tennis.

Usa dois modelos em série no mesmo frame:
  - ball_yolo.pt  — bola (fine-tuned, conf≥0.3)
  - yolov8s.pt    — jogadores (COCO person, ByteTrack para IDs persistentes)

Uso:
    python combined_spike.py --video videos/clip.mp4

    # Reutilizar ROI de execução anterior
    python combined_spike.py --video videos/clip.mp4 --court-roi "530,120 1390,120 1390,800 530,800"

    # Só stats, sem gerar vídeo (mais rápido)
    python combined_spike.py --video videos/clip.mp4 --no-output
"""

import argparse
import json
import time
from collections import deque
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

BALL_CONF = 0.3
PLAYER_CONF = 0.3

COLORS = {
    "ball": (0, 100, 255),
    "court": (0, 255, 100),
    "trail": (0, 60, 200),
}
PLAYER_PALETTE = [
    (255, 80, 80),
    (80, 200, 255),
    (255, 200, 0),
    (180, 80, 255),
]


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--video", required=True)
    p.add_argument("--ball-weights", default="ball_yolo.pt")
    p.add_argument("--player-weights", default="yolov8s.pt")
    p.add_argument("--ball-conf", type=float, default=BALL_CONF)
    p.add_argument("--player-conf", type=float, default=PLAYER_CONF)
    p.add_argument("--sample-rate", type=int, default=1)
    p.add_argument("--no-output", action="store_true")
    p.add_argument("--court-roi", default=None,
                   help="'x1,y1 x2,y2 x3,y3 x4,y4' — omitir para selecionar manualmente")
    p.add_argument("--no-roi", action="store_true", help="Usar frame completo sem ROI")
    return p.parse_args()


def select_court_roi(frame):
    pts = []
    clone = frame.copy()
    win = "Selecione os 4 cantos da quadra (sentido horario) — ENTER para confirmar"

    def on_click(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN and len(pts) < 4:
            pts.append((x, y))
            cv2.circle(clone, (x, y), 6, (0, 255, 0), -1)
            if len(pts) > 1:
                cv2.line(clone, pts[-2], pts[-1], (0, 255, 0), 2)
            if len(pts) == 4:
                cv2.line(clone, pts[-1], pts[0], (0, 255, 0), 2)
            cv2.imshow(win, clone)

    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(win, 1280, 720)
    cv2.imshow(win, clone)
    cv2.setMouseCallback(win, on_click)
    print("\nClique nos 4 cantos da quadra em sentido horário.")
    print("Pressione ENTER para confirmar ou R para resetar.\n")
    while True:
        key = cv2.waitKey(20) & 0xFF
        if key == ord('r'):
            pts.clear()
            clone[:] = frame.copy()
            cv2.imshow(win, clone)
        elif key in (13, ord('\r')) and len(pts) == 4:
            break
    cv2.destroyAllWindows()
    return np.array(pts, dtype=np.int32)


def parse_court_roi(roi_str):
    pts = [tuple(int(v) for v in p.split(",")) for p in roi_str.strip().split()]
    return np.array(pts, dtype=np.int32)


def point_in_roi(cx, cy, roi_pts):
    return cv2.pointPolygonTest(roi_pts, (float(cx), float(cy)), False) >= 0


def player_color(track_id):
    return PLAYER_PALETTE[int(track_id) % len(PLAYER_PALETTE)]


def run_spike(args):
    video_path = Path(args.video)
    if not video_path.exists():
        raise FileNotFoundError(f"Vídeo não encontrado: {video_path}")

    ball_weights = Path(args.ball_weights)
    if not ball_weights.exists():
        raise FileNotFoundError(f"Pesos da bola não encontrados: {ball_weights}")

    print(f"\n{'='*60}")
    print("RallyVision — Spike Combinado: Bola + Jogadores")
    print(f"{'='*60}")
    print(f"Vídeo          : {video_path.name}")
    print(f"Modelo bola    : {ball_weights.name}  (conf≥{args.ball_conf})")
    print(f"Modelo jogador : {args.player_weights}  (conf≥{args.player_conf}, ByteTrack)")
    print(f"{'='*60}\n")

    ball_model = YOLO(str(ball_weights))
    player_model = YOLO(args.player_weights)

    cap = cv2.VideoCapture(str(video_path))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"Vídeo : {width}x{height} @ {fps:.1f}fps — {total_frames} frames\n")

    ret0, first_frame = cap.read()
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    if not ret0:
        raise RuntimeError("Não foi possível ler o primeiro frame.")

    if args.no_roi:
        roi_pts = np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=np.int32)
        print("ROI: frame completo (--no-roi)")
    elif args.court_roi:
        roi_pts = parse_court_roi(args.court_roi)
        print(f"ROI (argumento): {roi_pts.tolist()}")
    else:
        roi_pts = select_court_roi(first_frame)
        coords_str = " ".join(f"{x},{y}" for x, y in roi_pts)
        print(f"\nROI selecionada: --court-roi \"{coords_str}\"")
        print("(reutilize este argumento para pular a seleção)\n")

    out = None
    if not args.no_output:
        out_path = video_path.parent / f"{video_path.stem}_combined.mp4"
        out = cv2.VideoWriter(str(out_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))

    stats = {
        "video": video_path.name,
        "ball_weights": ball_weights.name,
        "player_weights": args.player_weights,
        "ball_conf_threshold": args.ball_conf,
        "player_conf_threshold": args.player_conf,
        "total_frames": total_frames,
        "processed_frames": 0,
        "frames_with_ball": 0,
        "frames_with_1_player": 0,
        "frames_with_2_players": 0,
        "frames_with_ball_and_2_players": 0,
        "unique_player_ids": set(),
        "ball_confidences": [],
        "player_confidences": [],
        "processing_time_s": 0,
    }

    ball_trail = deque(maxlen=12)
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

        # --- Bola ---
        ball_results = ball_model(frame, conf=args.ball_conf, verbose=False)[0]
        balls = []
        for box in ball_results.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            if point_in_roi(cx, cy, roi_pts):
                balls.append({"box": (x1, y1, x2, y2), "center": (cx, cy), "conf": float(box.conf)})

        # --- Jogadores com ByteTrack ---
        player_results = player_model.track(
            frame, persist=True, tracker="bytetrack.yaml",
            classes=[0], conf=args.player_conf, verbose=False
        )[0]
        players = []
        if player_results.boxes.id is not None:
            for box, track_id in zip(player_results.boxes, player_results.boxes.id):
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                tid = int(track_id)
                players.append({"box": (x1, y1, x2, y2), "id": tid, "conf": float(box.conf)})
                stats["unique_player_ids"].add(tid)
                stats["player_confidences"].append(float(box.conf))

        # --- Stats ---
        stats["processed_frames"] += 1
        if balls:
            stats["frames_with_ball"] += 1
            stats["ball_confidences"].extend(b["conf"] for b in balls)
            best_ball = max(balls, key=lambda b: b["conf"])
            ball_trail.append(best_ball["center"])
        else:
            ball_trail.append(None)

        if len(players) >= 1:
            stats["frames_with_1_player"] += 1
        if len(players) >= 2:
            stats["frames_with_2_players"] += 1
        if balls and len(players) >= 2:
            stats["frames_with_ball_and_2_players"] += 1

        # --- Anotação ---
        if out:
            annotated = frame.copy()
            cv2.polylines(annotated, [roi_pts], isClosed=True, color=COLORS["court"], thickness=2)

            # Trajetória da bola
            valid_pts = [p for p in ball_trail if p is not None]
            for i in range(1, len(valid_pts)):
                alpha = i / len(valid_pts)
                color = (0, int(60 * alpha), int(200 * alpha))
                cv2.line(annotated, valid_pts[i - 1], valid_pts[i], color, 2)

            # Bola
            for b in balls:
                x1, y1, x2, y2 = b["box"]
                cv2.rectangle(annotated, (x1, y1), (x2, y2), COLORS["ball"], 2)
                cv2.putText(annotated, f"ball {b['conf']:.2f}", (x1, y1 - 6),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLORS["ball"], 1)

            # Jogadores
            for p in players:
                x1, y1, x2, y2 = p["box"]
                color = player_color(p["id"])
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                cv2.putText(annotated, f"P{p['id']} {p['conf']:.2f}", (x1, y1 - 6),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

            out.write(annotated)

        if frame_idx % 100 == 0:
            elapsed = time.time() - start
            pct = frame_idx / total_frames * 100
            print(f"  Frame {frame_idx}/{total_frames} ({pct:.0f}%) "
                  f"bola:{len(balls)} jogadores:{len(players)} | {elapsed:.1f}s")

    cap.release()
    if out:
        out.release()

    stats["processing_time_s"] = round(time.time() - start, 2)
    stats["unique_player_ids"] = len(stats["unique_player_ids"])
    _print_report(stats, fps)

    report_path = video_path.parent / f"{video_path.stem}_combined_report.json"
    summary = {k: v for k, v in stats.items() if k not in ("ball_confidences", "player_confidences")}
    summary["avg_ball_conf"] = round(float(np.mean(stats["ball_confidences"])), 4) if stats["ball_confidences"] else 0
    summary["avg_player_conf"] = round(float(np.mean(stats["player_confidences"])), 4) if stats["player_confidences"] else 0
    with open(report_path, "w") as f:
        json.dump(summary, f, indent=2)

    print(f"Relatório : {report_path}")
    if not args.no_output:
        print(f"Vídeo     : {out_path}")


def _print_report(stats, fps):
    pf = stats["processed_frames"]
    ball_pct = stats["frames_with_ball"] / pf * 100 if pf else 0
    p1_pct = stats["frames_with_1_player"] / pf * 100 if pf else 0
    p2_pct = stats["frames_with_2_players"] / pf * 100 if pf else 0
    both_pct = stats["frames_with_ball_and_2_players"] / pf * 100 if pf else 0
    avg_ball = float(np.mean(stats["ball_confidences"])) if stats["ball_confidences"] else 0
    avg_player = float(np.mean(stats["player_confidences"])) if stats["player_confidences"] else 0
    real_time = stats["total_frames"] / fps
    proc_ratio = stats["processing_time_s"] / real_time if real_time else 0

    print(f"\n{'='*60}")
    print("RESULTADO — Bola + Jogadores")
    print(f"{'='*60}")
    print(f"Frames processados      : {pf} de {stats['total_frames']}")
    print(f"Tempo de proc.          : {stats['processing_time_s']}s ({proc_ratio:.1f}x tempo real)")
    print()
    print("BOLA")
    print(f"  Detectada em          : {ball_pct:.1f}% dos frames")
    print(f"  Confiança média       : {avg_ball:.3f}")
    print()
    print("JOGADORES")
    print(f"  >=1 jogador visível   : {p1_pct:.1f}% dos frames")
    print(f"  2 jogadores visíveis  : {p2_pct:.1f}% dos frames  <- métrica principal")
    print(f"  IDs únicos rastreados : {stats['unique_player_ids']}")
    print(f"  Confiança média       : {avg_player:.3f}")
    print()
    print("COMBINADO")
    print(f"  Bola + 2 jogadores    : {both_pct:.1f}% dos frames  <- frames utilizáveis para analytics")
    print()
    print("DIAGNÓSTICO")
    ball_ok = ball_pct >= 60
    players_ok = p2_pct >= 70
    print(f"  Bola    : {'[OK]' if ball_ok else '[~] '} {ball_pct:.0f}%  (limiar: 60%)")
    print(f"  Jogadores: {'[OK]' if players_ok else '[~] '} {p2_pct:.0f}%  (limiar: 70%)")
    if ball_ok and players_ok:
        print("  => Pipeline combinado VALIDADO para MVP")
    elif ball_ok or players_ok:
        print("  => Pipeline parcialmente validado — ver resultado visual")
    else:
        print("  => Necessita ajuste — verificar ângulo ou confiança")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    run_spike(parse_args())
