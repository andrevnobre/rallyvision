# Planejamento de Atividades

Detalhamento das atividades por área para a Fase 1 (MVP).

---

## 1. Validação Técnica (semanas 1–2)

Antes de construir qualquer produto, validar se a IA consegue extrair dados úteis.

- [x] Recolher 10–20 vídeos de beach tennis (YouTube, clube piloto)
- [ ] Anotar manualmente 3 vídeos como ground truth
- [x] Testar YOLOv8 out-of-the-box na deteção de bola e jogadores
- [x] Avaliar acurácia e definir se fine-tuning é necessário no MVP
- [x] Documentar resultados e decidir viabilidade técnica

**Critério de Go/No-Go:** Deteção de bola ≥ 70% sem fine-tuning, ou caminho claro para chegar lá.

---

## 2. Pesquisa de Utilizador (semanas 1–3, paralelo)

Dois canais a validar em paralelo:

**Canal clube (co-fundador BT):**
- [ ] Identificar 10–15 clubes/academias de beach tennis em PT (Lisboa, Porto, Algarve, Setúbal)
- [ ] Conduzir conversas exploratórias com diretores/coaches: que métricas importam? disposição a pagar?
- [ ] Validar modelo de canal (clube revende a alunos a 50% do preço)
- [ ] Abrir porta no clube piloto (Espinho ou contacto mais direto)

**Canal individual (co-fundador BT + André):**
- [ ] Identificar 10 coaches individuais ou jogadores competitivos para entrevistar
- [ ] Validar pricing (€29/mês Pro) e casos de uso prioritários
- [ ] Perceber o que diferencia Pro individual do acesso via clube

---

## 3. Clube Piloto — Hardware (semanas 2–4)

- [ ] Comprar e testar câmeras (validar pack ideal: número, posicionamento, resolução)
- [ ] Instalar câmeras no clube piloto (Espinho)
- [ ] Definir processo de upload manual diário (câmera → cloud)
- [ ] Formalizar acordo com o clube (acesso gratuito 3 meses + 50% desconto permanente)

---

## 4. Infraestrutura Base (semanas 2–4)

- [ ] Configurar conta AWS (S3, EC2, IAM) — região eu-west-1 (Irlanda)
- [ ] Definir arquitetura de processamento (EC2 GPU spot instances)
- [ ] Configurar repositório: branches, CI/CD básico, linting
- [ ] Configurar ambiente de desenvolvimento local com Docker Compose
- [ ] Configurar base de dados (PostgreSQL) e cache (Redis)

---

## 5. Pipeline de IA (semanas 3–8)

### 5a. Deteção e Rastreamento
- [ ] Implementar deteção de quadra (homografia para normalizar perspectiva)
- [x] Implementar deteção de jogadores (YOLOv8 + ByteTrack) — validado em spike
- [x] Implementar deteção de bola (YOLOv8 fine-tuned) — `ball_yolo.pt` validado
- [ ] Pipeline de pré-processamento de vídeo (resize, fps normalization)

### 5b. Extração de Stats
- [ ] Detetar início e fim de rallies
- [ ] Calcular posicionamento médio por jogador
- [ ] Gerar dados para heatmap de posicionamento
- [ ] Detetar pontos (bola fora ou no chão)

### 5c. Fila de Processamento
- [ ] Implementar worker Celery para processar vídeos assincronamente
- [ ] Sistema de progresso/notificação (polling)
- [ ] Tratamento de erros e re-tentativas

---

## 6. Backend / API (semanas 5–10)

- [ ] Setup FastAPI com estrutura de projeto
- [ ] Autenticação JWT (login, registo, refresh token)
- [ ] Endpoint de upload de vídeo (multipart, validação de formato/tamanho)
- [ ] Endpoints de análise (submeter, estado, resultado)
- [ ] Endpoints de perfil individual (histórico de partidas, evolução)
- [ ] Endpoints de dashboard coach (lista de alunos, partidas)
- [ ] Sistema de planos e limites (Free: 2 vídeos/mês, Pro: 8 vídeos/mês, Club: 20 vídeos/mês)
- [ ] Integração Stripe EUR (checkout, webhooks, gestão de subscrição)

---

## 7. Frontend (semanas 7–12)

- [ ] Setup Next.js + Tailwind CSS + shadcn/ui
- [ ] Ecrãs de autenticação (login, registo, recuperação de password)
- [ ] Dashboard individual (lista de partidas analisadas + heatmap pessoal)
- [ ] Ecrã de upload com acompanhamento de progresso
- [ ] Ecrã de resultado de análise (stats + heatmap + gráficos)
- [ ] Perfil pessoal e histórico de evolução entre partidas
- [ ] Dashboard do coach (vista de múltiplos alunos — simplificada no MVP)
- [ ] Ecrã de planos e pagamento (EUR)

---

## 8. Aquisição Individual (semanas 8–16, paralelo)

- [ ] Criar perfil Instagram focado em beach tennis PT
- [ ] Publicar conteúdo mostrando analytics reais (antes/depois, heatmaps)
- [ ] Parceria com FPT (Federação Portuguesa de Ténis) para credibilidade
- [ ] Landing page com lista de espera antes do lançamento público

---

## 9. Lançamento MVP (semanas 12–16)

- [ ] Testes com clube piloto (Espinho) + 5 utilizadores individuais beta
- [ ] Ajustes baseados no feedback dos beta testers
- [ ] Setup de domínio, SSL, monitoramento (Sentry, logs)
- [ ] Landing page de pré-lançamento
- [ ] Lançamento público para lista de espera
- [ ] Meta: 10+ subscritores pagantes (Pro ou Club)

---

## Dependências Críticas

```
Validação técnica (1)
    └─> Pipeline de IA (5)
            └─> Backend API (6)
                    └─> Frontend (7)
                            └─> Lançamento (9)

Pesquisa de utilizador (2) ──> ajusta prioridades em (6) e (7)
Clube piloto / hardware (3) ──> gera dados para (5) + valida modelo de canal
Infra base (4) ──> habilita (5) e (6) em paralelo
Aquisição individual (8) ──> corre em paralelo com (7) e (9)
```

---

## Decisões em Aberto

- [x] **Nome final do produto:** BT Vision
- [x] **TrackNet vs. YOLOv8 para bola:** YOLOv8 fine-tuned (`ball_yolo.pt`) — validado em spike
- [x] **Modelo de GPU:** EC2 spot (AWS, tudo AWS, low-cost)
- [ ] **Pack de câmeras:** número e posicionamento ideal por court (a validar no piloto Espinho)
- [ ] **Equity split co-fundador:** a alinhar antes de avançar para o mercado
