"""
Dataset para fine-tuning do TrackNet com anotações manuais.

Cada amostra:
  - input : tensor (9, H, W) — 3 frames RGB concatenados
  - target: tensor (1, H, W) — heatmap Gaussiano centrado na bola (0.0–1.0)
             ou zeros se o frame central não tiver bola

Uso:
    from tracknet_dataset import TrackNetDataset
    ds = TrackNetDataset("video.mp4", "video_labels.csv")
"""

import csv
from pathlib import Path

import cv2
import numpy as np
import torch
from torch.utils.data import Dataset

INPUT_SIZE = (512, 288)   # largura × altura (mesmo do spike)
SIGMA = 5                 # raio do Gaussiano em pixels no espaço do modelo


def _gaussian_heatmap(x, y, w, h, sigma=SIGMA):
    """Heatmap Gaussiano (H, W) com pico em (x, y) no espaço do modelo."""
    xs = np.arange(w, dtype=np.float32)
    ys = np.arange(h, dtype=np.float32)
    gx = np.exp(-((xs - x) ** 2) / (2 * sigma ** 2))
    gy = np.exp(-((ys - y) ** 2) / (2 * sigma ** 2))
    heatmap = np.outer(gy, gx)
    return heatmap.astype(np.float32)


def _load_labels(csv_path):
    """Retorna dict {frame_idx: (x, y)} — apenas frames com bola (x >= 0)."""
    labels = {}
    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            x, y = int(row["x"]), int(row["y"])
            if x >= 0:
                labels[int(row["frame_idx"])] = (x, y)
    return labels


class TrackNetDataset(Dataset):
    def __init__(self, video_path, labels_csv, augment=True):
        self.video_path = str(video_path)
        self.augment = augment

        cap = cv2.VideoCapture(self.video_path)
        self.total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()

        all_labels = _load_labels(labels_csv)

        # Triplets válidos: (t-1, t, t+1) onde t tem bola anotada
        # t-1 e t+1 não precisam ter anotação — o modelo usa o contexto temporal
        self.samples = []
        for t, (x, y) in all_labels.items():
            if t > 0 and t < self.total_frames - 1:
                self.samples.append((t, x, y))

        self.model_w, self.model_h = INPUT_SIZE

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        t, bx, by = self.samples[idx]

        frames = self._read_triplet(t)

        # Escala a posição da bola para o espaço do modelo
        sx = self.model_w / self.orig_w
        sy = self.model_h / self.orig_h
        mx = bx * sx
        my = by * sy

        if self.augment:
            frames, mx, my = self._augment(frames, mx, my)

        tensor = self._frames_to_tensor(frames)
        heatmap = _gaussian_heatmap(mx, my, self.model_w, self.model_h)
        target = torch.from_numpy(heatmap).unsqueeze(0)  # (1, H, W)

        return tensor, target

    def _read_triplet(self, t):
        cap = cv2.VideoCapture(self.video_path)
        frames = []
        for i in (t - 1, t, t + 1):
            cap.set(cv2.CAP_PROP_POS_FRAMES, i)
            ret, f = cap.read()
            if not ret:
                f = np.zeros((self.orig_h, self.orig_w, 3), dtype=np.uint8)
            frames.append(f)
        cap.release()
        return frames

    def _frames_to_tensor(self, frames):
        channels = []
        for f in frames:
            r = cv2.resize(f, INPUT_SIZE)
            r = cv2.cvtColor(r, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            channels.append(r.transpose(2, 0, 1))
        stacked = np.concatenate(channels, axis=0)  # (9, H, W)
        return torch.from_numpy(stacked)

    def _augment(self, frames, mx, my):
        """Flip horizontal aleatório."""
        if np.random.rand() < 0.5:
            frames = [cv2.flip(f, 1) for f in frames]
            mx = self.model_w - 1 - mx
        return frames, mx, my
