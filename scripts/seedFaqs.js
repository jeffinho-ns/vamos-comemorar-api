require('dotenv').config();
const pool = require('../config/database');
const { getCardapioUrlByEstablishmentId } = require('../services/conversationEngine/helpers');

/** Highline em `places` (produção). Sobrescreva com HIGHLINE_ESTABLISHMENT_ID no .env se necessário. */
const HIGHLINE_ESTABLISHMENT_ID_DEFAULT = 7;

const CARDAPIO_BY_ID = {
  1: getCardapioUrlByEstablishmentId(1),
  4: getCardapioUrlByEstablishmentId(4),
  7: getCardapioUrlByEstablishmentId(7),
  8: getCardapioUrlByEstablishmentId(8),
  9: getCardapioUrlByEstablishmentId(9),
};

const FAQ_SEEDS = [
  {
    establishment_id: 1,
    topic: 'estacionamento',
    answer:
      'A orientação de estacionamento pode variar conforme o dia e o evento. Se quiser, confirmo com a equipe da casa no dia da reserva.',
  },
  {
    establishment_id: 1,
    topic: 'pets',
    answer:
      'A política de pets pode variar conforme a casa e o evento. Posso confirmar a orientação com a equipe no dia da reserva.',
  },
  {
    establishment_id: 1,
    topic: 'musica',
    answer:
      'A programação musical pode variar conforme evento e operação do dia. Posso alinhar o estilo do dia quando você confirmar a data.',
  },
  {
    establishment_id: 1,
    topic: 'cardapio',
    answer: `O cardápio digital está em ${CARDAPIO_BY_ID[1]}`,
  },
  {
    establishment_id: 1,
    topic: 'horario_funcionamento',
    answer:
      'Domingo e terça a casa abre com janelas variáveis por dia. Para reservas, consulte a disponibilidade da data desejada.',
  },
  {
    establishment_id: 1,
    topic: 'dress_code',
    answer:
      'O dress code é casual elegante. Se precisar de detalhes, evitamos chinelas e bermudas rasgadas.',
  },
  {
    establishment_id: 1,
    topic: 'aniversarios',
    answer:
      'Comemoramos aniversários com atenção especial. Me conte a data, o horário e quantas pessoas para orientar a melhor experiência.',
  },
  {
    establishment_id: 1,
    topic: 'areas',
    answer:
      'A casa possui áreas com ambientes distintos. Posso listar as opções ativas e ajudar a escolher a melhor escolha.',
  },
  {
    establishment_id: 8,
    topic: 'estacionamento',
    answer:
      'A orientação de estacionamento pode variar conforme o dia e o evento. Posso confirmar com a equipe da Pracinha no dia da reserva.',
  },
  {
    establishment_id: 8,
    topic: 'pets',
    answer:
      'A política de pets pode variar conforme a casa e o evento. Posso confirmar a orientação com a equipe no dia da reserva.',
  },
  {
    establishment_id: 8,
    topic: 'musica',
    answer:
      'A programação musical pode variar conforme evento e operação do dia. Posso alinhar o estilo do dia quando você confirmar a data.',
  },
  {
    establishment_id: 8,
    topic: 'cardapio',
    answer: `O cardápio digital está em ${CARDAPIO_BY_ID[8]}`,
  },
  {
    establishment_id: 8,
    topic: 'horario_funcionamento',
    answer:
      'A Pracinha funciona com janelas de horário que variam por dia da semana. Para reservas, consulte a disponibilidade da data desejada.',
  },
  {
    establishment_id: 8,
    topic: 'dress_code',
    answer:
      'O dress code é casual elegante. Se precisar de detalhes, evitamos chinelas e bermudasrasgadas.',
  },
  {
    establishment_id: 8,
    topic: 'aniversarios',
    answer:
      'Na Pracinha, garantimos até 6 lugares sentados na reserva; acima disso, o restante do grupo segue o fluxo da casa.',
  },
  {
    establishment_id: 8,
    topic: 'areas',
    answer:
      'A Pracinha possui áreas com ambientes distintos. Posso listar as opções ativas e ajudar a escolher a melhor experiência.',
  },
  {
    establishment_id: 9,
    topic: 'estacionamento',
    answer:
      'A orientação de estacionamento pode variar conforme o dia e o evento. Posso confirmar com a equipe do Reserva Rooftop no dia da reserva.',
  },
  {
    establishment_id: 9,
    topic: 'pets',
    answer:
      'A política de pets pode variar conforme a casa e o evento. Posso confirmar a orientação com a equipe no dia da reserva.',
  },
  {
    establishment_id: 9,
    topic: 'musica',
    answer:
      'A programação musical pode variar conforme evento e operação do dia. Posso alinhar o estilo do dia quando você confirmar a data.',
  },
  {
    establishment_id: 9,
    topic: 'cardapio',
    answer: `O cardápio digital está em ${CARDAPIO_BY_ID[9]}`,
  },
  {
    establishment_id: 9,
    topic: 'horario_funcionamento',
    answer:
      'O Rooftop funciona com janelas de horário que variam por dia da semana. Para reservas, consulte a disponibilidade da data desejada.',
  },
  {
    establishment_id: 9,
    topic: 'dress_code',
    answer:
      'O dress code no Rooftop é elegante e alinhado ao clima. Evite trajes esportivos e roupas curtas após o horário.',
  },
  {
    establishment_id: 9,
    topic: 'aniversarios',
    answer:
      'Comemoramos aniversários com atenção especial. Me conte a data, o horário e quantas pessoas para orientar a melhor experiência.',
  },
  {
    establishment_id: 9,
    topic: 'areas',
    answer:
      'O Rooftop possui áreas com ambientes distintos. Posso listar as opções ativas e ajudar a escolher a melhor experiência.',
  },
  // Para o HighLine, NÃO usamos seeds genéricos como nas outras casas.
  // Todo o conteúdo oficial está em HIGHLINE_OPERATIONAL_CONTEXTS (mais abaixo)
  // e foi consolidado pela auditoria (ver scripts/auditHighlineFaqs.js).
  // Mantemos apenas o cardápio aqui porque depende da URL gerada dinamicamente.
  {
    establishment_id: 7,
    topic: 'cardapio',
    answer: `O cardápio digital está em ${CARDAPIO_BY_ID[7]}`,
  },
  {
    establishment_id: 4,
    topic: 'estacionamento',
    answer:
      'A orientação de estacionamento pode variar conforme o dia e o evento. Posso confirmar com a equipe do Oh Fregues no dia da reserva.',
  },
  {
    establishment_id: 4,
    topic: 'pets',
    answer:
      'A política de pets pode variar conforme a casa e o evento. Posso confirmar a orientação com a equipe no dia da reserva.',
  },
  {
    establishment_id: 4,
    topic: 'musica',
    answer:
      'A programação musical pode variar conforme evento e operação do dia. Posso alinhar o estilo do dia quando você confirmar a data.',
  },
  {
    establishment_id: 4,
    topic: 'cardapio',
    answer: `O cardápio digital está em ${CARDAPIO_BY_ID[4]}`,
  },
  {
    establishment_id: 4,
    topic: 'horario_funcionamento',
    answer:
      'O OhFregues funciona com janelas de horário que variam por dia da semana. Para reservas, consulte a disponibilidade da data desejada.',
  },
  {
    establishment_id: 4,
    topic: 'dress_code',
    answer:
      'O dress code é casual elegante. Se precisar de detalhes, evitamos chinelas e bermudasrasgadas.',
  },
  {
    establishment_id: 4,
    topic: 'aniversarios',
    answer:
      'Comemoramosaniversários com atenção especial. Me conte a data, o horário e quantas pessoas para orientar a melhor experiência.',
  },
  {
    establishment_id: 4,
    topic: 'areas',
    answer:
      'O OhFregues possui áreas com ambientes distintos. Posso listar as opções ativas e ajudar a escolhera melhor experiência.',
  },
];

