# Spike — Detecção YOLOv8 em Beach Tennis

Objetivo: validar se o YOLOv8 out-of-the-box consegue detectar bola e jogadores
em vídeos de beach tennis com acurácia suficiente para o MVP.

## Setup

```bash
cd ml/spike

# Criar ambiente virtual
python -m venv .venv
source .venv/bin/activate        # Linux/Mac
.venv\Scripts\activate           # Windows

# Instalar dependências (YOLOv8 baixa os pesos automaticamente na 1ª execução)
pip install -r requirements.txt
```

## Rodar

```bash
# Detecção básica (gera vídeo anotado + relatório JSON)
python detect.py --video caminho/para/video.mp4

# Modelo maior = mais preciso, mais lento
python detect.py --video video.mp4 --model yolov8m

# Só stats, sem gerar vídeo (mais rápido)
python detect.py --video video.mp4 --no-output

# Processar 1 frame a cada 3 (mais rápido, acurácia estatística suficiente)
python detect.py --video video.mp4 --sample-rate 3
```

## Modelos disponíveis

| Modelo | Velocidade | Acurácia | Uso |
|---|---|---|---|
| yolov8n | Muito rápida | Menor | Teste rápido |
| yolov8s | Rápida | Boa | **Padrão do spike** |
| yolov8m | Média | Melhor | Se `s` for insuficiente |
| yolov8l | Lenta | Ótima | Referência de acurácia máxima |

## O que o script detecta

- **Jogadores** (`person`, classe COCO 0)
- **Bola** (`sports ball`, classe COCO 32)

## Critérios de avaliação

| Métrica | Insuficiente | Aceitável | Ótimo |
|---|---|---|---|
| Bola detectada em % dos frames | < 40% | 40–70% | ≥ 70% |
| 2 jogadores visíveis em % dos frames | < 50% | 50–80% | ≥ 80% |
| Velocidade de processamento | > 5× tempo real | 3–5× | ≤ 3× |

## Saídas

- `{video}_annotated.mp4` — vídeo com bounding boxes desenhados
- `{video}_spike_report.json` — métricas brutas para análise

## Próximos passos conforme resultado

- **Bola ≥ 70%:** seguir com YOLOv8 sem fine-tuning no MVP
- **Bola 40–70%:** coletar dataset e fazer fine-tuning (algumas horas de trabalho)
- **Bola < 40%:** avaliar TrackNet (especializado em bolas de raquete)
