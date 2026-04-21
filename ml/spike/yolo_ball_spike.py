"""
Spike: YOLOv8 fine-tuned para detecção de bola de beach tennis.

Usa o modelo treinado com yolo_finetune.py e valida no vídeo real.
Compara com os resultados anteriores (YOLOv8 COCO: 17%, TrackNetV2: 63% com FP).

Uso:
    python yolo_ball_spike.py --video video.mp4 --weights ball_yolo.pt

    # Sem gerar vídeo (mais rápido, só stats)
    python yolo_ball_spike.py --video video.mp4 --weights ball_yolo.pt --no-output

    # ROI da quadra manual (reutilizar de execuções anteriores)
    python yolo_ball_spike.py --video video.mp4 --weights ball_yolo.pt \
        --court-roi "530,120 1390,120 1390,800 530,800"
"""

import argparse
import json
import time
from collections import deque
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--video", required=True)
    p.add_argument("--weights", required=True, help="Pesos do modelo fine-tuned (ball_yolo.pt)")
    p.add_argument("--conf", type=float, default=0.3, help="Confiança mínima de detecção")
    p.add_argument("--sample-rate", type=int, default=1, help="Processar 1 a cada N frames")
    p.add_argument("--no-output", action="store_true")
    p.add_argument("--court-roi", default=None,
                   help="'x1,y1 x2,y2 x3,y3 x4,y4' — omitir para selecionar manualmente")
    p.add_argument("--no-roi", action="store_true", help="Detectar em todo o frame sem ROI")
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


