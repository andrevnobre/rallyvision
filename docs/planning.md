# Planejamento de Atividades

Detalhamento das atividades por área para a Fase 1 (MVP).

---

## 1. Validação Técnica (semanas 1–2)

Antes de construir qualquer produto, validar se a IA consegue extrair dados úteis.

- [ ] Coletar 10–20 vídeos de beach tennis (YouTube, parceiros)
- [ ] Anotar manualmente 3 vídeos como ground truth
- [ ] Testar YOLOv8 out-of-the-box na detecção de bola e jogadores
- [ ] Avaliar acurácia e definir se fine-tuning é necessário no MVP
- [ ] Documentar resultados e decidir viabilidade técnica

**Critério de Go/No-Go:** Detecção de bola ≥ 70% sem fine-tuning, ou caminho claro para chegar lá.

---

## 2. Pesquisa de Usuário (semanas 1–3, paralelo)

- [ ] Identificar 10 coaches ou jogadores competitivos para entrevistar
- [ ] Conduzir entrevistas de 20 min: dores atuais, uso de analytics, disposição a pagar
- [ ] Validar pricing (R$49,90/mês Pro) e casos de uso prioritários
- [ ] Documentar insights e ajustar proposta de valor se necessário

---

## 3. Infraestrutura Base (semanas 2–4)

- [ ] Configurar conta AWS (S3, EC2, IAM)
- [ ] Definir arquitetura de processamento (GPU spot instances vs. serviço gerenciado)
- [ ] Configurar repositório: branches, CI/CD básico, linting
- [ ] Configurar ambiente de desenvolvimento local com Docker Compose
- [ ] Configurar banco de dados (PostgreSQL) e cache (Redis)

---

## 4. Pipeline de IA (semanas 3–8)

### 4a. Detecção e Rastreamento
- [ ] Implementar detecção de quadra (homografia para normalizar perspectiva)
- [ ] Implementar detecção de jogadores (YOLOv8 + ByteTrack)
- [ ] Implementar detecção de bola (YOLOv8 fine-tuned ou TrackNet)
- [ ] Pipeline de pré-processamento de vídeo (resize, fps normalization)

### 4b. Extração de Stats
- [ ] Detectar início e fim de rallies
- [ ] Calcular posicionamento médio por jogador
- [ ] Gerar dados para heat map de finalizações
- [ ] Detectar pontos (bola fora ou no chão)

### 4c. Fila de Processamento
- [ ] Implementar worker Celery para processar vídeos assincronamente
- [ ] Sistema de progresso/notificação (webhook ou polling)
- [ ] Tratamento de erros e re-tentativas

---

## 5. Backend / API (semanas 5–10)

- [ ] Setup FastAPI com estrutura de projeto
- [ ] Autenticação JWT (login, registro, refresh token)
- [ ] Endpoint de upload de vídeo (multipart, validação de formato/tamanho)
- [ ] Endpoints de análise (submeter, status, resultado)
- [ ] Endpoints de dashboard (stats por partida, histórico)
- [ ] Sistema de planos e limites (Free: 2 vídeos/mês)
- [ ] Integração Stripe (checkout, webhooks, gestão de assinatura)
- [ ] Integração PIX (via Stripe ou gateway nacional)

---

## 6. Frontend (semanas 7–12)

- [ ] Setup Next.js + Tailwind CSS + shadcn/ui
- [ ] Telas de autenticação (login, registro, recuperação de senha)
- [ ] Dashboard principal (lista de partidas analisadas)
- [ ] Tela de upload com acompanhamento de progresso
- [ ] Tela de resultado de análise (stats + heat map + gráficos)
- [ ] Tela de planos e pagamento
- [ ] Tela de perfil e histórico

---

## 7. Lançamento MVP (semanas 12–16)

- [ ] Testes com 5 usuários beta (coaches/jogadores parceiros)
- [ ] Ajustes baseados no feedback dos beta testers
- [ ] Setup de domínio, SSL, monitoramento (Sentry, logs)
- [ ] Landing page de pré-lançamento
- [ ] Lançamento para lista de espera
- [ ] Primeiras 10 assinaturas pagas

---

## Dependências Críticas

```
Validação técnica (1)
    └─> Pipeline de IA (4)
            └─> Backend API (5)
                    └─> Frontend (6)
                            └─> Lançamento (7)

Pesquisa de usuário (2) ──> ajusta prioridades em (5) e (6)
Infra base (3) ──> habilita (4) e (5) em paralelo
```

---

## Decisões em Aberto

- [ ] **Nome final do produto:** RallyVision é provisório
- [ ] **Esporte foco do MVP:** Só beach tennis ou incluir padel?
- [ ] **Modelo de GPU:** EC2 spot vs. Lambda (sem GPU, mais lento) vs. Replicate/RunPod
- [ ] **TrackNet vs. YOLOv8 para bola:** TrackNet é especializado em bolas de raquete, pode ter melhor acurácia
- [ ] **Parceria com federação:** Abordagem para conseguir dados e validação
