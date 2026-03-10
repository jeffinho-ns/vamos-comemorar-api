# Relatórios - Vamos Comemorar API

## Relatório Xic Hop (27/02/2026)

## Como gerar o relatório

```bash
cd vamos-comemorar-api
node scripts/gerar_relatorio_xic_hop_27fev2026.js
```

Serão gerados:

- **relatorio_xic_hop_27fev2026.json** – Dados brutos em JSON
- **relatorio_xic_hop_27fev2026.md** – Relatório em Markdown
- **relatorio_xic_hop_27fev2026.html** – Relatório em HTML (formato Word)

## Como obter o documento em Word (.docx)

### Opção 1: Abrir o HTML no Word
1. Abra o Microsoft Word
2. **Arquivo** → **Abrir**
3. Selecione `relatorio_xic_hop_27fev2026.html`
4. **Arquivo** → **Salvar como** → escolha formato **Documento do Word (.docx)**

### Opção 2: Usar Pandoc (se instalado)
```bash
pandoc relatorio_xic_hop_27fev2026.md -o relatorio_xic_hop_27fev2026.docx
```

### Opção 3: Copiar do Markdown
1. Abra `relatorio_xic_hop_27fev2026.md` no VS Code ou outro editor
2. Copie o conteúdo
3. Cole no Word – as tabelas serão preservadas

## Conteúdo do relatório

- **Resumo geral** – Total de pessoas, check-ins, taxa
- **Por promoter** – Nomes na lista vs check-ins (ex: "Michele: 60 na lista, 37 check-ins")
- **Duplicidades** – Nomes repetidos nas listas de promoters
- **Entrada VIP** – Convidados com entrada VIP a noite toda
- **Horários de entrada** – Lista ordenada de todos os check-ins
- **Estabilidade** – Confirmação de que o sistema operou sem falhas

---

## Relatório Highline - Período (28/11/2025 até hoje)

### Como gerar

```bash
cd vamos-comemorar-api
node scripts/gerar_relatorio_highline_periodo.js
```

### Arquivos gerados

- **relatorio_highline_periodo.json** – Dados brutos
- **relatorio_highline_periodo.md** – Relatório em Markdown
- **relatorio_highline_periodo.html** – HTML com botão Salvar em PDF

### Conteúdo

- **Médias** – Check-ins por dia, por evento, por dia com evento
- **Por mês** – Total de check-ins agrupados por mês
- **Estabilidade** – Dias com evento mas sem check-in (possível travamento)
- **Consistência de validação** – Duplicidades nas listas, taxa
