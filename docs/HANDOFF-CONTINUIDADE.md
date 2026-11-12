# Handoff de continuidade — 12 nov 2026

Documento para retomar em outro computador. Sem senhas, tokens nem connection strings.

Repos: `vamos-comemorar-api` (branch `master`) e `vamos-comemorar-next` (branch `main`).  
Remotes: `jeffinho-ns/vamos-comemorar-api` e `jeffinho-ns/vamos-comemorar-next`.

**Prazo crítico:** sistema antigo de atendimento das casas encerra em **14 nov 2026**. Ponte temporária = **Wame**. Destino final = app Meta próprio + espelho.

---

## 0. O que fazer amanhã (checklist)

1. `git pull` nos dois repos.
2. Confirmar no Render: deploy do commit `a89ebf72` (ou posterior) + env Wame (abaixo).
3. `GET https://api.agilizaiapp.com.br/api/webhooks/wame` → deve retornar `{ ok: true, provider: "wame" }`.
4. No painel Wame: alinhar `WAME_SERVER_URL` do Render com o **Server** exibido na instância (já apareceu `v5.api.wame.pro`, `v5.api-wa.me`, `us.api-wa.me` — usar o da tela atual).
5. Conectar **uma casa** via Embedded Signup (Pracinha primeiro) — ver seção 3.
6. Testar “oi” no número conectado → Sol deve responder.
7. Repetir para as outras casas.
8. Acompanhar análise Meta do app **Agilizaiapp Atendimento** (e-mail do admin).

---

## 1. Meta — app novo (destino final)

### Portfólio e app
- Portfólio: **Jefferson Teixeira de Lima - Agilizaiapp** (CNPJ `52.891.095/0001-84`, EI do Jefferson; empresa **Verificada**).
- **Não** usar portfólio **Ideiaum** (WABA/central antigas **banidas** permanentemente — spam/comunicação proibida; análise negada).
- Número antigo central `11 91109-1838` / Central AgilizaiApp: **perdido** (ban). Não reutilizar.
- App: **Agilizaiapp Atendimento** (caso de uso WhatsApp).
- Número de teste Meta: `+1 555 151 8277` / phone_number_id `1393069580557278` / WABA `1688909189608151` — só teste do app, **não** é número de casa.

### Análise do app
- **Status:** enviada — **Análise em andamento** (alerta ~9–10 nov).
- Permissões pedidas: `whatsapp_business_messaging`, `whatsapp_business_management`, `public_profile`.
- `business_management` **foi tirada** da solicitação (contador 0/1 não atualizava após 24h+). Pedir de novo depois, se Tech Provider exigir.
- Prazo Meta típico: até ~20 dias.
- Vídeos já gravados e anexados (messaging + template).

### Objetivo de produto (quando Meta aprovar)
- Cada casa com próprio WhatsApp, Sol respondendo, **modo espelho** (app no celular + Cloud API).
- **Não** “Adicionar número” API puro (tira o celular).
- Embedded Signup `whatsapp_business_app_onboarding`; piloto **Pracinha**.
- Número **central** novo: só **depois** das casas.
- Até lá: só **responder** clientes (janela 24h); **zero campanha** (empresa avisada).

### Números das casas (referência)
- Seu Justino `11 5200-3650`
- Pracinha `11 2305-0938`
- Highline `11 3032-2934`
- Reserva Rooftop / Pinheiros compartilham `11 4280-3345` (um Meta number → uma casa no cadastro)

---

## 2. Ponte Wame (ativo agora — urgência 14/11)

### Por quê
App Agilizaiapp ainda sem Advanced Access; não dá para atender produção das casas pelo app próprio. Wame é **Meta Business Partner** → Embedded Signup sob a aprovação deles, sem esperar nossa análise.

### Código (API) — já no `master`
Commit: `a89ebf72` — `feat: ponte Wame Cloud API para a Sol enquanto a Meta analisa o app`

- Rota: `POST/GET /api/webhooks/wame`
- Arquivos: `routes/wameWebhook.js`, `services/wame/*`, ajuste em `whatsappService.js` + `server.js`
- Testes: `tests/unit/wameService.test.js`

