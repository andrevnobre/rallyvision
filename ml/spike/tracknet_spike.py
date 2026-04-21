"""
Spike: TrackNetV2 para detecção de bola em vídeos de beach tennis.

Compara diretamente com o resultado do YOLOv8 (detect.py).

Uso:
    # Com pesos pré-treinados (recomendado):
    python tracknet_spike.py --video video.mp4 --weights tracknet_weights.pt

    # Sem pesos (modo diagnóstico — verifica se o pipeline roda):
    python tracknet_spike.py --video video.mp4 --no-weights

Como obter os pesos pré-treinados:
    Opção A — TrackNetV2 (badminton, melhor para bolas pequenas e rápidas):
        https://github.com/Chang-Chia-Chi/TrackNet  (releases)

    Opção B — Treinar do zero com seus vídeos (próximo passo se necessário):
        python tracknet_train.py  (ainda não implementado)
"""

import argparse
import json
import time
from pathlib import Path
from collections import deque

import cv2
import numpy as np
import torch

from tracknet_model import TrackNet

INPUT_SIZE = (512, 288)  # largura × altura padrão do TrackNet


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--video", required=True)
    p.add_argument("--weights", default=None, help="Caminho para tracknet_weights.pt")
    p.add_argument("--threshold", type=float, default=0.5, help="Limiar do heatmap (0–1)")
    p.add_argument("--no-output", action="store_true")
    p.add_argument("--no-weights", action="store_true", help="Rodar sem pesos (teste de pipeline)")
    p.add_argument("--sample-rate", type=int, default=1)
    p.add_argument("--court-roi", default=None,
                   help="Coordenadas da quadra: 'x1,y1 x2,y2 x3,y3 x4,y4' (em pixels do vídeo original). "
                        "Se omitido, abre janela para clicar os 4 cantos.")
    return p.parse_args()


def load_model(weights_path, device):
    model = TrackNet().to(device)
    if weights_path and Path(weights_path).exists():
        state = torch.load(weights_path, map_location=device)
        # suporta checkpoint com ou sem wrapper de chaves
        state_dict = state.get("model", state.get("state_dict", state))
        # Checkpoint usa conv1.block.0 — remapeia para conv1.0
        state_dict = {k.replace(".block.", "."): v for k, v in state_dict.items()}
        model.load_state_dict(state_dict, strict=True)
        print(f"Pesos carregados: {weights_path}")
    else:
        print("AVISO: rodando com pesos aleatórios — resultados não são válidos para acurácia.")
        print("       Use --weights para passar um checkpoint pré-treinado.")
    model.eval()
    return model


