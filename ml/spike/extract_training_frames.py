#!/usr/bin/env python3
"""
extract_training_frames.py — Extrai frames de vídeo para fine-tuning do ball_yolo.pt

Estratégia de seleção (por ordem de prioridade):
  1. Frames com bola detetada mas confiança baixa  → modelo incerto, precisa de correção
  2. Frames em gaps entre deteções                 → bola provavelmente presente mas falhada
  3. Amostra de frames com alta confiança          → exemplos positivos fáceis (equilíbrio)
  4. Amostra de frames sem deteção fora de gaps    → negativos verdadeiros

Saída (formato YOLO, pronto para upload no Roboflow com pré-anotações):
  dataset/
    images/train/*.jpg
    images/val/*.jpg
    labels/train/*.txt
    labels/val/*.txt
    data.yaml

== USO ==

  # Vídeo local
  python extract_training_frames.py video.mp4

  # Múltiplos vídeos
  python extract_training_frames.py video1.mp4 video2.mp4 --max-per-video 400

  # Vídeo do S3
  AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... S3_BUCKET=my-bucket \\
  python extract_training_frames.py --s3-key videos/abc123.mp4

  # Acumular sobre dataset existente (não apaga o que já existe)
  python extract_training_frames.py novo_video.mp4 --append

== ROBOFLOW ==

  Após gerar o dataset:
  1. roboflow.com → New Project → Object Detection → class name: ball
  2. Upload → arrastar images/train/ e images/val/ (os .txt sobem juntos)
  3. Corrigir anotações: apagar falsos positivos, desenhar bolas em falta
  4. Generate dataset → Export → Format: YOLOv8 PyTorch → Download zip
  5. Extrair zip em ml/spike/dataset_roboflow/ e treinar:
       python yolo_finetune.py --data dataset_roboflow/data.yaml --base-model ball_yolo.pt
"""

import argparse
import os
import random
import shutil
import tempfile
from pathlib import Path

import cv2
from ultralytics import YOLO

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
WEIGHTS      = Path(__file__).parent / "ball_yolo.pt"
OUT_DIR      = Path(__file__).parent / "dataset"

PRE_ANN_CONF = 0.20   # confiança mínima para pré-anotação (baixo → captura mais candidatos)
LOW_CONF     = 0.50   # abaixo disto = deteção "incerta" → frame prioritário
GAP_MIN_S    = 0.8    # gap ≥ N segundos sem deteção = zona problemática
SAMPLE_EVERY = 2      # processar 1 em cada N frames (reduz tempo de inferência)
MAX_PER_VID  = 300    # máximo de frames extraídos por vídeo
VAL_RATIO    = 0.15   # fração destinada a validação
IMGSZ        = 1280   # tamanho de inferência (igual ao pipeline de produção)


# ---------------------------------------------------------------------------
# S3
# ---------------------------------------------------------------------------

def _download_s3(s3_key: str, dest: Path) -> None:
    import boto3
    bucket = os.environ.get("S3_BUCKET", "")
    if not bucket:
        raise EnvironmentError("S3_BUCKET não definido")
    s3 = boto3.client(
        "s3",
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        region_name=os.environ.get("AWS_REGION", "eu-west-1"),
    )
    size_mb = s3.head_object(Bucket=bucket, Key=s3_key)["ContentLength"] / 1e6
    print(f"  A descarregar s3://{bucket}/{s3_key} ({size_mb:.0f} MB)…")
    s3.download_file(bucket, s3_key, str(dest))


# ---------------------------------------------------------------------------
# Passe 1 — inferência (sem guardar imagens em RAM)
# ---------------------------------------------------------------------------