### Env no Render (sem colar valores no git)
```
WAME_SERVER_URL=<igual ao "Server" do painel Wame da instância>
WAME_API_KEY=<Key da instância no painel>
WHATSAPP_OUTBOUND_PROVIDER=wame
```
Opcional: `WAME_WEBHOOK_TOKEN`, `WAME_DEFAULT_ESTABLISHMENT_ID`.

**Manter** as vars Meta (`WHATSAPP_ACCESS_TOKEN`, `PHONE_NUMBER_ID`, secrets, etc.) — voltam quando desligar a ponte.

### Webhook no painel Wame
- Formato: **Meta** (instância oficial).
- URL (mensagem recebida e demais, se quiser):  
  `https://api.agilizaiapp.com.br/api/webhooks/wame`  
  Com token opcional: `...?token=SEU_WAME_WEBHOOK_TOKEN`
- QR / Histórico indisponíveis na oficial — ok.

### Comportamento
- Inbound Wame → mesmo motor da Sol (`processInboundTurn`).
- Com `WHATSAPP_OUTBOUND_PROVIDER=wame` (ou contexto do webhook), respostas saem pela API Wame (`POST /{key}/message/text`), não pelo Graph do app Agilizaiapp.

---

## 3. Como conectar número de casa na Wame (passo a passo)

**Situação real:** casas têm WhatsApp Business **no celular**, em geral **sem** número já vinculado a um Business Manager Meta. Instagram da casa **não** serve. O Embedded Signup **cria** o vínculo.

Para **cada** casa (piloto Pracinha):

1. Painel Wame → **Canais** → instância oficial → **WhatsApp Business** (tag **Coexistência** se disponível).
2. Login Facebook/Meta de quem administra aquela casa **ou** Conta Meta gerenciada — **não** Ideiaum banida.
3. Alguém com o **celular do WhatsApp da casa** na mão (OTP/SMS).
4. Fluxo Meta: criar/escolher negócio (nome da casa) → número da casa → código → coexistência.
5. Canais deixa de ficar **Desconectado**; aparece `+55…`.
6. Teste: mandar “oi” **para esse número** (não para o `+1 555` de teste).

Texto curto para o gerente da casa:

> Precisamos de 10 minutos com o celular do WhatsApp da casa e um Facebook do responsável. Vamos autorizar o número na API oficial sem tirar o WhatsApp do celular. Não precisamos da senha do Instagram.

---

## 4. O que NÃO fazer

- Não desconectar WhatsApp Business do celular das casas.
- Não cadastrar números de casa no app Agilizaiapp via “Adicionar número” API puro.
- Não reutilizar `11 91109-1838` / Ideiaum.
- Não disparar campanha / marketing enquanto a operação está frágil.
- Não colar API keys / tokens em chat ou no git.
- Não usar conexão Wame **não oficial** (QR / código 8 dígitos) para produção das casas — risco de ban; preferir **oficial + coexistência**.

---

## 5. Depois que a Meta aprovar Advanced Access

1. Advanced Access em messaging + management.
2. Provedor de Tecnologia no app Agilizaiapp → Embedded Signup espelho (piloto Pracinha).
3. Webhook Meta de volta para `/api/webhooks/whatsapp`.
4. Render: remover ou desligar `WHATSAPP_OUTBOUND_PROVIDER=wame` (voltar Meta).
5. Desligar / cancelar Wame quando estável.
6. Central de atendimento (número novo) por último.

---

## 6. Referências rápidas

- Webhook Agilizaiapp (Meta): `https://api.agilizaiapp.com.br/api/webhooks/whatsapp`
- Webhook ponte Wame: `https://api.agilizaiapp.com.br/api/webhooks/wame`
- Painel Wame: `https://dash.wame.api.br`
- Docs Wame: `https://wame.api.br/docs` · AI context: `https://wame.api.br/llms.txt`
- Health API: `https://api.agilizaiapp.com.br/health` (campos `whatsapp.wameConfigured` / `wameOutbound` após deploy)

---

## 7. Sítio Ilha / outros (contexto antigo, já feito)

Cardápio Sítio Ilha (org 9, est. 17) e itens do PDF já tratados em sessão anterior. Não misturar com este handoff de WhatsApp.
