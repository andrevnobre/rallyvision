# BT Vision

**Análise automática de beach tennis por vídeo com Inteligência Artificial.**

> Carrega o vídeo da partida. A IA faz o resto.

---

## O Problema

As plataformas de analytics de beach tennis existentes (ex: BT Tracker) exigem um operador humano a inserir dados manualmente durante a partida — uma barreira técnica e financeira que exclui a maioria dos jogadores e treinadores amadores.

## A Solução

BT Vision processa o vídeo da partida automaticamente usando visão computacional e IA para extrair:

- Rastreamento de jogadores e bola frame a frame
- Mapa de calor de posicionamento (bola + jogadores)
- Estatísticas de rallies e duração média
- Detecção de tacadas (saque, smash, defesa, lob) — em desenvolvimento
- Relatórios PDF exportáveis por partida — em desenvolvimento

Sem operador. Sem entrada manual. Só o vídeo.

---

## Diferencial Competitivo

| Funcionalidade | BT Tracker | BT Vision |
|---|---|---|
| Entrada de dados | Manual (operador) | Automática (IA) |
| Custo operacional | Alto (precisa de staff) | Zero (upload direto) |
| Disponibilidade | Ao vivo apenas | Upload pós-jogo |
| Acesso amador | Limitado | Total |

---

## Stack Técnico

- **Backend:** Python + FastAPI + Celery
- **IA/CV:** YOLOv8 fine-tuned (`ball_yolo.pt`) + ByteTrack + OpenCV + homografia
- **Fila:** Celery + Redis / SQS (prod)
- **Frontend:** Next.js 15 + Tailwind CSS
- **Infra:** AWS S3 (vídeos) + EC2 GPU spot g4dn/g5.xlarge (inferência) + Lightsail (API+frontend)
- **Pagamentos:** Stripe (EUR) — em desenvolvimento

---

## Modelo de Negócio

| Plano | Preço | Limite |
|---|---|---|
| Free | €0 | 2 vídeos/mês, stats básicas |
| Pro | €29/mês | 8 vídeos/mês + relatórios PDF |
| Club | €99/mês | 20 vídeos/mês + painel do treinador |

Mercado inicial: Portugal. Expansão: Brasil + Europa.

---

## Roadmap

Veja o [roadmap detalhado](docs/roadmap.md) e o [planejamento de atividades](docs/planning.md).

### Fases
- **Fase 1 — MVP** (meses 1–4): Pipeline de IA + self-serve individual + clube piloto PT
- **Fase 2 — Diferenciação** (meses 4–9): Integração de câmeras + analytics avançados
- **Fase 3 — Brasil + Escala** (meses 9–18): Expansão Brasil + app mobile + LLM

---

## Estrutura do Repositório

```
rallyvision/
├── docs/           # Documentação e planeamento
├── backend/        # API Python + FastAPI + Celery worker
├── frontend/       # App Next.js 15
├── ml/             # Modelos e scripts de visão computacional
│   └── spike/      # Pipeline validado: ball_yolo.pt, extract_training_frames.py
└── infra/          # Docker Compose local + GPU worker EC2
```

---

## Como Correr Localmente

```bash
# Pré-requisitos: Docker + Docker Compose

cd infra
cp .env.example .env   # preencher variáveis (ou usar defaults para modo local)
docker compose up -d

# API:      http://localhost:8000
# Frontend: http://localhost:3000
```

Em modo local (sem credenciais AWS), os vídeos e thumbnails são guardados em disco (`/uploads`). O worker Celery processa os vídeos usando CPU (sem GPU).

---

## Estado

🟢 **MVP em produção** — Pipeline de IA validado e funcional. App disponível em [bt-vision.com](https://bt-vision.com).

| Componente | Estado |
|---|---|
| Upload de vídeo (S3 multipart) | ✅ Produção |
| Seleção de ROI guiada + marcação da rede | ✅ Produção |
| Deteção de bola (YOLOv8 fine-tuned) | ✅ Produção |
| Deteção de jogadores (YOLOv8 + ByteTrack) | ✅ Produção |
| Homografia + heatmaps normalizados | ✅ Produção |
| Rally detection | ✅ Produção |
| GPU worker EC2 spot (auto-scaling) | ✅ Produção |
| Autenticação JWT | ✅ Produção |
| Pagamentos (Stripe) | 🔲 Planeado |
| Deteção de pontos e erros | 🔲 Em desenvolvimento |
| Relatórios PDF | 🔲 Planeado |
