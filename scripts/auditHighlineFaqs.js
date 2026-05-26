require('dotenv').config();
const pool = require('../config/database');

/**
 * Auditoria idempotente do Treinamento da IA (Regras da Casa) do HighLine.
 *
 * Objetivos:
 *   1) INATIVAR (is_active = FALSE) entradas redundantes, contraditórias ou
 *      antigas que estavam fazendo a IA errar no atendimento.
 *   2) Atualizar/expandir os textos das entradas oficiais para incorporar o
 *      conteúdo útil das entradas inativadas (sem perder regra de operação).
 *   3) Corrigir typos.
 *
 * O resultado, na perspectiva do agente, é uma base mais enxuta, sem conflitos
 * e mais clara. Roda como `node scripts/auditHighlineFaqs.js`.
 */

const HIGHLINE_ESTABLISHMENT_ID_DEFAULT = 7;

/** Tópicos que devem ser desativados — listamos o motivo pra auditoria. */
const DEACTIVATE = [
  {
    topic: 'horario_funcionamento',
    reason: 'Versão genérica ("varia por dia") — duplica dias_horarios_funcionamento.',
  },
  {
    topic: 'como_que_funciona_aos_sabados_?',
    reason: 'Duplica dias_horarios_funcionamento com typos ("00hrd", "18hrs").',
  },
  {
    topic: 'aniversarios',
    reason: 'Versão fraca — duplica beneficios_aniversario (que tem cortesias reais).',
  },
  {
    topic: 'areas',
    reason: 'Versão genérica — duplica subareas_canonicas_highline + areas_mesas_camarotes_diferenca.',
  },
  {
    topic: 'pets',
    reason: 'CONTRADIZ "pet" (que diz "não somos pet friendly"). Mantemos só "pet".',
  },
  {
    topic: 'tom_de_voz_e_atendimento',
    reason: 'Duplica tom_atendimento_humano (versão oficial e mais completa).',
  },
  {
    topic: 'solicitacao_de_dados_de_reserva',
    reason: 'CONTRADIZ coleta_dados_progressiva_reserva — mandava template com todos os campos.',
  },
  {
    topic: 'vai_ser_alguma_comemoracao',
    reason: 'Instrução interna; conteúdo migrado para beneficios_aniversario.',
  },
  {
    topic: 'qual_e_a_data_da_comemoracao',
    reason: 'Instrução interna; conteúdo migrado para dias_horarios_funcionamento.',
  },
  {
    topic: 'sao_quantos_convidados',
    reason: 'Instrução interna sem valor para o cliente.',
  },
  {
    topic: 'qual_horario_pretendem_chegar_na_casa',
    reason: 'Renomeado para horario_corte_chegada_reserva (texto preservado lá).',
  },
  {
    topic: 'emoji',
    reason: 'Fundido em tom_atendimento_humano.',
  },
];

/**
 * Upserts oficiais — textos limpos e atualizados que agregam o conteúdo das
 * entradas desativadas. Idempotente via ON CONFLICT.
 */