def preprocess_frames(frames, device):
    """Empilha 3 frames RGB em tensor (1, 9, H, W) normalizado."""
    resized = [cv2.resize(f, INPUT_SIZE) for f in frames]
    channels = [cv2.cvtColor(f, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0 for f in resized]
    stacked = np.concatenate([c.transpose(2, 0, 1) for c in channels], axis=0)  # (9, H, W)
    return torch.from_numpy(stacked).unsqueeze(0).to(device)


def heatmap_to_point(heatmap_np, threshold):
    """Extrai coordenada (x, y) do pico do heatmap, ou None se abaixo do limiar."""
    if heatmap_np.max() < threshold:
        return None, float(heatmap_np.max())
    y, x = np.unravel_index(heatmap_np.argmax(), heatmap_np.shape)
    return (x, y), float(heatmap_np.max())


def scale_point(point, from_size, to_size):
    """Escala coordenada do espaço do modelo para o espaço original do vídeo."""
    if point is None:
        return None
    sx = to_size[0] / from_size[0]
    sy = to_size[1] / from_size[1]
    return (int(point[0] * sx), int(point[1] * sy))


def select_court_roi(frame):
    """Abre janela para o usuário clicar os 4 cantos da quadra. Retorna array (4,2) int32."""
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

    print("\nClique nos 4 cantos da quadra em sentido horario.")
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


def build_court_mask(roi_pts, frame_size):
    """Cria máscara binária (H, W) com 255 dentro do polígono da quadra."""
    h, w = frame_size
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillPoly(mask, [roi_pts], 255)
    return mask


def parse_court_roi(roi_str):
    """Parseia '530,120 1390,120 1390,800 530,800' → array (4,2) int32."""
    pts = [tuple(int(v) for v in p.split(",")) for p in roi_str.strip().split()]
    return np.array(pts, dtype=np.int32)


def run_spike(args):
    video_path = Path(args.video)
    if not video_path.exists():
        raise FileNotFoundError(f"Vídeo não encontrado: {video_path}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\n{'='*60}")
    print(f"RallyVision — Spike TrackNetV2")
    print(f"{'='*60}")
    print(f"Vídeo    : {video_path.name}")
    print(f"Device   : {device}")
    print(f"Limiar   : {args.threshold}")
    print(f"{'='*60}\n")

    weights = None if args.no_weights else args.weights
    model = load_model(weights, device)

    cap = cv2.VideoCapture(str(video_path))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"Vídeo : {width}x{height} @ {fps:.1f}fps — {total_frames} frames\n")

    # --- ROI da quadra ---
    ret0, first_frame = cap.read()
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # rebobina
    if not ret0:
        raise RuntimeError("Não foi possível ler o primeiro frame.")

    if args.court_roi:
        roi_pts = parse_court_roi(args.court_roi)
        print(f"ROI da quadra (argumento): {roi_pts.tolist()}")
    else:
        roi_pts = select_court_roi(first_frame)
        coords_str = " ".join(f"{x},{y}" for x, y in roi_pts)
        print(f"\nROI selecionada: --court-roi \"{coords_str}\"")
        print("(use esse argumento nas próximas execuções para pular a seleção)\n")

    court_mask_full = build_court_mask(roi_pts, (height, width))
    # Máscara redimensionada para o espaço do modelo (INPUT_SIZE)
    court_mask_model = cv2.resize(court_mask_full, INPUT_SIZE, interpolation=cv2.INTER_NEAREST)
    court_mask_model = court_mask_model.astype(np.float32) / 255.0

    out = None
    if not args.no_output:
        out_path = video_path.parent / f"{video_path.stem}_tracknet.mp4"
        out = cv2.VideoWriter(str(out_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))

    stats = {
        "video": video_path.name,
        "model": "TrackNetV2",
        "threshold": args.threshold,
        "device": str(device),
        "weights_loaded": weights is not None and Path(weights).exists() if weights else False,
        "total_frames": total_frames,
        "processed_frames": 0,
        "frames_with_ball": 0,
        "peak_confidences": [],
        "processing_time_s": 0,
    }

    buffer = deque(maxlen=3)  # janela deslizante de 3 frames
    trajectory = deque(maxlen=8)  # últimas posições para desenhar trajetória

    start = time.time()
    frame_idx = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1
        buffer.append(frame.copy())

        if len(buffer) < 3:
            if out:
                out.write(frame)
            continue

        if frame_idx % args.sample_rate != 0:
            if out:
                out.write(frame)
            continue

        with torch.no_grad():
            tensor = preprocess_frames(list(buffer), device)
            logits = model(tensor)  # (1, 256, H, W)
            # Converte 256 canais em heatmap de probabilidade
            heatmap = logits.softmax(dim=1)[0, 1:].sum(dim=0).cpu().numpy()
            heatmap = heatmap / (heatmap.max() + 1e-8)  # normaliza 0-1
            heatmap = heatmap * court_mask_model  # aplica ROI da quadra

        point_model, confidence = heatmap_to_point(heatmap, args.threshold)
        point_video = scale_point(point_model, INPUT_SIZE, (width, height))

        stats["processed_frames"] += 1
        stats["peak_confidences"].append(confidence)

        if point_video is not None:
            stats["frames_with_ball"] += 1
            trajectory.append(point_video)

        if out:
            annotated = frame.copy()
            # Contorno da quadra
            cv2.polylines(annotated, [roi_pts], isClosed=True, color=(0, 255, 100), thickness=2)
            # Desenha trajetória
            for i in range(1, len(trajectory)):
                if trajectory[i - 1] and trajectory[i]:
                    alpha = i / len(trajectory)
                    color = (0, int(100 * alpha), int(255 * alpha))
                    cv2.line(annotated, trajectory[i - 1], trajectory[i], color, 2)
            # Desenha posição atual
            if point_video:
                cv2.circle(annotated, point_video, 8, (0, 100, 255), -1)
                cv2.putText(annotated, f"ball {confidence:.2f}", (point_video[0] + 10, point_video[1]),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 100, 255), 1)
            out.write(annotated)

        if frame_idx % 100 == 0:
            elapsed = time.time() - start
            pct = frame_idx / total_frames * 100
            detected = "+" if point_video else "-"
            print(f"  Frame {frame_idx}/{total_frames} ({pct:.0f}%) {detected} conf={confidence:.3f} | {elapsed:.1f}s")

    cap.release()
    if out:
        out.release()

    stats["processing_time_s"] = round(time.time() - start, 2)
    _print_report(stats, fps)

    report_path = video_path.parent / f"{video_path.stem}_tracknet_report.json"
    with open(report_path, "w") as f:
        # não salva todas as confidências — só o resumo
        summary = {k: v for k, v in stats.items() if k != "peak_confidences"}
        summary["avg_peak_confidence"] = round(float(np.mean(stats["peak_confidences"])), 4) if stats["peak_confidences"] else 0
        summary["max_peak_confidence"] = round(float(np.max(stats["peak_confidences"])), 4) if stats["peak_confidences"] else 0
        json.dump(summary, f, indent=2)

    print(f"Relatório: {report_path}")
    if not args.no_output:
        print(f"Vídeo   : {out_path}")


