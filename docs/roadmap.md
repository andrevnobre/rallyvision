# Roadmap

## Fase 1 — MVP (meses 1–4)

**Objetivo:** Provar que a visão computacional extrai dados confiáveis de vídeos de beach tennis.

### Entregas
- [ ] Pipeline de processamento de vídeo (upload → análise → resultado)
- [ ] Detecção de quadra, jogadores e bola por frame
- [ ] Heat map de posicionamento
- [ ] Contagem de rallies e pontos
- [ ] Dashboard web básico
- [ ] Autenticação de usuários
- [ ] Integração de pagamento (Stripe + PIX)
- [ ] Planos Free e Pro

### Critérios de Sucesso do MVP
- Acurácia de detecção de bola ≥ 80% em vídeos com boa iluminação
- Tempo de processamento ≤ 3× a duração do vídeo
- 10 usuários pagantes no primeiro mês pós-lançamento

---

## Fase 2 — Analytics Avançado (meses 4–7)

**Objetivo:** Paridade de funcionalidades com concorrentes + relatórios profissionais.

### Entregas
- [ ] Classificação de tipo de tacada (saque, smash, defesa, lob, bandeja)
- [ ] Detecção automática de placar
- [ ] Análise de saque (zona de destino, efetividade)
- [ ] Análise de erros não forçados
- [ ] Relatórios PDF em 3 níveis (Básico, Padrão, Avançado)
- [ ] Histórico e evolução entre partidas
- [ ] Plano Clube (multi-usuário)

---

## Fase 3 — Escala e Diferenciação (meses 7–12)

**Objetivo:** Tornar-se referência no mercado e criar barreiras de entrada.

### Entregas
- [ ] Análise em tempo real (stream de câmera)
- [ ] App mobile (iOS + Android) para gravação e upload direto
- [ ] Recomendações de treino geradas por LLM com base nos dados
- [ ] API pública para academias e sistemas de gestão de clubes
- [ ] Suporte a padel e tênis de praia

---

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Acurácia insuficiente do modelo no MVP | Alta | Alto | Modo híbrido: AI + correção manual opcional |
| Custo de GPU inviável em escala | Média | Alto | Processar em batch; cobrar por crédito no Free |
| Falta de dados de treino para beach tennis | Alta | Médio | Coletar vídeos públicos + parcerias com federações |
| Concorrente lançar feature de AI primeiro | Baixa | Alto | Velocidade de execução; focar no mercado amador |