def _run_inference(video_path: Path, model: YOLO) -> tuple[list[dict], float]:
    """
    Corre o modelo em frames amostrados.
    Devolve (detections, fps) onde detections = [{frame_idx, boxes}].
    boxes = [] se nada detetado; [{cx,cy,w,h,conf}] se detetado.
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Não foi possível abrir: {video_path}")

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps   = cap.get(cv2.CAP_PROP_FPS) or 25.0
    W     = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H     = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"  {video_path.name}: {W}x{H} @ {fps:.1f}fps | {total} frames")

    detections: list[dict] = []
    frame_idx = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1
        if frame_idx % SAMPLE_EVERY != 0:
            continue

        res   = model(frame, conf=PRE_ANN_CONF, verbose=False, imgsz=IMGSZ)[0]
        boxes = []
        for box in res.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            boxes.append({
                "cx":   (x1 + x2) / 2 / W,
                "cy":   (y1 + y2) / 2 / H,
                "w":    (x2 - x1) / W,
                "h":    (y2 - y1) / H,
                "conf": float(box.conf),
            })
        detections.append({"frame_idx": frame_idx, "boxes": boxes})

    cap.release()
    return detections, fps


# ---------------------------------------------------------------------------
# Seleção de frames prioritários
# ---------------------------------------------------------------------------

def _select_frames(detections: list[dict], fps: float, max_frames: int) -> set[int]:
    gap_min_frames = int(GAP_MIN_S * fps / SAMPLE_EVERY)

    detected     = [d for d in detections if d["boxes"]]
    not_detected = [d for d in detections if not d["boxes"]]

    low_conf  = {d["frame_idx"] for d in detected
                 if max(b["conf"] for b in d["boxes"]) < LOW_CONF}
    high_conf = {d["frame_idx"] for d in detected
                 if max(b["conf"] for b in d["boxes"]) >= LOW_CONF}

    # Gaps: zonas entre deteções consecutivas com intervalo longo
    det_sorted = sorted(d["frame_idx"] for d in detected)
    gap_idxs: set[int] = set()
    for i in range(len(det_sorted) - 1):
        a, b = det_sorted[i], det_sorted[i + 1]
        if (b - a) // SAMPLE_EVERY >= gap_min_frames:
            gap_idxs.update(
                d["frame_idx"] for d in not_detected
                if a < d["frame_idx"] < b
            )

    neg_idxs = {d["frame_idx"] for d in not_detected} - gap_idxs

    # Embaralhar cada grupo e concatenar por prioridade
    def _shuffle(s: set) -> list:
        lst = list(s)
        random.shuffle(lst)
        return lst

    ordered = (
        _shuffle(low_conf)      # 1.º prioridade: incertos
        + _shuffle(gap_idxs)    # 2.º: gaps (bola provavelmente presente)
        + _shuffle(high_conf)   # 3.º: positivos fáceis (equilíbrio)
        + _shuffle(neg_idxs)    # 4.º: negativos
    )

    selected = set(ordered[:max_frames])

    n_low  = len(low_conf  & selected)
    n_gap  = len(gap_idxs  & selected)
    n_high = len(high_conf & selected)
    n_neg  = len(neg_idxs  & selected)
    print(f"  Frames selecionados: {len(selected)} "
          f"(baixa-conf={n_low} | gap={n_gap} | alta-conf={n_high} | neg={n_neg})")
    return selected


# ---------------------------------------------------------------------------
# Passe 2 — extração de imagens e escrita do dataset
# ---------------------------------------------------------------------------

def _extract_and_write(
    video_path: Path,
    selected: set[int],
    detections: list[dict],
    out_dir: Path,
    val_ratio: float,
) -> int:
    det_map = {d["frame_idx"]: d["boxes"] for d in detections}
    sel_list = sorted(selected)
    random.shuffle(sel_list)
    n_val = max(1, int(len(sel_list) * val_ratio))
    val_set = set(sel_list[:n_val])

    cap = cv2.VideoCapture(str(video_path))
    frame_idx = 0
    written   = 0
    stem      = video_path.stem

    while cap.isOpened() and written < len(sel_list):
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1
        if frame_idx not in selected:
            continue

        split = "val" if frame_idx in val_set else "train"
        name  = f"{stem}_f{frame_idx:07d}"

        img_path = out_dir / "images" / split / f"{name}.jpg"
        lbl_path = out_dir / "labels" / split / f"{name}.txt"

        cv2.imwrite(str(img_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 92])

        boxes = det_map.get(frame_idx, [])
        lines = [f"0 {b['cx']:.6f} {b['cy']:.6f} {b['w']:.6f} {b['h']:.6f}"
                 for b in boxes]
        lbl_path.write_text("\n".join(lines))

        written += 1

    cap.release()
    return written


# ---------------------------------------------------------------------------
# data.yaml
# ---------------------------------------------------------------------------

def _write_yaml(out_dir: Path) -> None:
    (out_dir / "data.yaml").write_text(
        f"path: {out_dir.resolve()}\n"
        "train: images/train\n"
        "val: images/val\n"
        "\n"
        "nc: 1\n"
        "names:\n"
        "  0: ball\n"
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extrai frames para dataset de treino do ball_yolo.pt"
    )
    parser.add_argument("videos", nargs="*", help="Vídeos locais")
    parser.add_argument("--s3-key", nargs="*", default=[],
                        metavar="KEY", help="Chave(s) S3, ex: videos/abc.mp4")
    parser.add_argument("--weights", default=str(WEIGHTS),
                        help="Pesos do modelo (default: ball_yolo.pt)")
    parser.add_argument("--out", default=str(OUT_DIR),
                        help="Diretório de saída do dataset")
    parser.add_argument("--max-per-video", type=int, default=MAX_PER_VID,
                        help="Máximo de frames por vídeo")
    parser.add_argument("--append", action="store_true",
                        help="Acumular sobre dataset existente sem apagar")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)

    out_dir = Path(args.out)
    if not args.append and out_dir.exists():
        shutil.rmtree(out_dir)
        print(f"Dataset anterior apagado: {out_dir}")
    for split in ("train", "val"):
        (out_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (out_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    if not Path(args.weights).exists():
        raise FileNotFoundError(f"Pesos não encontrados: {args.weights}")
    print(f"A carregar modelo: {args.weights}")
    model = YOLO(args.weights)

    all_videos: list[Path] = [Path(v) for v in args.videos]

    tmp_dir = Path(tempfile.mkdtemp())
    try:
        for s3_key in args.s3_key:
            dest = tmp_dir / Path(s3_key).name
            _download_s3(s3_key, dest)
            all_videos.append(dest)

        if not all_videos:
            parser.error("Especifica pelo menos um vídeo local ou --s3-key")

        total_written = 0
        for video_path in all_videos:
            print(f"\n[{video_path.name}]")

            detections, fps = _run_inference(video_path, model)
            n_det = len([d for d in detections if d["boxes"]])
            print(f"  Frames processados: {len(detections)} | "
                  f"com deteção: {n_det} ({n_det/len(detections)*100:.0f}%)")

            selected = _select_frames(detections, fps, args.max_per_video)
            n = _extract_and_write(video_path, selected, detections, out_dir, VAL_RATIO)
            total_written += n
            print(f"  Imagens escritas: {n}")

        _write_yaml(out_dir)

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    n_train = len(list((out_dir / "images" / "train").glob("*.jpg")))
    n_val   = len(list((out_dir / "images" / "val").glob("*.jpg")))

    print(f"""
{'='*60}
Dataset gerado: {total_written} frames totais
  train: {n_train} imagens  |  val: {n_val} imagens
  Diretório: {out_dir}
{'='*60}

Próximos passos no Roboflow:
  1. roboflow.com → New Project → Object Detection
     Class name: ball
  2. Upload → arrastar images/train/ e images/val/
     (os ficheiros .txt são carregados automaticamente como anotações)
  3. Corrigir anotações:
     - Apagar caixas incorretas (falsos positivos)
     - Desenhar caixas em bolas não detetadas (falsos negativos)
  4. Generate → Train/Val/Test split → Export
     Format: YOLOv8 PyTorch → Download zip
  5. Extrair o zip e treinar:
     python yolo_finetune.py \\
       --data <caminho>/data.yaml \\
       --base-model ball_yolo.pt \\
       --epochs 50
  6. Copiar o novo ball_yolo.pt para S3:
     aws s3 cp ball_yolo.pt s3://<bucket>/models/ball_yolo.pt
{'='*60}
""")


if __name__ == "__main__":
    main()