def _print_report(stats, fps):
    pf = stats["processed_frames"]
    ball_pct = stats["frames_with_ball"] / pf * 100 if pf else 0
    avg_conf = float(np.mean(stats["peak_confidences"])) if stats["peak_confidences"] else 0
    real_time = stats["total_frames"] / fps
    proc_ratio = stats["processing_time_s"] / real_time if real_time else 0

    print(f"\n{'='*60}")
    print("RESULTADO DO SPIKE — TrackNetV2")
    print(f"{'='*60}")
    print(f"Pesos carregados   : {'SIM' if stats['weights_loaded'] else 'NÃO (aleatórios)'}")
    print(f"Frames processados : {pf} de {stats['total_frames']}")
    print(f"Tempo de proc.     : {stats['processing_time_s']}s ({proc_ratio:.1f}x tempo real)")
    print()
    print(f"BOLA")
    print(f"  Detectada em     : {ball_pct:.1f}% dos frames")
    print(f"  Confiança média  : {avg_conf:.3f}")
    print()
    print("COMPARATIVO COM YOLOV8")
    print(f"  YOLOv8 (spike anterior) : 17.0% dos frames")
    print(f"  TrackNetV2 (este spike) : {ball_pct:.1f}% dos frames")
    delta = ball_pct - 17.0
    print(f"  Diferença               : {delta:+.1f}pp")
    print()
    print("DIAGNOSTICO")
    if not stats["weights_loaded"]:
        print("  [!] Pesos aleatorios -- metricas de deteccao invalidas.")
        print("  [!] Use este resultado apenas para validar que o pipeline roda sem erros.")
    elif ball_pct >= 60:
        print(f"  [OK] TrackNetV2 APROVADO ({ball_pct:.0f}%) -- pipeline de bola validado para o MVP")
    elif ball_pct >= 35:
        print(f"  [~]  TrackNetV2 ACEITAVEL ({ball_pct:.0f}%) -- fine-tuning com seus videos vai melhorar")
    else:
        print(f"  [X]  TrackNetV2 INSUFICIENTE ({ball_pct:.0f}%) -- fine-tuning necessario antes do MVP")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    run_spike(parse_args())