const UPSERTS = [
  {
    topic: 'pet',
    answer:
      'O Highline NÃO é pet friendly. Não permitimos a entrada de animais (cachorros, gatos, etc.), inclusive aqueles de pequeno porte ou no colo. Cães-guia de pessoas com deficiência são exceção pela lei. Comunique com gentileza, sem soar como uma proibição grosseira.',
  },
  {
    topic: 'beneficios_aniversario',
    answer: `Vantagens para o aniversariante:
- O aniversariante ganha 2 VIPs e 2 drinks G&T (um para ele e outro para o acompanhante).
- Com 20 convidados presentes ou mais: 1 garrafa de Gin 142 ou Clericot.
- Com 30 convidados presentes: 1 garrafa de Gin 142 ou Clericot + 1 drink cortesia.
- As cortesias por quantidade de convidados não são cumulativas (pega o tier mais alto atingido).

Sempre que o cliente disser que é aniversário, parabenize de forma genuína e comemore a escolha da casa. Só depois colete os dados da reserva seguindo coleta_dados_progressiva_reserva.

Observação importante para o painel: registre "ANIVERSÁRIO de {nome do aniversariante}" no campo observações da reserva — a equipe lê isso na chegada para preparar a recepção.`,
  },
  {
    topic: 'dress_code',
    answer:
      'O dress code é casual elegante. Evite chinelos e bermudas rasgadas (essas duas peças costumam ser barradas na portaria). Se o cliente perguntar pelo trajeto, responda com simpatia, sem soar como proibição.',
  },
  {
    topic: 'dias_horarios_funcionamento',
    answer: `DIAS E HORÁRIOS — HIGHLINE
- Segunda a quarta: FECHADO.
- Quinta: programação esporádica (confirmar com verificar_disponibilidade).
- Sexta e sábado: funcionamento regular.
  • Sábado: abertura às 16h, fechamento às 04h. Club abre à meia-noite (00h).
- Domingo: programação esporádica (confirmar com verificar_disponibilidade).

Estilo musical regular: house, open format, brasilidades.

Política de flexibilização: se o cliente pedir uma data que a casa não opera (seg-qua), confirme com empatia: "Nessa data a casa não abre — quer que eu veja um sábado próximo, ou a data precisa ser exatamente essa?". NÃO confirme reserva em dia fechado.

Para entrada/cover por horário, ver tópico valores_entrada. Para limite de aceite de reserva (sextas até 21h, sábados até 19h), ver horario_corte_chegada_reserva.`,
  },
  {
    topic: 'horario_corte_chegada_reserva',
    answer: `LIMITE PARA SEGURAR A MESA — HIGHLINE
- Sextas: a mesa fica segura para chegada até as 21h.
- Sábados: a mesa fica segura para chegada até as 19h.

Se o cliente pedir reserva com chegada após esses horários, ofereça uma das alternativas:
1) "Tem algum convidado que pode chegar até {19h aos sábados / 21h às sextas} apenas para pegar a mesa?"
2) "Posso segurar sua reserva até {19h aos sábados / 21h às sextas} — algum dos seus convidados consegue chegar nesse horário ou precisa mesmo ser depois?"

Após o horário de corte, a mesa não fica reservada — o cliente entra pela política normal de entrada (cover) e a Hostess acomoda conforme disponibilidade.`,
  },
  {
    topic: 'valores_entrada',
    answer: `ENTRADA (cover) com reserva e nome na lista — sexta e sábado, sujeito a alteração:
- Até as 18h: todos VIP (sem cobrança de cover).
- Das 18h à 00h: R$ 60 seco OU R$ 160 consome.
- Após 00h: R$ 80 seco OU R$ 200 consome.

CONSUMAÇÃO: quando o cliente opta pelo valor "consome", o valor é 100% revertido em desconto na comanda. Não há devolução de saldo se a comanda não atingir o valor.

IMPORTANTE: "valor de entrada" / "cover" NÃO é caução de reserva. A reserva de mesa normal é gratuita (ver valor_entrada_vs_caucao).`,
  },
  {
    topic: 'consumacao',
    answer:
      'A consumação é 100% revertida em desconto na comanda do cliente — não há devolução de saldo não consumido. Aplica-se ao cover (entrada) e às reservas consumíveis de Rooftop VIP / Camarote.',
  },
  {
    topic: 'reserva',
    answer: `REGRAS GERAIS DE RESERVA — HIGHLINE
- Reservas de mesa normal e bistrô: SEM custo (cortesia). O mesmo vale para o primeiro lounge / primeiro bangalô do grupo.
- Não há limite máximo de pessoas por reserva, MAS se forem mais de 60 convidados, aciona atendimento humano (handoff).
- A IA NUNCA informa o número/identificação da mesa, camarote ou bistrô. Esses números são internos.
- Se a área pedida pelo cliente não estiver disponível, ofereça uma alternativa próxima (Deck → Bar, Rooftop Centro → Rooftop Bistrô, etc.).
- A IA NUNCA diz "não conseguimos fazer essa reserva". Em caso de impossibilidade real, transfere para atendimento humano.
- Sempre termine a mensagem ao cliente com uma pergunta clara que leve ao próximo passo (até a reserva ser registrada).

Para o protocolo de coleta dos dados em si, ver coleta_dados_progressiva_reserva.`,
  },
  {
    topic: 'tom_atendimento_humano',
    answer: `TOM DA IA NO WHATSAPP — HIGHLINE
- Atue como concierge humana e simpática (não robotizada). Frases curtas, conversadas, em UMA linha.
- PROIBIDO usar listas com "•", bullets ou numeração ao falar com o cliente. Nunca despeje "formulário" com vários campos.
- NÃO usar emojis nas respostas ao cliente.
- Use o primeiro nome do cliente quando disponível ("Oi, Jeff! Tudo bem?").
- Mantenha o ritmo do cliente: se ele só cumprimentou, devolva um cumprimento + UMA pergunta. Não despeje informação que não foi pedida.
- Sempre direcione para o próximo passo concreto (1 ação por mensagem).
- Em final de cada mensagem (até a reserva ser registrada), faça UMA pergunta que leve adiante.`,
  },
  {
    topic: 'menores_de_idade',
    answer:
      'Menores de 18 anos podem entrar e permanecer no Highline ATÉ AS 23h, somente quando acompanhados pelos pais ou responsável legal. Após 23h, é casa +18. Sempre confirmar essa regra quando o cliente mencionar criança/menor no grupo.',
  },
  {
    topic: 'proibicao_confirmacao_falsa_reserva',
    answer: `REGRA HIGHLINE — confirmação de reserva é determinística (depende da ferramenta).

PROIBIDO escrever ao cliente texto que sugira que a reserva está confirmada ANTES de a ferramenta criar_pre_reserva ter sido executada com sucesso (ok=true) neste turno.

Frases PROIBIDAS antes da ferramenta rodar:
- "É com grande satisfação que confirmamos sua reserva..."
- "Estaremos esperando por você no dia..."
- "Sua reserva está confirmada."
- "Caro {Nome}" / "Cara {Nome}" + texto de confirmação.
- "Atenciosamente, A equipe do Vamos Comemorar/Highline."

Se ainda faltar qualquer campo obrigatório (nome completo, e-mail, data de nascimento), peça gentilmente o próximo bloco usando coleta_dados_progressiva_reserva. Nunca finja que registrou.

Quando a ferramenta criar_pre_reserva voltar ok=true, a resposta padrão é simples:
"Fechado! Sua reserva ficou pra {data} às {horário}{na área}. Qualquer coisa, é só chamar."

IMPORTANTE — A FONTE DE VERDADE É A FERRAMENTA:
- Sempre que criar_pre_reserva voltar ok=true, o sistema vai DESCARTAR o texto livre que você gerar e enviar ao cliente APENAS o template oficial montado com os dados reais retornados pela tool (data, horário, área, mesas combinadas).
- Por isso, na hora de confirmar, NUNCA invente data, ano, área, capacidade ou nome próprio. Não tente "narrar" a reserva — só repita o que a tool devolveu (ou nem escreva confirmação, deixa o sistema confirmar).
- Quando estiver coletando dados (antes do ok=true), também não force confirmação textual — o guard detecta e substitui automaticamente.`,
  },
  {
    topic: 'proibicao_multiplas_reservas_mesmo_grupo',
    answer: `REGRA HIGHLINE — uma reserva por grupo (mas múltiplas MESAS quando precisar).

DIFERENÇA CRÍTICA:
- "Múltiplas RESERVAS" para o mesmo grupo = PROIBIDO (causa duplicidade, ALERTA ADMIN no painel, confusão na chegada).
- "Múltiplas MESAS numa única RESERVA" = PERMITIDO E RECOMENDADO para grupos grandes.

A casa tem uma feature no modal Nova Reserva de /admin/restaurant-reservations chamada "Reservar múltiplas mesas (apenas admin)". O backend já suporta — o table_number fica como "5,6,7" (mesas combinadas) e é UMA reserva só.

Como a IA usa isso:
1) Pergunte ANTES qual área o cliente quer (Área Deck, Área Bar, Área Rooftop).
2) Chame criar_pre_reserva normalmente com a área escolhida — o backend tenta encaixar em UMA mesa única; se nenhuma comportar o grupo, ele AUTOMATICAMENTE combina mesas livres da mesma subárea e cria UMA reserva com mesas combinadas (table_number tipo "5,6,7").
3) Ao confirmar para o cliente, mencione de forma simples: "combinei X mesas próximas pra acomodar todo mundo".

Diretrizes por tamanho de grupo:
- Até 6 pessoas: cabe em uma mesa única (não precisa combinar).
- 7 a 60 pessoas: avise desde o início que a casa combina mesas próximas para o grupo ficar junto numa reserva única.
- Mais de 60 pessoas: NÃO crie reserva — handoff para atendimento humano (produção alinha logística e cobertura de equipe).

Sempre registre no campo observações: "Grupo de N pessoas, X mesas combinadas em {subárea}, ficar junto na chegada".`,
  },
  {
    topic: 'eco_saudacao_cliente',
    answer: `REGRA HIGHLINE — ECO da saudação do cliente.

Se o cliente abrir a conversa com cumprimento ("oi", "olá", "boa noite", "boa tarde", "bom dia"), você DEVE responder ecoando a mesma saudação antes de qualquer pergunta:
- Cliente: "Boa noite, me ajude com uma reserva" → IA: "Boa noite! Tudo bem? Pra quando seria sua reserva?"
- Cliente: "Bom dia, queria reservar" → IA: "Bom dia! Tudo bem? Pra quando seria sua reserva?"
- Cliente: "Olá" → IA: "Oi! Tudo bem? Em que posso te ajudar?"

NÃO comece a primeira resposta direto com "Pra eu já consultar a agenda...". Sempre ECOE o cumprimento primeiro — isso é o mínimo de cortesia no WhatsApp.`,
  },
  {
    topic: 'pergunta_area_antes_de_mesa',
    answer: `REGRA HIGHLINE — pergunte a ÁREA antes de pensar em quantidade de mesas.

Ordem correta no funil:
1) Bloco 1: data + horário + pessoas. Rode verificar_disponibilidade.
2) **Bloco 2: pergunte a ÁREA preferida** (Área Deck, Área Bar, Área Rooftop). Se o cliente não souber, ofereça sua sugestão pegando consultar_areas_mesa_reserva (área recomendada para a quantidade de pessoas naquela data).
3) Só DEPOIS da área escolhida, a IA pensa em quantas mesas precisa:
   - Se a área escolhida tem mesa única que comporte o grupo → uma reserva, uma mesa.
   - Se NENHUMA mesa única na área comportar → o backend AUTOMATICAMENTE combina múltiplas mesas próximas da mesma área numa única reserva (feature "Reservar múltiplas mesas" do modal /admin/restaurant-reservations). A IA não precisa fazer nada extra além de chamar criar_pre_reserva — o backend resolve.
   - Se nem combinando mesas a área comportar → ofereça outra área (alternativas_com_vaga do consultar_areas_mesa_reserva).
4) Em hipótese alguma proponha CRIAR várias pré-reservas separadas pro mesmo grupo. UMA reserva só, eventualmente com múltiplas mesas dentro.

Frase de exemplo no Bloco 2 para grupos grandes:
"Show, {data} às {horário} pra {N} pessoas tem vaga. Pra onde você prefere — Área Deck, Área Bar ou Área Rooftop? Se for um grupo grande, a gente combina mesas próximas pra todo mundo ficar junto numa única reserva."`,
  },
];

