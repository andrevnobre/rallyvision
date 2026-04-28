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

### Sistema Administrativo

O backoffice reutiliza o JWT existente — não há sistema de auth separado.

**Modelo `User`** — campos adicionais:
- `is_admin: bool` — controla acesso às rotas `/admin`
- `is_suspended: bool` — bloqueia login (403) sem apagar dados

**Seed automático:** na inicialização da API, se `ADMIN_EMAIL` estiver definido nas env vars, executa `UPDATE users SET is_admin = TRUE WHERE email = :e`. Requer recreação do container (não apenas restart) para ler novas env vars.

**Dependency `require_admin`** (`services/auth.py`) — verifica `is_admin` após `get_current_user`; retorna 403 se falhar. Todas as rotas `/admin/*` dependem dela.

**Endpoints REST** (`routes/admin.py`):

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/admin/metrics` | Totais por plano/estado, vídeos hoje, erros activos |
| GET | `/admin/users` | Lista paginada; filtro `?plan=` |
| GET | `/admin/users/{id}` | Detalhe + últimos 20 vídeos |
| PATCH | `/admin/users/{id}` | Alterar plano / suspender conta |
| GET | `/admin/videos` | Lista paginada; filtro `?status=` |
| POST | `/admin/videos/{id}/retry` | Re-enfileirar job `failed` → `pending` |
| DELETE | `/admin/videos/{id}` | Eliminar vídeo + S3 (via `delete_video_files`) |

**Frontend** — secção `src/app/admin/` com layout protegido (client-side guard via `/auth/me`) e quatro páginas: dashboard, lista de utilizadores, detalhe de utilizador, lista de vídeos.

### Por que Next.js?
- SSR para SEO da landing page
- App Router para dashboard (cliente)
- Deploy simples na Vercel

## Stack de Produção (AWS, low-cost)

```
CloudFront + S3 (frontend estático)
        ↓
EC2 t3.small — Docker Compose
  ├── FastAPI (API)
  ├── Celery worker (CPU — gestão de jobs)
  ├── PostgreSQL 15
  └── Redis 7
        ↓ (enfileira job)
EC2 g4dn.xlarge spot (GPU worker)
  └── Celery worker — pipeline de IA
        ↓
S3 (vídeos)
```

O GPU worker arranca automaticamente via Lambda quando há jobs na fila SQS e termina sozinho após idle de 5 min. Custo zero quando não há processamento.

## Estimativas de Custo (MVP)

| Serviço | Custo estimado |
|---|---|
| EC2 t3.small (API + DB + Redis) | ~US$15/mês |
| EC2 g4dn.xlarge spot (GPU, só quando processa) | ~US$0,20/hora |
| S3 (vídeos + frontend) | ~US$2/mês |
| CloudFront | ~US$1/mês |
| **Total infra MVP** | **~US$20–30/mês** |

Comparado com a arquitetura original (RDS + ElastiCache separados): -US$28/mês ao colapsar tudo numa instância t3.small via Docker Compose.