/**
 * Contexto operacional e comportamental do Highline para o agente (campo `answer`).
 * Não são respostas prontas — o LLM formula a mensagem ao cliente.
 */
const HIGHLINE_OPERATIONAL_CONTEXTS = [
  {
    topic: 'dias_horarios_funcionamento',
    answer: `Aos sábados abrimos às 16h e fechamos às 04h.
Tocamos house, open format, brasilidades.
Nosso club abre à meia-noite (00h).

Entrada com reserva e nome na lista:
Até as 18h: todos VIP.
Das 18h à 00h: R$60 seco ou R$160 consome.
Após 00h: R$80 seco ou R$200 consome.
Sujeito a alteração.

De segunda a quarta a casa está fechada. O funcionamento regular é sexta e sábado.`,
  },
  {
    topic: 'valores_entrada',
    answer: `Entrada com reserva e nome na lista (sexta e sábado, sujeito a alteração):
Até as 18h: todos VIP.
Das 18h à 00h: R$60 seco ou R$160 consome.
Após 00h: R$80 seco ou R$200 consome.`,
  },
  {
    topic: 'beneficios_aniversario',
    answer: `Vantagens para aniversariante:
O aniversariante ganha 2 VIPs e 2 drinks G&T (um para ele e outro para o acompanhante).
Com 20 convidados presentes ou mais: 1 garrafa de Gin 142 ou Clericot.
Com 30 convidados presentes: 1 garrafa de Gin 142 ou Clericot + 1 drink cortesia.
As cortesias por quantidade de convidados não são cumulativas.
Celebre com o cliente de forma animada ao explicar.`,
  },
  {
    topic: 'estacionamento',
    answer:
      'O Highline não possui estacionamento próprio. Normalmente há serviço de valet/manobrista para clientes, sujeito à operação do dia. Se quiser, a equipe confirma a melhor orientação no dia da reserva.',
  },
  {
    topic: 'regras_bolo',
    answer:
      'O Highline não fornece bolos, mas o cliente tem total liberdade para levar o seu. A única regra é que o bolo tenha no máximo 2kg e o cliente OBRIGATORIAMENTE traga a nota fiscal de compra para apresentar na entrada. Comunique isso com muita empatia, para não soar como uma proibição grosseira.',
  },
  {
    topic: 'redes_sociais_fotos',
    answer:
      'Se o cliente quiser ver o ambiente, fotos, ou entender a energia do local, não tente descrever o lugar de forma genérica. Indique com entusiasmo o nosso Instagram oficial: https://www.instagram.com/highlinebar/',
  },
  {
    topic: 'areas_mesas_camarotes_diferenca',
    answer:
      'É crucial não confundir o cliente. Reservas de MESAS NORMAIS não têm custo de reserva. Reservas no ROOFTOP (Área VIP, 100% consumível): Lounge (6 pessoas) = R$ 800; Bangalô (8 pessoas) = R$ 1.000. CAMAROTES no Club (Área interna/pista que abre 00h): Camarote 8 VIPs = R$ 2.000 (reverte 1.600 em consumação); Camarote 10 VIPs = R$ 2.500 (reverte 2.000 em consumação). Ofereça os camarotes mais caros apenas se o cliente indicar que quer uma experiência mais exclusiva, pista ou área interna.',
  },
  {
    topic: 'reserva_grupos_grandes_highline',
    answer: `REGRA EXCLUSIVA HIGHLINE — reservas a partir de 16 pessoas:

NUNCA diga que a casa está cheia ou sem vaga só porque uma mesa única não comporta todo o grupo. Isso é normal em grupos grandes.

O que fazer:
1) Explique com empatia: na área sugerida (geralmente Área Deck) a gente junta mesas próximas — pode não haver cadeira para cada pessoa ao mesmo tempo, mas a reserva É FEITA e a Equipe de Hostess organiza na chegada.
2) Consulte consultar_areas_mesa_reserva e verificar_disponibilidade com a data e a quantidade corretas.
3) REGISTRE com criar_pre_reserva mesmo quando a soma de cadeiras das mesas combinadas for menor que o número de convidados. Em observacoes escreva: "Grupo grande de X pessoas — combinar mesas; Hostess acomoda na chegada."
4) Só use criar_lista_espera se NÃO existir NENHUMA mesa livre nas subáreas operacionais naquele dia (zero mesas livres no painel).

Tom sugerido (adapte, não copie literal): "Show! Pra X pessoas a gente organiza no Deck juntando mesas — pode ser que não caiba todo mundo sentado de uma vez, mas sua reserva fica garantida e a equipe cuida na hora."

Acima de 60 pessoas ou evento corporativo/formatura: handoff humano (não improvise várias reservas separadas).`,
  },
  {
    topic: 'reserva_areas_operacional_highline',
    answer: `REGRA EXCLUSIVA HIGHLINE — áreas do Sistema de Reservas (/admin/restaurant-reservations), mesmas dos modais Nova Reserva e Editar Reserva:
Subáreas: Área Deck - Frente | Área Deck - Esquerdo | Área Deck - Direito | Área Bar | Área Rooftop - Direito | Área Rooftop - Bistrô | Área Rooftop - Centro | Área Rooftop - Esquerdo | Área Rooftop - Vista.

Tom: respostas curtas, humanizadas, como concierge no WhatsApp (sem textão).

Fluxo quando o cliente perguntar sobre áreas ou quiser mesa:
1) Confirme data e quantidade de pessoas.
2) consultar_areas_mesa_reserva (mesas do painel; CONFIRMADA bloqueia o dia).
3) Sugira a subárea ideal; se a preferida estiver cheia, ofereça alternativas_com_vaga.
4) Se todas_areas_cheias → criar_lista_espera + explique que a Hostess leva à mesa quando liberar. (Grupos 16+: leia reserva_grupos_grandes_highline — "cheio" só quando ZERO mesas livres no dia.)
5) criar_pre_reserva com area = label da subárea (ex.: Área Deck - Frente).

Observações (campo observacoes nas ferramentas): SEMPRE registrar no notes do painel o que o cliente pediu (ex.: "quer Deck Frente", "aceitou Rooftop Centro", aniversário, pedido especial). A equipe lê isso no Sistema de Reservas.

Não use este tópico para preços de camarote/VIP — use areas_mesas_camarotes_diferenca.`,
  },
  {
    topic: 'tom_atendimento_humano',
    answer: `REGRA HIGHLINE — tom da IA no WhatsApp.
Atue como uma concierge humana e simpática (não robotizada). Frases curtas, em UMA linha, conversadas.
PROIBIDO usar listas com "•" / bullets / numeração quando estiver falando com o cliente. Nunca mande "formulário" com vários campos de uma vez.
Use o primeiro nome do cliente quando disponível ("Oi, Jeff! Tudo bem?").
Mantenha o mesmo ritmo do cliente: se ele só cumprimentou, devolva um cumprimento + UMA pergunta. Não despeje informação que não foi pedida.
Sempre direcione para o próximo passo concreto (1 ação por mensagem).`,
  },
  {
    topic: 'coleta_dados_progressiva_reserva',
    answer: `REGRA HIGHLINE — como coletar os dados da reserva (NÃO peça tudo de uma vez).
Trabalhe em 3 etapas, no máximo 3 campos por mensagem, em frase corrida (sem bullet):

ETAPA 1 — Operacional (decide se há vaga):
  • data + horário + número de pessoas.
  • Ex.: "Pra eu já consultar a agenda, me passa por favor a data, o horário e quantas pessoas vão."
  • Em seguida rode verificar_disponibilidade.

ETAPA 2 — Identidade (só depois de confirmar vaga):
  • nome completo + e-mail + data de nascimento (DD/MM/AAAA, +18).
  • Ex.: "Perfeito, 24/05 às 20h tem vaga sim. Pra deixar no seu nome, me passa o nome completo, o e-mail e a data de nascimento (DD/MM/AAAA — pra confirmar +18)."

ETAPA 3 — Opcional:
  • área preferida (se ainda não citada) + observações para o painel (aniversário, mesa específica, restrição alimentar, etc.).

Se o cliente já mandou parte dos dados, agradeça brevemente e pule para a próxima etapa. Se faltar SÓ 1 campo, pergunte direto e curto ("Quantas pessoas vão com você?").
Quando todos os dados estiverem coletados e observações perguntadas, chame criar_pre_reserva imediatamente.`,
  },
  {
    topic: 'primeiro_contato_anuncio',
    answer: `REGRA HIGHLINE — primeira mensagem do cliente vinda do anúncio (tráfego pago).
Mensagens padronizadas tipo "Olá! Quero fazer uma reserva no HighLine." (ou variações curtas com o nome da casa) são o "Click-to-WhatsApp" do anúncio. O cliente NÃO escreveu isso — é automático.
Nesse primeiro contato:
  1) Responda com saudação curta + UMA pergunta única: "Oi, {primeiro_nome}! Tudo bem? Pra quando seria sua reserva?".
  2) NÃO peça ainda data, horário, pessoas, nome, e-mail e nascimento juntos.
  3) Espere a próxima mensagem do cliente — é nela que vem a intenção real.
  4) A partir da segunda mensagem, siga o protocolo de coleta progressiva (etapa 1 → 2 → 3).`,
  },
  {
    topic: 'valor_entrada_vs_caucao',
    answer: `REGRA HIGHLINE — sempre que falar em "valor", "preço", "ingresso" ou "consumação":
NUNCA confunda o cliente cobrando "caução de reserva" ou "valor para garantir mesa".
A reserva de MESA NORMAL no Highline NÃO TEM CUSTO — é gratuita.
O que tem valor é a ENTRADA na casa (cover), conforme tabela em valores_entrada.
Sempre que o cliente perguntar "qual o valor?" ou só "valor?", explique que se refere à entrada (cover por horário) e que a reserva em si não tem custo.
Para Rooftop VIP / Camarote, há sim valor de reserva consumível — explicar conforme areas_mesas_camarotes_diferenca, deixando claro que é OUTRA categoria.`,
  },
  {
    topic: 'subareas_canonicas_highline',
    answer: `REGRA HIGHLINE — só existem estas subáreas operacionais e a IA SÓ pode oferecer essas (labels EXATOS, idênticos ao painel /admin/restaurant-reservations):
  • Área Deck - Frente
  • Área Deck - Esquerdo
  • Área Deck - Direito
  • Área Bar
  • Área Rooftop - Direito / Bistrô / Centro / Esquerdo / Vista (apenas quando o cliente pedir camarote/VIP/consumível)
PROIBIDO inventar nomes como "Bar Central", "Área Coberta", "Área Descoberta", "Área VIP genérica", "Mezanino", "Pista", "Balcão", "Terraço". Esses NÃO existem para o cliente — se a IA disser, a equipe vê algo diferente no painel e o cliente chega esperando uma área que não existe.
Use sempre o label exato vindo do verificar_disponibilidade / consultar_areas_mesa_reserva, que é a mesma fonte do /admin/restaurant-reservations. Se a fonte trouxer "Área Coberta" ou rótulos genéricos, NÃO repasse — filtre e descreva como Área Deck / Área Bar / Área Rooftop.`,
  },
  {
    topic: 'controle_duplicidade_reservas',
    answer: `REGRA HIGHLINE — anti-duplicação de reservas.
O sistema (criar_pre_reserva) bloqueia duplicatas exatas (mesmo telefone + mesma data + mesmo horário).
Se isso acontecer, NÃO crie outra reserva — apenas avise o cliente que a reserva dele já está registrada para aquela data e oriente o que ele pode querer ajustar (horário, área, observação).
Se o mesmo cliente fizer 2+ reservas em 24h (datas diferentes), a IA insere "ALERTA ADMIN" no campo notes do painel para a equipe revisar. Não comente isso com o cliente.`,
  },
  {
    topic: 'capacidade_diaria_highline',
    answer: `REGRA HIGHLINE — capacidade.
A casa opera com limite diário de 800 pessoas (configurável em /admin/restaurant-reservations → "Limite diário de pessoas"). A IA NÃO consulta esse número direto; ela confia no resultado de verificar_disponibilidade, que já respeita esse teto.
Se verificar_disponibilidade indicar lotação cheia para um horário/dia, NÃO insista em forçar reserva — ofereça outro horário, outra data ou criar_lista_espera.`,
  },
  {
    topic: 'prioridade_treinamento_ia',
    answer: `META-REGRA HIGHLINE — fonte de verdade da IA.
O bloco "Treinamento da IA (Regras da Casa)" deste estabelecimento é a ÚNICA fonte de verdade para responder ao cliente.
Antes de QUALQUER resposta factual (horário, valor, aniversário, áreas, bolo, dress code, política, capacidade), a IA releia este bloco e cite valores, horários e benefícios exatamente como cadastrados aqui.
Se a dúvida do cliente não estiver coberta em nenhum tópico desta base, responda apenas: "vou confirmar com a equipe e já te respondo" — JAMAIS invente número, horário, política ou benefício.
NÃO usar conhecimento prévio do modelo nem traduzir/parafrasear de forma que altere o sentido das regras.`,
  },
];