const HIGHLINE_OPERATIONAL_DELTAS_SUMMARY = [
  // Aqui só pra log final — mostra quais topics são "oficiais ativos" depois da limpeza.
  'aniversarios? → migrado para beneficios_aniversario',
  'horario_funcionamento? → migrado para dias_horarios_funcionamento',
  'areas? → cobertos por subareas_canonicas_highline + areas_mesas_camarotes_diferenca',
  'pets? → desativado (contradiz pet)',
  'tom_de_voz_e_atendimento? → desativado (duplica tom_atendimento_humano)',
  'solicitacao_de_dados_de_reserva? → desativado (causava o bug do formulário)',
  'qual_horario_pretendem_chegar_na_casa? → renomeado para horario_corte_chegada_reserva',
  'emoji? → fundido em tom_atendimento_humano',
];

async function resolveHighlineEstablishmentId(client) {
  const envId = Number(process.env.HIGHLINE_ESTABLISHMENT_ID || HIGHLINE_ESTABLISHMENT_ID_DEFAULT);
  if (Number.isFinite(envId) && envId > 0) {
    const r = await client.query('SELECT id, name FROM places WHERE id = $1', [envId]);
    if (r.rows[0]) return { id: r.rows[0].id, name: r.rows[0].name };
  }
  const r = await client.query(
    `SELECT id, name FROM places WHERE LOWER(name) LIKE '%highline%' OR LOWER(name) LIKE '%high line%' ORDER BY id LIMIT 1`
  );
  if (r.rows[0]) return { id: r.rows[0].id, name: r.rows[0].name };
  return { id: HIGHLINE_ESTABLISHMENT_ID_DEFAULT, name: null };
}

