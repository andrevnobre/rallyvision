"""
Ferramenta de anotação de bola para fine-tuning do TrackNet.

Uso:
    python tracknet_label.py --video video.mp4
    python tracknet_label.py --video video.mp4 --labels labels.csv  # retomar sessão

Controles:
    Clique esquerdo  — marca posição da bola no frame
    N                — frame sem bola visível (oclusão / fora de quadro)
    SPACE / ->       — próximo frame
    <- / Backspace   — frame anterior (para corrigir)
    S                — salva CSV agora
    Q                — sai e salva

Saída:
    labels.csv  — frame_idx, x, y  (-1,-1 = sem bola)
"""

import argparse
import csv
import sys
from pathlib import Path

import cv2
import numpy as np

WINDOW = "RallyVision Labeler — clique na bola | N=sem bola | SPACE=proximo | <-=voltar | Q=sair"


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--video", required=True)
    p.add_argument("--labels", default=None, help="CSV existente para retomar (padrão: <video>_labels.csv)")
    p.add_argument("--step", type=int, default=1, help="Avança N frames por SPACE (padrão: 1)")
    return p.parse_args()


def load_existing_labels(csv_path):
    labels = {}
    if csv_path.exists():
        with open(csv_path, newline="") as f:
            for row in csv.DictReader(f):
                labels[int(row["frame_idx"])] = (int(row["x"]), int(row["y"]))
        print(f"Retomando: {len(labels)} frames já anotados em {csv_path}")
    return labels


def save_labels(csv_path, labels):
    with open(csv_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["frame_idx", "x", "y"])
        w.writeheader()
        for idx in sorted(labels):
            x, y = labels[idx]
            w.writerow({"frame_idx": idx, "x": x, "y": y})


def draw_frame(base_frame, frame_idx, total, labels, step):
    img = base_frame.copy()
    h, w = img.shape[:2]

    # Overlay da anotação atual
    if frame_idx in labels:
        x, y = labels[frame_idx]
        if x >= 0:
            cv2.circle(img, (x, y), 10, (0, 100, 255), 2)
            cv2.circle(img, (x, y), 2, (0, 100, 255), -1)
        else:
            cv2.putText(img, "SEM BOLA", (20, h - 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 200), 2)

    # Barra de status
    annotated = sum(1 for v in labels.values() if v[0] >= 0)
    no_ball = sum(1 for v in labels.values() if v[0] < 0)
    status = f"Frame {frame_idx}/{total}  |  anotados={annotated}  sem_bola={no_ball}  step={step}"
    cv2.rectangle(img, (0, 0), (w, 30), (30, 30, 30), -1)
    cv2.putText(img, status, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (220, 220, 220), 1)

    # Indicador se já anotado
    if frame_idx in labels:
        cv2.rectangle(img, (w - 16, 0), (w, 30), (0, 180, 80), -1)

    return img


def main():
    args = parse_args()
    video_path = Path(args.video)
    if not video_path.exists():
        sys.exit(f"Video nao encontrado: {video_path}")

    csv_path = Path(args.labels) if args.labels else video_path.parent / f"{video_path.stem}_labels.csv"

    cap = cv2.VideoCapture(str(video_path))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    print(f"Video: {video_path.name}  |  {total} frames @ {fps:.1f}fps")
    print(f"Labels: {csv_path}\n")

    labels = load_existing_labels(csv_path)

    # Começa no primeiro frame não anotado
    annotated_set = set(labels.keys())
    frame_idx = 0
    for i in range(total):
        if i not in annotated_set:
            frame_idx = i
            break

    click_pos = [None]  # posição do clique pendente

    def on_click(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            click_pos[0] = (x, y)

    cv2.namedWindow(WINDOW, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(WINDOW, 1280, 720)
    cv2.setMouseCallback(WINDOW, on_click)

    cache = {}  # cache de frames lidos para navegação rápida

    def read_frame(idx):
        if idx in cache:
            return cache[idx]
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, f = cap.read()
        if ret:
            cache[idx] = f
            if len(cache) > 60:  # limita memória
                oldest = min(cache)
                del cache[oldest]
        return f if ret else None

    step = args.step

    advance = False  # sinaliza para avançar no fim da iteração

    while True:
        frame = read_frame(frame_idx)
        if frame is None:
            break

        # Aplica clique pendente e avança automaticamente
        if click_pos[0] is not None:
            labels[frame_idx] = click_pos[0]
            print(f"  Frame {frame_idx}: bola em {click_pos[0]}")
            click_pos[0] = None
            advance = True

        if advance:
            frame_idx = min(frame_idx + step, total - 1)
            advance = False
            continue  # re-renderiza o novo frame imediatamente

        img = draw_frame(frame, frame_idx, total, labels, step)
        cv2.imshow(WINDOW, img)

        raw = cv2.waitKey(20)
        if raw == -1:
            continue
        key = raw & 0xFF

        if key == ord('q'):
            break
        elif key == ord('s'):
            save_labels(csv_path, labels)
            print(f"Salvo: {len(labels)} frames em {csv_path}")
        elif key == ord('n'):
            labels[frame_idx] = (-1, -1)
            print(f"  Frame {frame_idx}: sem bola")
            frame_idx = min(frame_idx + step, total - 1)
        elif key in (32, ord('d')):  # SPACE ou D
            if frame_idx not in labels:
                print(f"  Frame {frame_idx}: pulado")
            frame_idx = min(frame_idx + step, total - 1)
        elif key in (8, ord('a')):  # Backspace ou A
            frame_idx = max(frame_idx - step, 0)
        elif key == ord('+'):
            step = min(step + 1, 30)
            print(f"  Step: {step}")
        elif key == ord('-'):
            step = max(step - 1, 1)
            print(f"  Step: {step}")

    cap.release()
    cv2.destroyAllWindows()

    save_labels(csv_path, labels)
    annotated = sum(1 for v in labels.values() if v[0] >= 0)
    no_ball = sum(1 for v in labels.values() if v[0] < 0)
    print(f"\nSessao encerrada.")
    print(f"Total anotado : {len(labels)} frames")
    print(f"  Com bola    : {annotated}")
    print(f"  Sem bola    : {no_ball}")
    print(f"Arquivo       : {csv_path}")


if __name__ == "__main__":
    main()
