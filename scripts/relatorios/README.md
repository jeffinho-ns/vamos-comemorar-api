# Relatórios - Pasta centralizada

Esta pasta agrupa scripts e documentação de relatórios.

## Geração via interface web

**Página de relatórios (apenas admin):**
- URL: `/admin/relatorios-gerador`
- Não aparece no menu lateral — acesse diretamente pela URL
- Filtros: tipo (período/evento), estabelecimento, datas, evento
- Seções: resumo, gráficos, promoters, duplicidades, VIP, horários, estabilidade, anomalias, consistência
- Exportação: JSON

## Scripts manuais (linha de comando)

### Relatório Xic Hop (27/02/2026)
```bash
cd vamos-comemorar-api
node scripts/gerar_relatorio_xic_hop_27fev2026.js
```

### Relatório Highline - Período consolidado
```bash
cd vamos-comemorar-api
node scripts/gerar_relatorio_highline_periodo.js
```

## API de relatórios

- `GET /api/relatorios/estabelecimentos` — Lista estabelecimentos
- `GET /api/relatorios/eventos?establishment_id=&data_inicio=&data_fim=` — Lista eventos
- `POST /api/relatorios/gerar` — Gera relatório (body: tipo, establishment_id, data_inicio, data_fim, evento_id?)

## Tipos de relatório

| Tipo     | Descrição                    | Parâmetros obrigatórios                      |
|----------|------------------------------|---------------------------------------------|
| periodo  | Consolidado por período      | establishment_id, data_inicio, data_fim     |
| evento   | Evento específico            | establishment_id, data_inicio, data_fim, evento_id |