def run_spike(args):
    video_path = Path(args.video)
    if not video_path.exists():
        raise FileNotFoundError(f"Vídeo não encontrado: {video_path}")

    weights_path = Path(args.weights)
    if not weights_path.exists():
        raise FileNotFoundError(
            f"Pesos não encontrados: {weights_path}\n"
            "Execute yolo_finetune.py primeiro para gerar o modelo."
        )

    print(f"\n{'='*60}")
    print("RallyVision — Spike YOLOv8 Fine-tuned (bola beach tennis)")
    print(f"{'='*60}")
    print(f"Vídeo   : {video_path.name}")
    print(f"Pesos   : {weights_path.name}")
    print(f"Conf    : {args.conf}")
    print(f"{'='*60}\n")

    model = YOLO(str(weights_path))

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
        h, w = first_frame.shape[:2]
        roi_pts = np.array([[0, 0], [w, 0], [w, h], [0, h]], dtype=np.int32)
        print("ROI: frame completo (--no-roi)")
    elif args.court_roi:
        roi_pts = parse_court_roi(args.court_roi)
        print(f"ROI da quadra (argumento): {roi_pts.tolist()}")
    else:
        roi_pts = select_court_roi(first_frame)
        coords_str = " ".join(f"{x},{y}" for x, y in roi_pts)
        print(f"\nROI selecionada: --court-roi \"{coords_str}\"")
        print("(use esse argumento nas próximas execuções para pular a seleção)\n")

    out = None
    if not args.no_output:
        out_path = video_path.parent / f"{video_path.stem}_ball_yolo.mp4"
        out = cv2.VideoWriter(str(out_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))

    stats = {
        "video": video_path.name,
        "model": "YOLOv8-finetuned",
        "weights": weights_path.name,
        "conf_threshold": args.conf,
        "total_frames": total_frames,
        "processed_frames": 0,
        "frames_with_ball": 0,
        "frames_with_ball_in_roi": 0,
        "ball_confidences": [],
        "processing_time_s": 0,
    }

    trajectory = deque(maxlen=10)
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

        results = model(frame, conf=args.conf, verbose=False)[0]

        balls = []
        for box in results.boxes:
            conf = float(box.conf)
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            in_roi = point_in_roi(cx, cy, roi_pts)
            balls.append({"box": (x1, y1, x2, y2), "conf": conf, "center": (cx, cy), "in_roi": in_roi})

        stats["processed_frames"] += 1
        if balls:
            stats["frames_with_ball"] += 1
            stats["ball_confidences"].extend(b["conf"] for b in balls)

        balls_in_roi = [b for b in balls if b["in_roi"]]
        if balls_in_roi:
            stats["frames_with_ball_in_roi"] += 1
            best = max(balls_in_roi, key=lambda b: b["conf"])
            trajectory.append(best["center"])
        else:
            trajectory.append(None)

        if out:
            annotated = frame.copy()
            cv2.polylines(annotated, [roi_pts], isClosed=True, color=(0, 255, 100), thickness=2)

            # Trajetória
            pts_valid = [p for p in trajectory if p is not None]
            for i in range(1, len(pts_valid)):
                alpha = i / len(pts_valid)
                color = (0, int(80 * alpha), int(255 * alpha))
                cv2.line(annotated, pts_valid[i - 1], pts_valid[i], color, 2)

            # Detecções
            for b in balls:
                x1, y1, x2, y2 = b["box"]
                color = (0, 200, 255) if b["in_roi"] else (80, 80, 80)
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                cv2.putText(annotated, f"ball {b['conf']:.2f}", (x1, y1 - 6),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

            out.write(annotated)

        if frame_idx % 100 == 0:
            elapsed = time.time() - start
            pct = frame_idx / total_frames * 100
            in_roi_count = len(balls_in_roi)
            print(f"  Frame {frame_idx}/{total_frames} ({pct:.0f}%) "
                  f"bola: {len(balls)} total / {in_roi_count} na quadra | {elapsed:.1f}s")

    cap.release()
    if out:
        out.release()

    stats["processing_time_s"] = round(time.time() - start, 2)
    _print_report(stats, fps)

    report_path = video_path.parent / f"{video_path.stem}_ball_yolo_report.json"
    summary = {k: v for k, v in stats.items() if k != "ball_confidences"}
    summary["avg_ball_conf"] = round(float(np.mean(stats["ball_confidences"])), 4) if stats["ball_confidences"] else 0
    with open(report_path, "w") as f:
        json.dump(summary, f, indent=2)

    print(f"Relatório: {report_path}")
    if not args.no_output:
        print(f"Vídeo    : {out_path}")


def _print_report(stats, fps):
    pf = stats["processed_frames"]
    ball_pct = stats["frames_with_ball"] / pf * 100 if pf else 0
    ball_roi_pct = stats["frames_with_ball_in_roi"] / pf * 100 if pf else 0
    avg_conf = float(np.mean(stats["ball_confidences"])) if stats["ball_confidences"] else 0
    real_time = stats["total_frames"] / fps
    proc_ratio = stats["processing_time_s"] / real_time if real_time else 0

    print(f"\n{'='*60}")
    print("RESULTADO DO SPIKE — YOLOv8 Fine-tuned")
    print(f"{'='*60}")
    print(f"Frames processados   : {pf} de {stats['total_frames']}")
    print(f"Tempo de proc.       : {stats['processing_time_s']}s ({proc_ratio:.1f}x tempo real)")
    print()
    print("BOLA")
    print(f"  Detectada (total)  : {ball_pct:.1f}% dos frames")
    print(f"  Detectada na quadra: {ball_roi_pct:.1f}% dos frames  ← métrica principal")
    print(f"  Confiança média    : {avg_conf:.3f}")
    print()
    print("COMPARATIVO")
    print(f"  YOLOv8 COCO (spike 1)     : 17.0%  — bola errada")
    print(f"  TrackNetV2 pré-treinado   : 63.0%  — falsos positivos")
    print(f"  YOLOv8 fine-tuned (agora) : {ball_roi_pct:.1f}%")
    print()
    print("DIAGNÓSTICO")
    if ball_roi_pct >= 70:
        print(f"  [OK] APROVADO ({ball_roi_pct:.0f}%) — pipeline de bola validado para o MVP")
    elif ball_roi_pct >= 40:
        print(f"  [~]  ACEITÁVEL ({ball_roi_pct:.0f}%) — mais dados de beach tennis vão melhorar")
    else:
        print(f"  [X]  INSUFICIENTE ({ball_roi_pct:.0f}%) — verificar dataset ou tentar TrackNet fine-tuned")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    run_spike(parse_args())
