# Roadmap

## Fase 1 — MVP (meses 1–4)

**Objetivo:** Produto funcional com self-serve individual + clube piloto operacional em Portugal.

### Entregas
- [x] Pipeline de processamento de vídeo (upload → análise → resultado)
- [x] Deteção de quadra, jogadores e bola por frame
- [x] Heatmap de posicionamento + contagem de rallies
- [x] Autenticação de utilizadores
- [x] Exportação de relatório de análise em PDF (versão básica — jsPDF) ← *versão 3-níveis fica para Fase 2*
- [x] Perfil pessoal com histórico de partidas (canal individual)
- [x] Dashboard básico para coach (lista de alunos, detalhe por aluno, vídeos partilhados)
- [x] Partilha de vídeos: link público sem conta + participantes registados
- [x] Backoffice administrativo (métricas, gestão de utilizadores/planos, retry de jobs)
- [x] Sistema de anotações interativas: clique na quadra ou no vídeo, pins com fade no replay, tags, privacidade, respostas
- [ ] Pagamento Stripe (EUR): Free €0, Pro €29/mês, Club €99/mês
- [ ] Clube piloto (Espinho): câmeras instaladas, upload manual diário

### Critérios de Sucesso do MVP
- Acurácia de deteção de bola ≥ 80% em vídeos reais PT
- Processamento ≤ 3× a duração do vídeo
- 1 clube piloto operacional com câmeras
- 10+ utilizadores pagantes (Pro ou Club)

---

## Fase 2 — Diferenciação e Expansão de Clube (meses 4–9)

**Objetivo:** Escalar o modelo de clube em PT + enriquecer analytics individuais.

### Entregas
- [ ] Integração de câmeras no clube (auto-recording → auto-upload sem intervenção manual)
- [ ] Dashboard do coach: evolução de alunos entre partidas
- [ ] Classificação de tacadas (saque, smash, defesa, lob, bandeja)
- [ ] Análise de erros não forçados
- [ ] Relatórios PDF em 3 níveis (Básico, Padrão, Avançado)
- [ ] Recomendações baseadas em dados (sem LLM)
- [ ] 5+ clubes PT no plano Club
- [ ] **Kit 2 câmeras (lateral + fundo elevado):** fusão de vídeos multi-ângulo para posição 3D real da bola (elimina proxy do jogador; inclui guia de instalação e sincronização por áudio)

#### Nota técnica — fusão multi-câmera
Câmera lateral capta bem o eixo dos 16m (nx) mas tem ambiguidade de profundidade (ny) quando a bola está no ar.
Câmera de fundo elevado resolve o ny com precisão.
A fusão é feita por frame após sincronização temporal (clap/apito no início ou timecode).
Cada câmera mantém a sua homografia; o pipeline extrai nx da lateral e ny do fundo, combinando numa posição 2D normalizada sem workarounds.
Candidato a feature exclusiva do plano **Club**.

---

## Fase 3 — Brasil + Escala (meses 9–18)

**Objetivo:** Expansão para o Brasil (mercado principal) + consolidar presença europeia.

### Entregas
- [ ] Adaptação de pricing para BRL + integração PIX
- [ ] GTM Brasil: parcerias com federação (CBBeT), content marketing PT→BR
- [ ] App mobile (iOS + Android) para upload direto do telemóvel
- [ ] Recomendações de treino geradas por LLM com base nos dados
- [ ] API pública para clubes e sistemas de gestão

---

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Acurácia insuficiente do modelo no MVP | Alta | Alto | Modo híbrido: AI + correção manual opcional |
| Mercado PT pequeno demais para sustentar 2 fundadores | Média | Alto | PT é validador; Brasil é o mercado de escala (Fase 3) |
| Clube piloto não converter após fase gratuita | Média | Alto | Alinhar incentivo (50% desconto permanente) desde o início |
| Custo de GPU inviável em escala | Média | Médio | Processar em batch; cap de vídeos por plano |
| Falta de dados de treino PT para fine-tuning | Alta | Médio | Câmeras no clube piloto geram dados contínuos |
| Concorrente lançar analytics de beach tennis primeiro | Baixa | Alto | Velocidade de execução; foco no mercado PT/BR que concorrentes ignoram |
