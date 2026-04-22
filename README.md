# BT Vision

**Análise automática de beach tennis por vídeo com Inteligência Artificial.**

> Carrega o vídeo da partida. A IA faz o resto.

---

## O Problema

As plataformas de analytics de beach tennis existentes (ex: BT Tracker) exigem um operador humano a inserir dados manualmente durante a partida — uma barreira técnica e financeira que exclui a maioria dos jogadores e treinadores amadores.

## A Solução

BT Vision processa o vídeo da partida automaticamente usando visão computacional e IA para extrair:

- Rastreamento de jogadores e bola frame a frame
- Mapa de calor de posicionamento
- Estatísticas de rallies, pontos e erros não forçados
- Detecção de tacadas (saque, smash, defesa, lob)
- Relatórios PDF exportáveis por partida

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

## Stack Técnico (planeado)

- **Backend:** Python + FastAPI
- **IA/CV:** YOLOv8 (deteção), ByteTrack (rastreamento), OpenCV
- **Fila:** Celery + Redis
- **Frontend:** Next.js + Tailwind CSS
- **Infra:** AWS S3 (vídeos) + EC2 GPU eu-west-1 (inferência)
- **Pagamentos:** Stripe (EUR)

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
btvision/
├── docs/           # Documentação e planeamento
├── backend/        # API Python + FastAPI
├── frontend/       # App Next.js
├── ml/             # Modelos de visão computacional
└── infra/          # Configurações de infraestrutura
```

---

## Estado

🟡 **Fase de Validação** — Spike de ML em curso (TrackNet vs. YOLOv8). Desenvolvimento do produto não iniciado.
