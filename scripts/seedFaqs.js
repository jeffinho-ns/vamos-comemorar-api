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
  {
    establishment_id: 7,
    topic: 'estacionamento',
    answer:
      'A orientação de estacionamento pode variar conforme o dia e o evento. Posso confirmar com a equipe do HighLine no dia da reserva.',
  },
  {
    establishment_id: 7,
    topic: 'pets',
    answer:
      'A política de pets pode variar conforme a casa e o evento. Posso confirmar a orientação com a equipe no dia da reserva.',
  },
  {
    establishment_id: 7,
    topic: 'musica',
    answer:
      'A programação musical pode variar conforme evento e operação do dia. Posso alinhar o estilo do dia quando você confirmar a data.',
  },
  {
    establishment_id: 7,
    topic: 'cardapio',
    answer: `O cardápio digital está em ${CARDAPIO_BY_ID[7]}`,
  },
  {
    establishment_id: 7,
    topic: 'horario_funcionamento',
    answer:
      'O HighLine funciona com janelas de horário que variam por dia da semana. Para reservas, consulte a disponibilidade da data desejada.',
  },
  {
    establishment_id: 7,
    topic: 'dress_code',
    answer:
      'O dress code é casual elegante. Se precisar de detalhes, evitamos chinelas e bermudasrasgadas.',
  },
  {
    establishment_id: 7,
    topic: 'aniversarios',
    answer:
      'Comemoramosaniversários com atenção especial. Me conte a data, o horário e quantas pessoas para orientar a melhor experiência.',
  },
  {
    establishment_id: 7,
    topic: 'areas',
    answer:
      'O HighLine possui áreas com ambientes distintos. Posso listar as opções ativas e ajudar a escolhera melhor experiência.',
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
    answer:
      'O Highline funciona REGULARMENTE apenas de Sexta-feira e Sábado, abrindo às 16h e fechando às 04h (o Club interno abre à meia-noite). De Segunda a Quarta-feira, a casa é FECHADA. Se o cliente pedir reserva para seg-qua, seja muito educado, explique que a casa está descansando e sugira sexta ou sábado. Às Quintas e Domingos a casa só abre para eventos esporádicos fechados (caso o cliente peça esses dias, diga que precisaria verificar a agenda especial, mas que o ideal é focar na sexta e no sábado).',
  },
  {
    topic: 'valores_entrada',
    answer:
      'Valores para Sexta e Sábado (sujeitos a alteração e válidos com nome na reserva): Até as 18h: Todos são VIP. Das 18h às 00h: R$ 60 (entrada seca) ou R$ 160 (consumação). Após as 00h: R$ 80 (entrada seca) ou R$ 200 (consumação). A vibe musical foca em House, Open Format e Brasilidades. Ao falar dos valores e da música, use um tom muito animado e convidativo.',
  },
  {
    topic: 'beneficios_aniversario',
    answer:
      'Vantagens para o aniversariante: Ele ganha 2 VIPs e 2 drinks G&T (para ele e um acompanhante). Vantagens por convidados presentes (não cumulativas): Com 20 convidados presentes, ganha 1 garrafa de Gin 142 ou Clericot. Com 30 convidados presentes, ganha a garrafa + 1 drink cortesia. Ao explicar isso, celebre junto com o cliente, use emojis de festa e mostre que o Highline é o melhor lugar para comemorar.',
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
