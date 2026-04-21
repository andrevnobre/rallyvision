# Resultados dos Spikes — Detecção de Bola

## Resumo

| Abordagem | Detecção | Qualidade | Veredicto |
|---|---|---|---|
| YOLOv8s COCO (out-of-the-box) | 17% | Falsos positivos | Insuficiente |
| TrackNetV2 pré-treinado (badminton) | 63% | Falsos positivos | Insuficiente |
| YOLOv8s fine-tuned (Roboflow beach tennis) | 16% conf≥0.3 / 42% conf≥0.1 | Alta precisão, recall baixo | Promissor |

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

## Hipótese em validação

Gravar novo vídeo com ângulo e condições controladas (câmera lateral, altura 2-3m, quadra inteira no frame, boa iluminação) e testar com `ball_yolo.pt --conf 0.3`. Se o recall subir mantendo a precision, confirma que o modelo é viável e o próximo passo é anotar frames desse novo vídeo para fine-tuning no contexto real.

---

## Próximos passos

1. **Validar hipótese do ângulo** — novo vídeo com setup controlado + `yolo_ball_spike.py --conf 0.3`
2. **Se resultado melhorar:** anotar 200-300 frames com `tracknet_label.py` e fazer fine-tuning em cima de `ball_yolo.pt`
3. **Se resultado não melhorar:** investigar qualidade do dataset ou tentar TrackNetV2 fine-tuned com dados próprios

---

## Decisões de produto derivadas dos spikes

- **Ângulo padrão recomendado:** lateral, meio da quadra, altura 2-3m, quadra inteira no frame
- **Resolução mínima:** 720p — 1080p preferível
- **FPS:** 30fps suficiente para o MVP
- **Armazenamento:** processar e descartar vídeo original, guardar apenas resultados extraídos
- **Go-to-market inicial:** clubes com câmera fixa instalada, não jogadores individuais
