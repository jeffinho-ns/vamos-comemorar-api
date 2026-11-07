# Handoff de continuidade — 6 nov 2026

Documento para retomar o trabalho em outro computador. Sem senhas, tokens nem connection strings.

Repos: `vamos-comemorar-api` (branch `master`) e `vamos-comemorar-next` (branch `main`). Remotes: `jeffinho-ns/vamos-comemorar-api` e `jeffinho-ns/vamos-comemorar-next`.

---

## 1. WhatsApp / Meta — Provedor de Tecnologia (ativo agora)

### Decisão de produto
- Objetivo: cada casa com o próprio número WhatsApp, IA respondendo por esse número, **modo espelho** (WhatsApp Business no celular + Cloud API no mesmo número).
- **Não** usar “Adicionar número” da API pura: isso tira o app do celular e apaga o histórico. Serviço 24/7; usuário rejeitou.
- Até o espelho existir, staff e IA podem responder no mesmo chat (aceito).
- Número **central** `11 91109-1838` (phone_number_id `1072961792566436`) fica como número geral da API. Display name Meta: Central Agilizaiapp. **Não** cadastrar esse número como linha de uma casa.
- Números das casas (ainda não conectados no modo espelho):
  - Seu Justino `11 5200-3650`
  - Pracinha `11 2305-0938`
  - Highline `11 3032-2934`
  - Reserva Rooftop e Reserva Pinheiros compartilham `11 4280-3345` (um Meta number → uma casa só no cadastro)

### Onde o usuário está no Meta
1. **Verificação da empresa**: concluída (Central de Segurança mostra JEFFERSON TEIXEIRA DE LIMA como Verificada). Caso de uso: “O app exige acesso e permissões no Meta for Developers” — manter.
2. Tela **Torne-se um Provedor de Tecnologia**: etapa 1 pode ainda parecer “Em análise” por atraso de UI; na Central de Segurança já está Verificada.
3. **Análise do app**: usuário chegou no formulário (`Não enviado` → `Avançar` → checklist).
   - Verificação e Configurações do app: ok.
   - Faltam: Uso permitido, Tratamento de dados, Instruções da análise.
4. Vídeos obrigatórios (dois, separados):
   - `whatsapp_business_messaging`: Agilizaiapp enviando mensagem + WhatsApp (celular/web) recebendo.
   - `whatsapp_business_management`: criação de template de mensagem.
5. Onde anexar: **não** é “Mostrar instruções”. É no formulário de cada permissão (campo Arraste/Carregar arquivo), acessível via **Editar análise do app** → **Avançar** → formulários. Cuidado: formulário de `business_management` (Business Manager) ≠ `whatsapp_business_messaging`.
6. Avisos vermelhos da Central de Segurança (domínio, passkey, 2FA) **não** bloqueiam WhatsApp.

### Bloqueio atual para gravar o vídeo de envio
- No Atendimento (`/admin/whatsapp?tab=atendimento`), conversa “Jefferson” (`5511943583697`) está **fora da janela de 24h** da Meta. Texto livre pelo painel é recusado até o cliente mandar mensagem recente.
- Teste: outro telefone → `11 91109-1838`. Webhook no Meta está com URL `https://api.agilizaiapp.com.br/api/webhooks/whatsapp` e campo **messages** habilitado.
- Diagnóstico de produção (6 nov ~16h–21h BRT):
  - Endpoint do webhook responde (GET sem challenge → 403 = rota viva).
  - Tabela `whatsapp_message_dedup`: último receipt em **2026-11-04**. Nada nas últimas horas do teste.
  - `whatsapp_messages`: último inbound antigo (ago/2026 no schema consultado); conversas recentes de out/nov aparecem no UI mas o receipt Meta via dedup parou em 4 nov.
  - Conclusão: Meta **não está entregando** o inbound ao servidor neste momento, ou o payload não está chegando como mensagem de texto processável. Não é a faixa vermelha da janela 24h.
- Próximo check manual no Meta:
  - Na Configuração da API, número “De” tem que ser **+55 11 91109-1838**, não número de teste +1 555.
  - No celular do teste: 1 check = não entregou à empresa; 2 checks = chegou no app do celular (coexistência/espelho ainda inexistente) e não na API.
