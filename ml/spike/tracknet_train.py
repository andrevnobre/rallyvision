"""
Fine-tuning do TrackNet em vídeos de beach tennis.

Uso:
    python tracknet_train.py --video video.mp4 --labels video_labels.csv \
        --weights tracknet_weights.pt --epochs 30 --out bt_tracknet.pt

O modelo resultante (bt_tracknet.pt) pode ser passado diretamente ao spike:
    python tracknet_spike.py --video video.mp4 --weights bt_tracknet.pt
"""

import argparse
import time
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split

from tracknet_model import TrackNet
from tracknet_dataset import TrackNetDataset


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--video",   required=True)
    p.add_argument("--labels",  required=True)
    p.add_argument("--weights", required=True, help="Pesos pré-treinados (ponto de partida)")
    p.add_argument("--out",     default="bt_tracknet.pt", help="Arquivo de saída")
    p.add_argument("--epochs",  type=int, default=30)
    p.add_argument("--batch",   type=int, default=4)
    p.add_argument("--lr",      type=float, default=1e-4)
    p.add_argument("--val-split", type=float, default=0.15, help="Fração de validação")
    return p.parse_args()


def load_pretrained(weights_path, device):
    model = TrackNet().to(device)
    state = torch.load(weights_path, map_location=device)
    state_dict = state.get("model", state.get("state_dict", state))
    state_dict = {k.replace(".block.", "."): v for k, v in state_dict.items()}
    model.load_state_dict(state_dict, strict=True)
    print(f"Pesos carregados: {weights_path}")
    return model


def weighted_bce(pred, target, pos_weight=10.0):
    """BCE com peso maior para pixels com bola (raros)."""
    weight = 1.0 + (pos_weight - 1.0) * target
    return nn.functional.binary_cross_entropy(pred, target, weight=weight)


def heatmap_from_logits(logits):
    """Converte saída (B, 256, H, W) em heatmap (B, 1, H, W) normalizado."""
    h = logits.softmax(dim=1)[:, 1:].sum(dim=1, keepdim=True)
    mx = h.flatten(2).max(dim=2)[0].unsqueeze(-1).unsqueeze(-1)
    return h / (mx + 1e-8)


def run_epoch(model, loader, optimizer, device, train=True):
    model.train(train)
    total_loss = 0.0
    with torch.set_grad_enabled(train):
        for inputs, targets in loader:
            inputs  = inputs.to(device)
            targets = targets.to(device)
            logits  = model(inputs)
            pred    = heatmap_from_logits(logits)
            loss    = weighted_bce(pred, targets)
            if train:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            total_loss += loss.item()
    return total_loss / len(loader)


def main():
    args = parse_args()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    print(f"\n{'='*60}")
    print("RallyVision — Fine-tuning TrackNet")
    print(f"{'='*60}")
    print(f"Video  : {args.video}")
    print(f"Labels : {args.labels}")
    print(f"Device : {device}")
    print(f"Epochs : {args.epochs}  |  Batch: {args.batch}  |  LR: {args.lr}")
    print(f"{'='*60}\n")

    dataset = TrackNetDataset(args.video, args.labels, augment=True)
    print(f"Amostras totais: {len(dataset)}")

    n_val  = max(1, int(len(dataset) * args.val_split))
    n_train = len(dataset) - n_val
    train_ds, val_ds = random_split(dataset, [n_train, n_val],
                                    generator=torch.Generator().manual_seed(42))
    print(f"Treino: {n_train}  |  Validacao: {n_val}\n")

    train_loader = DataLoader(train_ds, batch_size=args.batch, shuffle=True,  num_workers=0)
    val_loader   = DataLoader(val_ds,   batch_size=args.batch, shuffle=False, num_workers=0)

    model     = load_pretrained(args.weights, device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5)

    best_val  = float("inf")
    out_path  = Path(args.out)

    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        train_loss = run_epoch(model, train_loader, optimizer, device, train=True)
        val_loss   = run_epoch(model, val_loader,   optimizer, device, train=False)
        scheduler.step(val_loss)
        elapsed = time.time() - t0

        marker = ""
        if val_loss < best_val:
            best_val = val_loss
            torch.save(model.state_dict(), out_path)
            marker = "  <- melhor"

        print(f"Epoch {epoch:3d}/{args.epochs}  "
              f"train={train_loss:.4f}  val={val_loss:.4f}  "
              f"lr={optimizer.param_groups[0]['lr']:.2e}  "
              f"{elapsed:.1f}s{marker}")

    print(f"\nTreinamento concluido.")
    print(f"Melhor val loss : {best_val:.4f}")
    print(f"Modelo salvo    : {out_path}")
    print(f"\nUso:")
    print(f"  python tracknet_spike.py --video video.mp4 --weights {out_path}\n")


if __name__ == "__main__":
    main()
