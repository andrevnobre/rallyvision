# Resultados dos Spikes — Detecção de Bola e Jogadores

## Resumo

| Abordagem | Detecção | Qualidade | Veredicto |
|---|---|---|---|
| YOLOv8s COCO (out-of-the-box) | 17% | Falsos positivos | Insuficiente |
| TrackNetV2 pré-treinado (badminton) | 63% | Falsos positivos | Insuficiente |
| YOLOv8s fine-tuned (Roboflow beach tennis) | 16% conf≥0.3 / 42% conf≥0.1 | Alta precisão, recall baixo | Promissor |
| YOLOv8s fine-tuned + ângulo correto | 58% médio (excl. ângulos não-suportados) | Boa qualidade | **APROVADO** |
| Pipeline combinado bola + jogadores (ByteTrack) | — | Muito boa qualidade visual | **VALIDADO** |

---

## Spike 1 — YOLOv8s COCO

**Modelo:** YOLOv8s pré-treinado no COCO (classe `sports ball`, id 32)
**Vídeo:** `video.mp4` e `teste.mp4` (334k frames)
**Resultado:** 17% de detecção
**Problema:** O COCO não tem exemplos suficientes de bola de beach tennis. O modelo nunca viu esse objeto nesse contexto visual.

---

## Spike 2 — TrackNetV2 pré-treinado

**Modelo:** TrackNetV2 com pesos pré-treinados em badminton (`tracknet_weights.pt`)
**Vídeo:** `video.mp4`
**Resultado:** 63% de detecção, confiança média 0.66
**Problema:** Alta taxa de falsos positivos — o modelo apontava jogadores, sombras e linhas da quadra como bola. O domínio visual do badminton é muito diferente do beach tennis.
**Report:** `video_tracknet_report.json`

---

## Spike 3 — YOLOv8s Fine-tuned

**Modelo:** YOLOv8s fine-tuned sobre dataset Roboflow `beach-tennis-mg42r` (v5, 4444 imagens, CC BY 4.0)
**Pesos base:** `yolov8s.pt` → fine-tuning 100 épocas, GPU T4, ~3.8h
**Resultado de treino:** mAP50 0.473, Precision 0.867, Recall 0.441
**Vídeo de teste:** `video.mp4`

| Threshold | Detecção | Confiança média | Qualidade |
|---|---|---|---|
| conf ≥ 0.30 | 16% | 0.595 | Quase sem falsos positivos |
| conf ≥ 0.10 | 42% | 0.297 | Muitos falsos positivos |

**Conclusão principal:** o modelo aprendeu o que é uma bola de beach tennis — quando detecta com confiança ≥ 0.3, está correto. O problema é recall baixo: perde muitos frames onde a bola está presente.

**Causa provável:** o dataset de treino tem condições de captação diferentes do vídeo de teste (ângulo, distância, iluminação). O modelo ficou especializado no contexto visual do dataset.

**Pesos salvos:** `ball_yolo.pt` (Google Drive: `ball_yolo_v1_roboflow_beach_tennis.pt`)

---

## Spike 4 — YOLOv8 Fine-tuned com vídeos próprios (ângulo correto)

**Data:** 2026-04-22
**Modelo:** `ball_yolo.pt` (mesmo do Spike 3)
**Vídeos:** 11 vídeos gravados no mesmo dia, 1080p/60fps, posições lateral e de fundo
**Script:** `yolo_ball_spike.py --conf 0.3`

**Hipótese confirmada:** o problema de recall do Spike 3 era o ângulo/condições do vídeo de teste, não o modelo.

| Vídeo | Frames | Detecção | Conf. média | Observação |
|---|---|---|---|---|
| 103724410 | 483 | 69.9% | 0.55 | |
| 103854981 | 1178 | 20.0% | 0.48 | |
| 103934651 | 585 | 63.2% | 0.52 | |
| 103948680 | 1050 | 55.7% | 0.53 | |
| 104013491 | 588 | 100% | 0.62 | |
| 104030853 | 580 | 51.4% | 0.50 | |
| 104059187 | 652 | 3.7% | 0.47 | ⚠️ corner direito — ângulo não-suportado |
| 104118377 | 939 | 30.1% | 0.54 | |
| 105252577 | 211 | 37.0% | 0.50 | |
| 105302298 | 611 | 99.8% | 0.53 | |
| 105745492 | 4099 | 12.2% | 0.58 | ⚠️ fundo baixo (~2m) — ângulo não-suportado |

**Excluindo os 2 ângulos não-suportados (9 vídeos, 6656 frames):** detecção média **58.3%**.

**Veredicto:** APROVADO para MVP com posições suportadas definidas. Corner e altura <2m são ângulos não-suportados na v1.

---

## Spike 5 — Pipeline combinado: bola + jogadores

**Data:** 2026-04-22
**Script:** `combined_spike.py`
**Modelos:** `ball_yolo.pt` (bola) + `yolov8s.pt` COCO (jogadores, ByteTrack)

**Abordagem:** dois modelos em série no mesmo frame, um único passe por vídeo.
- Bola detectada por `ball_yolo.pt` com ROI da quadra
- Jogadores detectados por `yolov8s.pt` + ByteTrack para IDs persistentes entre frames

**Resultado:** qualidade visual muito boa — bola e jogadores identificados corretamente, IDs de jogadores estáveis ao longo do vídeo.

**Veredicto:** Pipeline combinado VALIDADO para MVP.

---

## Decisões fechadas

| Decisão | Resultado |
|---|---|
| TrackNet vs. YOLOv8 para bola | **YOLOv8 fine-tuned** (`ball_yolo.pt`) |
| Rastreamento de jogadores | **YOLOv8s COCO + ByteTrack** |
| Ângulos suportados na v1 | **Lateral e fundo elevado (>2m)** |
| Resolução mínima | **720p** (1080p recomendado) |
| FPS mínimo | **30fps** (60fps preferível) |
| Câmera go-to-market | **Clube com câmera fixa** (não jogador individual) |

---

## Próximos passos

1. ~~Validar hipótese do ângulo~~ ✓
2. ~~Pipeline combinado bola + jogadores~~ ✓
3. **Infraestrutura:** configurar AWS + Docker Compose + CI/CD
4. **Backend:** FastAPI + Celery worker para processar vídeos
5. **Pipeline de produção:** integrar `combined_spike.py` no worker Celery