async function resolveHighlineEstablishmentId(client) {
  const envId = Number(process.env.HIGHLINE_ESTABLISHMENT_ID || HIGHLINE_ESTABLISHMENT_ID_DEFAULT);
  if (Number.isFinite(envId) && envId > 0) {
    const byId = await client.query('SELECT id, name FROM places WHERE id = $1 LIMIT 1', [envId]);
    if (byId.rows[0]) {
      return { id: byId.rows[0].id, name: byId.rows[0].name, source: 'env_or_default_id' };
    }
    console.warn(
      `[seedFaqs] HIGHLINE_ESTABLISHMENT_ID=${envId} não encontrado em places; tentando busca por nome.`
    );
  }

  const byName = await client.query(
    `SELECT id, name
       FROM places
      WHERE LOWER(name) LIKE '%highline%'
         OR LOWER(name) LIKE '%high line%'
      ORDER BY id
      LIMIT 1`
  );
  if (byName.rows[0]) {
    return { id: byName.rows[0].id, name: byName.rows[0].name, source: 'name_lookup' };
  }

  return {
    id: HIGHLINE_ESTABLISHMENT_ID_DEFAULT,
    name: null,
    source: 'fallback_constant',
  };
}

async function upsertEstablishmentFaq(client, seed) {
  const result = await client.query(
    `INSERT INTO establishment_faq (establishment_id, topic, answer, is_active, updated_at)
     VALUES ($1, $2, $3, TRUE, NOW())
     ON CONFLICT (establishment_id, topic)
     DO UPDATE SET
       answer = EXCLUDED.answer,
       is_active = TRUE,
       updated_at = NOW()
     RETURNING id, (xmax = 0) AS was_inserted`,
    [seed.establishment_id, seed.topic, seed.answer]
  );
  return Boolean(result.rows[0]?.was_inserted);
}

