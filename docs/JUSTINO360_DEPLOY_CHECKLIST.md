# Checklist de Deploy — Justino360 (Onda 1: Fases 0–2)

## Pré-deploy (obrigatório)

- [x] Upload de evidências via **Firebase** (não Cloudinary)
- [x] Gate `establishment_id = 1` (outras casas = 403)
- [x] Migration **aditiva** (`IF NOT EXISTS` / sem DROP/TRUNCATE)
- [x] UEP: equipe com `can_access`; manage/validate só gestão
- [x] Nav Justino360 filtrado por UEP/módulo
- [x] Testes locais: gate + checklist flow + validator (passando)
- [x] Escopo GET `/establishment-permissions/:id` e audit-logs
- [ ] `DATABASE_URL` disponível no ambiente que vai aplicar a migration
- [ ] Backup / snapshot do Postgres (Render) antes da migration em produção

## Deploy

1. Commit + push API (`master`) e Next (`main`) — **sem** `.env`, `.cursor`, `.DS_Store`
2. Aplicar migration: `node scripts/run_justino360_migration.js` (com `DATABASE_URL`)
3. Reiniciar API (Render auto-deploy no push, se configurado)
4. Deploy front (Vercel/host) após push

## Smoke pós-deploy (Seu Justino)

- [ ] `GET /api/justino360/health` → 200 + crédito Isa
- [ ] Usuário Justino acessa `/admin/justino360` e `/justino360`
- [ ] Usuário Highline **não** vê / não acessa Justino360
- [ ] Iniciar checklist → NÃO OK → foto Firebase → ocorrência + tarefa
- [ ] Publicar comunicado → confirmar ciência no staff
- [ ] Criar documento POP + nova versão (v1 arquivada)
- [ ] Reservas / check-in / cardápio / WhatsApp intactos (smoke rápido)

## Rollback (se necessário)

- Feature fica isolada: remover mount `/api/justino360` + nav front
- Colunas UEP `can_*_justino360` podem ficar (default false, sem impacto)
- Tabelas `j360_*` podem permanecer vazias sem afetar hospitalidade