- Depois que inbound voltar: mandar “oi” do número de teste → conversa nova no inbox (não reutilizar Jefferson antigo) → responder pelo painel → gravar vídeo → anexar em `whatsapp_business_messaging`.
- Depois da aprovação Advanced Access das duas permissões WhatsApp: implementar botão Embedded Signup (`featureType` whatsapp_business_app_onboarding), webhook fields extras `account_update`, `history`, `smb_app_state_sync`, `smb_message_echoes`. Piloto sugerido: Pracinha. Central intocada.

### Código WhatsApp já em produção (commits anteriores)
- API: linhas por casa (`whatsapp_phone_lines`), webhook com `phone_number_id`, escopo `waba:{phoneNumberId}:{customer}` para números ≠ env.
- Next: aba “WhatsApp linha” em Configurações de IA.
- Isso **não** é o modo espelho; é API-only por número.

---

## 2. Sítio Ilha — cardápio (feito nesta sessão)

### Contexto
- Organização própria: id **9**, slug `sitio-ilha`, ativa.
- Establishment id **17**, legacy_place_id **18**, legacy_bar_id **15**.
- Duplicata Grupo Ideia (establishment 6 / place 10) permanece arquivada/oculta.
- Cardápio público/admin do Sítio Ilha foi reexibido (código + UEP users thiago@sitioilha.com.br e sitioilharj@gmail.com). Commits já publicados: Next `45dce0a0`, API `1b71e11`.
- `filterEstablishmentListForUser(..., { includeSitioIlha: true })` só no cardápio; reservas/home do Grupo Ideia continuam sem Sítio Ilha.

### Itens do PDF “Drinks e petiscos da noite final”
Inseridos em produção no bar **15** / org **9** (não commitados no git — é dado de banco):

**Já existiam (não duplicar):** Isca de Tilápia 69,90; Contra Filé com Fritas 69,90; Frango Crocante com Fritas 49,90; Fritas Crocantes 29,90. Placeholder `[Nova Subcategoria] Petiscos` permanece oculto.

**Petiscos adicionados** (categoria 92, subcategory `Petiscos`): Camarão Crocante 74,90; Lula à Dorê 64,90; Iscas de Tilápia com Fritas 64,90; Bolinho de Salmão 48,90 (6 un); Bolinho de Tilápia 39,90 (6 un); Croquete de Costela 39,90 (6 un); Pastel de Camarão 39,90 (4 un). IDs aprox. 3064–3070.

**Bebidas adicionadas** (categoria 72):
- `Especiais da Casa`: Aperol Spritz 33,60; Caipisaquê Ilha 26,80; Gin Sunset 29,90; Tinto de Verano 25,90.
- `Tradicionais`: Soda Italiana 19,90; Gin tropical 29,90; Caipirinha 21,90; Caipvodka 23,90; Caipifruta 25,90.
- IDs aprox. 3071–3079. Sem foto ainda.

---

## 3. O que NÃO fazer
- Não desconectar WhatsApp Business do celular das casas.
- Não registrar o central `11 91109-1838` como linha de estabelecimento.
- Não commitar scripts `_tmp_*`, `.env`, nem `scripts/extrair-bi-justino.js` / `tsc-bi.txt` (next).
- Não mexer em reservas Highline “por acidente” neste handoff.
- Modelo de IA de produção: `gpt-5.5` (não downgrade). Agente novo: `services/agent/*`.

---

## 4. Próximos passos sugeridos (ordem)
1. Destravar inbound do central `11 91109-1838` (número “De” na API + status da mensagem no celular + logs Render do webhook).
2. Gravar e anexar os 2 vídeos; completar Uso permitido / Tratamento de dados / Instruções; enviar Análise do App.
3. Aguardar Advanced Access; só então Embedded Signup / espelho (piloto Pracinha).
4. Fotos dos novos itens do Sítio Ilha, se o usuário pedir.
5. Há alterações locais **não relacionadas** neste handoff (BI menu access / UserMenuAccessFields) em working tree dos dois repos — **não misturar** com este commit de documentação.

---

## 5. Referências rápidas
- Webhook: `https://api.agilizaiapp.com.br/api/webhooks/whatsapp`
- Docs Meta Tech Provider: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers/
- Sample App Review: https://developers.facebook.com/docs/whatsapp/solution-providers/app-review/sample-submission/
- Chat Cursor anterior (contexto longo): transcript local em agent-transcripts do projeto next.