async function main() {
  let inserted = 0;
  let updated = 0;

  const highline = await resolveHighlineEstablishmentId(pool);
  const highlineSeeds = HIGHLINE_OPERATIONAL_CONTEXTS.map((item) => ({
    establishment_id: highline.id,
    topic: item.topic,
    answer: item.answer,
  }));

  const allSeeds = [...FAQ_SEEDS, ...highlineSeeds];

  for (const seed of allSeeds) {
    const wasInserted = await upsertEstablishmentFaq(pool, seed);
    if (wasInserted) inserted += 1;
    else updated += 1;
  }

  const count = await pool.query('SELECT COUNT(*)::int AS total FROM establishment_faq WHERE is_active = TRUE');
  const highlineTopics = await pool.query(
    `SELECT topic, LENGTH(answer)::int AS answer_length, updated_at
       FROM establishment_faq
      WHERE establishment_id = $1
        AND topic = ANY($2::varchar[])
      ORDER BY topic`,
    [highline.id, HIGHLINE_OPERATIONAL_CONTEXTS.map((item) => item.topic)]
  );

  console.log(
    JSON.stringify(
      {
        inserted,
        updated,
        active_total: count.rows[0]?.total,
        highline: {
          establishment_id: highline.id,
          establishment_name: highline.name,
          resolved_via: highline.source,
          operational_contexts_upserted: highlineTopics.rows,
        },
      },
      null,
      2
    )
  );

  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  try {
    await pool.end();
  } catch (_error) {
    // ignore
  }
  process.exit(1);
});
