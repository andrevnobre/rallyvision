# Arquitetura Técnica

## Visão Geral

```
┌─────────────┐     ┌──────────────────────────────────────────┐
│   Usuário   │────▶│              Frontend (Next.js)           │
└─────────────┘     └──────────────┬───────────────────────────┘
                                   │ HTTPS
                    ┌──────────────▼───────────────────────────┐
                    │           Backend API (FastAPI)           │
                    │  Auth │ Upload │ Stats │ Planos │ Stripe  │
                    └──┬──────────┬──────────────┬─────────────┘
                       │          │              │
              ┌────────▼──┐  ┌────▼──────┐  ┌───▼────────┐
              │ PostgreSQL│  │  S3/GCS   │  │   Redis    │
              │  (dados)  │  │ (vídeos)  │  │  (cache +  │
              └───────────┘  └─────┬─────┘  │   fila)    │
                                   │        └──────┬──────┘
                                   │               │
                    ┌──────────────▼───────────────▼──────────┐
                    │          Worker (Celery + GPU)           │
                    │  ┌─────────────────────────────────────┐ │
                    │  │        Pipeline de IA               │ │
                    │  │  1. Pré-processamento (OpenCV)      │ │
                    │  │  2. Detecção quadra (homografia)    │ │
                    │  │  3. Detecção jogadores (YOLOv8)     │ │
                    │  │  4. Rastreamento (ByteTrack)        │ │
                    │  │  5. Detecção bola (YOLOv8/TrackNet) │ │
                    │  │  6. Extração de stats               │ │
                    │  │  7. Geração de heat maps            │ │
                    │  └─────────────────────────────────────┘ │
                    └──────────────────────────────────────────┘
```

## Fluxo de Análise de Vídeo

```
1. Usuário faz upload do vídeo
        ↓
2. API valida (formato, tamanho, plano do usuário)
        ↓
3. Vídeo é salvo no S3 com ID único
        ↓
4. Job enfileirado no Redis (Celery)
        ↓
5. Worker GPU pega o job e inicia processamento
        ↓
6. Progress updates via polling ou websocket
        ↓
7. Resultados salvos no PostgreSQL
        ↓
8. Usuário vê dashboard com stats e heat maps
```

## Modelos de IA

### Detecção de Objetos
- **Modelo:** YOLOv8n/s (trade-off velocidade × acurácia)
- **Classes:** jogador_time_a, jogador_time_b, bola, quadra
- **Fine-tuning:** Dataset próprio coletado de vídeos públicos

### Rastreamento
- **Jogadores:** ByteTrack (multi-object tracking)
- **Bola:** TrackNet (especializado para bolas de raquete — trajetória mesmo em oclusão)

### Detecção de Quadra
- **Técnica:** Detecção de linhas (Hough Transform) + homografia
- **Saída:** Matriz de transformação perspectiva → coordenadas normalizadas da quadra

## Decisões de Design

### Por que FastAPI?
- Performance assíncrona nativa (importante para upload de vídeos grandes)
- Tipagem com Pydantic
- OpenAPI automático

### Por que Celery + Redis?
- Processamento de vídeo pode levar minutos — não pode bloquear a API
- Celery permite priorizar jobs (usuários Pro na frente)
- Redis serve como broker e cache de sessões

### Por que Next.js?
- SSR para SEO da landing page
- App Router para dashboard (cliente)
- Deploy simples na Vercel

## Estimativas de Custo (MVP)

| Serviço | Custo estimado |
|---|---|
| EC2 g4dn.xlarge (GPU, spot) | ~US$0,20/hora |
| Processamento de 1h de vídeo | ~30–40 min GPU ≈ US$0,10–0,15 |
| S3 (100 vídeos × 2GB) | ~US$4,60/mês |
| RDS PostgreSQL (db.t3.micro) | ~US$15/mês |
| ElastiCache Redis (cache.t3.micro) | ~US$13/mês |
| **Total infra MVP** | **~US$50–80/mês** |
