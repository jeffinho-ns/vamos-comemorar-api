# Pacotes offline de conhecimento (opcional)

Estes arquivos JSON são um **backup opcional** usado quando a OpenAI está indisponível (ex.: quota esgotada).

A **fonte primária** para **todas as casas** continua sendo a tabela `establishment_faq`, cadastrada no painel **Treinamento IA** de cada estabelecimento. O serviço `offlineKnowledgeService` consulta o banco primeiro e só recorre ao arquivo JSON quando não há FAQ ativa no banco.

## Packs disponíveis

| Arquivo | ID | Casa |
|---------|----|------|
| `1.json` | 1 | Seu Justino |
| `4.json` | 4 | Oh Fregues |
| `highline.json` | 7 | HighLine |
| `8.json` | 8 | Pracinha |
| `9.json` | 9 | Reserva Rooftop |
| `default.json` | — | Fallback genérico (casas sem pack específico) |

## Resolução do arquivo (`resolvePackFileName`)

Ordem de tentativa:

1. `{establishmentId}.json` (ex.: `8.json`)
2. `{slug}.json` derivado do nome (ex.: `pracinha.json`)
3. `highline.json` (caso especial para HighLine / id 7)
4. `default.json` (último recurso)

## Formato

```json
{
  "establishmentId": 8,
  "slug": "pracinha",
  "name": "Pracinha",
  "topics": [
    {
      "topic": "dias_horarios_funcionamento",
      "keywords": ["horário", "funcionamento"],
      "answer": "..."
    }
  ]
}
```

## Exportar do banco

Para regenerar packs a partir do Treinamento IA no banco:

```bash
# Lista o que seria escrito (dry-run)
node scripts/exportOfflineKnowledgePacks.js

# Grava data/offline-knowledge/{id}.json
node scripts/exportOfflineKnowledgePacks.js --apply
```

Respostas internas (`REGRA`, `META-REGRA`) e tópicos operacionais da IA são omitidos na exportação.
