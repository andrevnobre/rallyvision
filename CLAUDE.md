# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BT Vision is a beach tennis video analytics platform. Players/coaches upload match videos and receive automated stats (ball tracking, player heatmaps, rally extraction). Monetized as freemium SaaS (Free: 2 videos/month, Pro: €29/month, Club: €99/month). Market: Portugal first, then Brazil + Europe.

## Current Status

The ML spike phase is **complete**. Ball detection and player tracking are validated. The project is ready to move into backend/infra. Only `ml/spike/` has code; backend, frontend, and infra directories are empty.

- `ml/spike/` — TrackNetV2 vs. YOLOv8 validation code
- `docs/architecture.md` — Full system design and tech decisions
- `docs/planning.md` — Phase 1 (MVP) task breakdown with timeline
- `docs/roadmap.md` — 3-phase product roadmap

## ML Spike Commands

All commands run from `ml/spike/` with the `.venv` activated:

```bash
cd ml/spike
.venv\Scripts\Activate.ps1      # PowerShell
# .venv\Scripts\activate        # CMD

# Run TrackNet ball detection spike
python tracknet_spike.py video.mp4 --weights tracknet_weights.pt

# Fine-tune TrackNet on labeled data
python tracknet_train.py video.mp4 video_labels.csv --epochs 30

# Manually label ball positions (interactive GUI)
python tracknet_label.py video.mp4 video_labels.csv

# YOLOv8 baseline detection
python detect.py video.mp4
```

## ML Architecture

**Ball tracking decision:** TrackNetV2 vs. YOLOv8 — still being evaluated. Threshold: ≥60% detection rate = approved for MVP, 35–60% = needs fine-tuning, <35% = insufficient.

**TrackNet input format:** Three consecutive RGB frames stacked as `(9, 288, 512)` tensor (channel-first, 3 frames × 3 channels). Output is a 256-class heatmap discretizing confidence.

**Training pipeline:**
- `tracknet_model.py` — exact pretrained architecture (no skip connections — required to match checkpoint)
- `tracknet_dataset.py` — loads frame triplets + generates Gaussian heatmap labels (σ=5px) from `frame_idx,x,y` CSV
- `tracknet_train.py` — fine-tunes with weighted BCE (10× weight on ball pixels), saves best to `bt_tracknet.pt`
- `tracknet_label.py` — interactive frame-by-frame labeling GUI (LMB=mark, N=no ball, S=save)

## Planned Stack (not yet built)

```
Frontend (Next.js)  →  Backend API (FastAPI + Celery)  →  ML Worker (GPU)
                              ↕              ↕
                        PostgreSQL        Redis + S3
```

- **Backend:** FastAPI (async), Celery workers for long-running jobs, JWT auth, Stripe billing (EUR)
- **Frontend:** Next.js with SSR, upload interface, stats dashboard, heatmaps
- **Infra:** AWS EC2 GPU for processing (eu-west-1), S3 for video storage, Docker Compose locally

## Key Design Decisions (from docs/architecture.md)

- Celery chosen over direct async because video processing is CPU/GPU-bound and can take minutes
- ByteTrack for player tracking (pairs with YOLOv8 detections)
- Homography for court normalization (map pixel positions to real-world court coordinates)
- MVP success criteria: ball detection ≥80% on well-lit video, processing ≤3× video duration

## Open Questions

- TrackNet vs. YOLOv8 final decision (pending spike results)
- GPU hosting: EC2 spot vs. Replicate/RunPod
- Camera hardware pack: number and positioning per court (to validate at pilot club)
- Co-founder equity split
