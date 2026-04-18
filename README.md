# RallyVision

**Análise automática de beach tennis por vídeo com Inteligência Artificial.**

> Envie o vídeo da partida. A IA faz o resto.

---

## O Problema

Plataformas de analytics de beach tennis existentes (ex: BT Tracker) exigem um operador humano inserindo dados manualmente durante a partida — uma barreira técnica e financeira que exclui a maioria dos jogadores e equipes amadores.

## A Solução

RallyVision processa o vídeo da partida automaticamente usando visão computacional e IA para extrair:

- Rastreamento de jogadores e bola frame a frame
- Detecção de tacadas (saque, smash, defesa, lob)
- Mapa de calor de posicionamento e finalizações
- Estatísticas de rally, pontos e erros não forçados
- Relatórios PDF exportáveis por partida

Sem operador. Sem entrada manual. Só o vídeo.

---

## Diferencial Competitivo

| Recurso | BT Tracker | RallyVision |
|---|---|---|
| Entrada de dados | Manual (operador) | Automática (IA) |
| Custo operacional | Alto (precisa de staff) | Zero (upload direto) |
| Disponibilidade | Ao vivo apenas | Upload pós-jogo |
| Acesso amador | Limitado | Total |

---

## Stack Técnico (planejado)

- **Backend:** Python + FastAPI
- **IA/CV:** YOLOv8 (detecção), ByteTrack (rastreamento), OpenCV
- **Fila:** Celery + Redis
- **Frontend:** Next.js + Tailwind CSS
- **Infra:** AWS S3 (vídeos) + EC2 GPU (inferência)
- **Pagamentos:** Stripe + PIX

---

## Modelo de Negócio

| Plano | Preço | Limite |
|---|---|---|
| Free | R$0 | 2 vídeos/mês, stats básicas |
| Pro | R$49,90/mês | Ilimitado + relatórios PDF |
| Clube | R$199/mês | Multi-usuários + painel do treinador |

---

## Roadmap

Veja o [roadmap detalhado](docs/roadmap.md) e o [planejamento de atividades](docs/planning.md).

### Fases
- **Fase 1 — MVP** (meses 1–4): Pipeline de IA funcional + dashboard básico
- **Fase 2 — Analytics Avançado** (meses 4–7): Stats completas + relatórios PDF
- **Fase 3 — Escala** (meses 7–12): Tempo real, mobile, API para clubes

---

## Estrutura do Repositório

```
rallyvision/
├── docs/           # Documentação e planejamento
├── backend/        # API Python + FastAPI
├── frontend/       # App Next.js
├── ml/             # Modelos de visão computacional
└── infra/          # Configurações de infraestrutura
```

---

## Status

🟡 **Fase de Planejamento** — Repositório criado, documentação em andamento, desenvolvimento não iniciado.