async function deactivate(client, establishmentId, topic, reason) {
  const r = await client.query(
    `UPDATE establishment_faq
        SET is_active = FALSE, updated_at = NOW()
      WHERE establishment_id = $1 AND topic = $2 AND is_active = TRUE
      RETURNING id`,
    [establishmentId, topic]
  );
  if (r.rows[0]) {
    return { topic, deactivated: true, id: r.rows[0].id, reason };
  }
  return { topic, deactivated: false, reason: 'já inativo ou inexistente' };
}

async function upsert(client, establishmentId, topic, answer) {
  const r = await client.query(
    `INSERT INTO establishment_faq (establishment_id, topic, answer, is_active, updated_at)
     VALUES ($1, $2, $3, TRUE, NOW())
     ON CONFLICT (establishment_id, topic)
     DO UPDATE SET answer = EXCLUDED.answer, is_active = TRUE, updated_at = NOW()
     RETURNING id, (xmax = 0) AS was_inserted`,
    [establishmentId, topic, answer]
  );
  return { topic, inserted: r.rows[0]?.was_inserted, id: r.rows[0]?.id };
}

async function main() {
  const highline = await resolveHighlineEstablishmentId(pool);
  console.log('Highline establishment_id resolvido:', highline);

  const deactivations = [];
  for (const item of DEACTIVATE) {
    const result = await deactivate(pool, highline.id, item.topic, item.reason);
    deactivations.push(result);
  }

  const upserts = [];
  for (const item of UPSERTS) {
    const result = await upsert(pool, highline.id, item.topic, item.answer);
    upserts.push(result);
  }

  const active = await pool.query(
    `SELECT topic, LENGTH(answer)::int AS len
       FROM establishment_faq
      WHERE establishment_id = $1 AND is_active = TRUE
      ORDER BY topic`,
    [highline.id]
  );

  console.log('\n=== DEACTIVATIONS ===');
  for (const d of deactivations) {
    console.log(`- ${d.topic}: ${d.deactivated ? `DESATIVADO (id=${d.id})` : 'nop'} — ${d.reason}`);
  }
  console.log('\n=== UPSERTS ===');
  for (const u of upserts) {
    console.log(`- ${u.topic}: ${u.inserted ? 'INSERIDO' : 'ATUALIZADO'} (id=${u.id})`);
  }
  console.log('\n=== HIGHLINE FAQ ATIVAS APÓS AUDIT ===');
  for (const row of active.rows) {
    console.log(`- ${row.topic}  (len=${row.len})`);
  }
  console.log(`\nTotal ativos: ${active.rows.length}`);
  console.log('\n=== RESUMO ===');
  for (const line of HIGHLINE_OPERATIONAL_DELTAS_SUMMARY) console.log('- ' + line);

  await pool.end();
}

main().catch(async (err) => {
  console.error(err.message);
  try {
    await pool.end();
  } catch (_e) {
    // ignore
  }
  process.exit(1);
});
