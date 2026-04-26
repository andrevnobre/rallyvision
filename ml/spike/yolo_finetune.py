"""
Fine-tune YOLOv8 para detecção de bola de beach tennis.

== SETUP ==

1. Crie conta gratuita em https://universe.roboflow.com
2. Busque por "tennis ball" e escolha um dataset com >1000 imagens.
   Datasets recomendados (buscar pelo nome no Roboflow Universe):
     - "Tennis Ball Detection" (vários autores, filtrar por >1k imagens)
     - "padel-ball" se quiser mais próximo de beach tennis
3. Clique em Export > Format: YOLOv8 PyTorch > Download zip
4. Extraia o zip dentro de ml/spike/dataset/ (deve conter data.yaml, train/, valid/, test/)

== USO ==

  # Local (lento sem GPU — use no Colab se não tiver GPU)
  python yolo_finetune.py --data dataset/data.yaml

  # Com mais épocas ou batch menor (se der OOM)
  python yolo_finetune.py --data dataset/data.yaml --epochs 150 --batch 8

== COLAB ==

  Copie este arquivo para o Colab, monte o Drive com o dataset, e execute:
  !python yolo_finetune.py --data /content/drive/MyDrive/dataset/data.yaml --epochs 100
"""

import argparse
import shutil
from pathlib import Path

from ultralytics import YOLO


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--data", required=True, help="Caminho para data.yaml do dataset Roboflow")
    p.add_argument("--base-model", default="ball_yolo.pt",
                   help="Pesos base: ball_yolo.pt (continuar treino) | yolov8s.pt (recomeçar)")
    p.add_argument("--epochs", type=int, default=100)
    p.add_argument("--batch", type=int, default=16, help="Reduzir para 8 se der OOM na GPU")
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--out", default="ball_yolo.pt", help="Arquivo de saída com os melhores pesos")
    return p.parse_args()


def main():
    args = parse_args()

    data_path = Path(args.data)
    if not data_path.exists():
        raise FileNotFoundError(
            f"data.yaml não encontrado: {data_path}\n"
            "Baixe o dataset no Roboflow Universe (formato YOLOv8 PyTorch) e extraia em ml/spike/dataset/"
        )

    print(f"\n{'='*60}")
    print("RallyVision — Fine-tuning YOLOv8 para bola de beach tennis")
    print(f"{'='*60}")
    print(f"Dataset    : {data_path}")
    print(f"Modelo base: {args.base_model}")
    print(f"Épocas     : {args.epochs}")
    print(f"Batch      : {args.batch}")
    print(f"Imagem     : {args.imgsz}px")
    print(f"{'='*60}\n")

    model = YOLO(args.base_model)

    results = model.train(
        data=str(data_path),
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        name="ball",
        # Early stopping: para se não melhorar por 20 épocas
        patience=20,
        optimizer="AdamW",
        lr0=1e-3,
        lrf=0.01,
        warmup_epochs=3,
        # Augmentações adaptadas para detecção de bola outdoor
        degrees=0.0,       # sem rotação — bola de beach tennis é sempre "em cima"
        flipud=0.0,        # sem flip vertical — quadra tem orientação fixa
        fliplr=0.5,        # flip horizontal ok
        mosaic=1.0,        # combina 4 imagens — ajuda com bolas pequenas
        mixup=0.1,
        hsv_h=0.02,        # variação de cor pequena (bola é amarela/laranja)
        hsv_s=0.5,         # variação de saturação — iluminação outdoor varia muito
        hsv_v=0.4,         # variação de brilho — sol/sombra na areia
        scale=0.5,         # zoom in/out — bola aparece em tamanhos diferentes
        perspective=0.0,   # sem distorção de perspectiva — câmera é fixa
        save=True,
        plots=True,
        verbose=True,
    )

    best_weights = Path(results.save_dir) / "weights" / "best.pt"
    shutil.copy(best_weights, args.out)

    map50 = results.results_dict.get("metrics/mAP50(B)", None)
    map50_95 = results.results_dict.get("metrics/mAP50-95(B)", None)

    print(f"\n{'='*60}")
    print("TREINAMENTO CONCLUÍDO")
    print(f"{'='*60}")
    if map50 is not None:
        print(f"mAP50     : {map50:.3f}  (>0.70 é bom para detecção de bola)")
        print(f"mAP50-95  : {map50_95:.3f}")
        if map50 >= 0.70:
            print("[OK] Modelo com boa acurácia — pronto para spike no vídeo de beach tennis")
        elif map50 >= 0.50:
            print("[~]  mAP moderado — pode melhorar com mais dados ou épocas")
        else:
            print("[!]  mAP baixo — verifique a qualidade do dataset")
    print(f"\nPesos salvos: {args.out}")
    print(f"Logs/gráficos: {results.save_dir}")
    print(f"\nPróximo passo:")
    print(f"  python yolo_ball_spike.py --video video.mp4 --weights {args.out}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
