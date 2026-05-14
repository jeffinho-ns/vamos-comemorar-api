require('dotenv').config();
const pool = require('../config/database');
const { getCardapioUrlByEstablishmentId } = require('../services/conversationEngine/helpers');

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

async function main() {
  let inserted = 0;
  let updated = 0;

  for (const seed of FAQ_SEEDS) {
    const existing = await pool.query(
      `SELECT id FROM establishment_faq WHERE establishment_id = $1 AND topic = $2 LIMIT 1`,
      [seed.establishment_id, seed.topic]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE establishment_faq
            SET answer = $1, is_active = TRUE, updated_at = NOW()
          WHERE establishment_id = $2 AND topic = $3`,
        [seed.answer, seed.establishment_id, seed.topic]
      );
      updated += 1;
    } else {
      await pool.query(
        `INSERT INTO establishment_faq (establishment_id, topic, answer, is_active, updated_at)
         VALUES ($1, $2, $3, TRUE, NOW())`,
        [seed.establishment_id, seed.topic, seed.answer]
      );
      inserted += 1;
    }
  }

  const count = await pool.query('SELECT COUNT(*)::int AS total FROM establishment_faq WHERE is_active = TRUE');
  console.log(
    JSON.stringify(
      {
        inserted,
        updated,
        active_total: count.rows[0]?.total,
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
