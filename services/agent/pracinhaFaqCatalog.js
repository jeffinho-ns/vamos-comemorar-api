/**
 * Informações adicionais do Pracinha do Seu Justino (places.id = 8).
 * Cada texto é fato para o cliente. A IA cita só o trecho da pergunta.
 */

const PRACINHA_ESTABLISHMENT_ID = 8;

const PRACINHA_FAQS = [
  {
    topic: 'dias_horarios_funcionamento',
    category: 'geral',
    answer:
      'Terça a casa fica fechada. Quarta e quinta abrem às 17h e vão até 1h. Sexta abre às 17h e vai até 3h30. Sábado abre às 14h e vai até 3h30. Domingo abre às 14h e vai até 00h. A cozinha encerra sempre uma hora antes do fim da casa. A comanda é individual. Entrada, atração e promoção mudam conforme o dia, e feriados têm programação própria. Valores e informações podem mudar.',
  },
  {
    topic: 'valores_entrada',
    category: 'geral',
    answer:
      'A entrada depende do dia. Quarta não cobra entrada. Quinta não cobra entrada; o couvert artístico, se perguntarem, é R$ 30. Sexta é VIP das 18h às 20h; depois, R$ 20 ou R$ 120 de consumação. Sábado é VIP até as 16h; depois, R$ 15 seco ou R$ 100 que consome tudo. Domingo é VIP unissex até as 16h; depois, R$ 20 seco ou R$ 120 que consome tudo. A entrada com consumação vale para bebidas e comidas, alcoólicas ou não. Se o consumo passar desse valor, paga-se a diferença. Valores sujeitos a alteração.',
  },
  {
    topic: 'informacoes_terca',
    category: 'geral',
    answer:
      'Às terças a Praça mais amada de São Paulo fica fechada, e a resenha continua no quintal. Há promoções exclusivas por lá e a reserva é gratuita. O link para reservar é https://wa.link/zvquhg .',
  },
  {
    topic: 'informacoes_quarta',
    category: 'geral',
    answer:
      'Às quartas a casa abre às 17h e fecha à 1h, com som ambiente, comanda individual e sem entrada. O chopp sai por R$ 7,45 se for Amstel e por R$ 8,45 se for Heineken. Nesse dia o chopp também sai por 50% do preço. Valores e condições podem mudar.',
  },
  {
    topic: 'informacoes_quinta',
    category: 'geral',
    answer:
      'Às quintas a casa abre às 17h e fecha à 1h, com comanda individual. O projeto é Ao Vivo na Praça, com pagode e brasilidades: discotecagem, brasilidades e funk. Não cobramos entrada. O couvert artístico, se perguntarem, é R$ 30. Open chopp Amstel por R$ 62,90 até as 22h; em feriado, até as 17h. Cite só o que foi perguntado. Valores e programação podem mudar.',
  },
  {
    topic: 'informacoes_sexta',
    category: 'geral',
    answer:
      'Às sextas a casa abre às 17h e fecha às 3h30. A atração é Grupo Mais Que Nosso e DJ Funk. A entrada é VIP unissex das 18h às 20h. Depois, R$ 20 ou R$ 120 de consumação. Toda sexta tem De Volta ao Mundo do Funk, do proibidão ao funk melody. A comanda é individual. Cite só o que foi perguntado. Valores podem mudar.',
  },
  {
    topic: 'informacoes_sabado',
    category: 'geral',
    answer:
      'Aos sábados a casa abre às 14h e fecha às 3h30, com comanda individual. O pagode vai das 17h às 20h30 e das 21h à 0h. Da 0h às 3h30 entra o DJ. A entrada é VIP até as 16h. Depois das 16h, R$ 15 seco ou R$ 100 que consome tudo. O sábado é Amor e Pagode com Gustavo Balta, e o after segue com DJ. Cite só o que foi perguntado. Valores e programação podem mudar.',
  },
  {
    topic: 'informacoes_domingo',
    category: 'geral',
    answer:
      'Aos domingos a casa abre às 14h e fecha à 0h, com comanda individual. O pagode é das 15h às 18h30. A entrada é VIP unissex até as 16h. Depois, R$ 20 seco ou R$ 120 que consome tudo. Open chopp das 14h às 16h por R$ 62,90. Cite só o que foi perguntado. Valores e programação podem mudar.',
  },
  {
    topic: 'programacao_19_11',
    category: 'evento',
    answer:
      'Em 19/11, sexta e véspera de feriado, a Praça é Nossa em Pinheiros, com samba, pagode e funk. As atrações são Grupo Mais Que Nosso e DJ Funk. A casa abre às 17h, as reservas são a partir das 21h e o fechamento é às 3h30. Até as 20h a entrada VIP é R$ 25 e a consumação é R$ 140. A comanda é individual. Valores e programação podem mudar.',
  },
  {
    topic: 'programacao_01_11',
    category: 'evento',
    answer:
      'Em 01/11, véspera de feriado, a casa funciona das 14h às 3h30, com comanda individual. Open chopp das 14h às 18h por R$ 62,90. A entrada é VIP até as 16h. Depois das 16h, R$ 15 seco ou R$ 100 que consome tudo. Valores sujeitos a alteração.',
  },
  {
    topic: 'programacao_02_11',
    category: 'evento',
    answer:
      'No feriado de 02/11 a casa funciona das 14h às 21h, com comandas individuais. Das 14h às 15h a entrada é VIP. Das 15h às 16h, R$ 20 ou R$ 120 de consumação, sujeito a alteração. Open chopp das 14h às 18h por R$ 62,90.',
  },
  {
    topic: 'programacao_15_11',
    category: 'evento',
    answer:
      'No feriado de 15/11, domingo, a casa abre às 14h e fecha à 0h. O pagode é das 15h às 18h30. A entrada é VIP unissex até as 16h. Depois, R$ 20 seco ou R$ 120 que consome tudo. Open chopp das 14h às 18h por R$ 62,90. A comanda é individual. Valores e informações podem mudar.',
  },
  {
    topic: 'programacao_20_11',
    category: 'evento',
    answer:
      'Em 20/11, feriado e sexta, é Amor e Pagode com Gustavo Balta e DJ no after, em Pinheiros. A casa abre às 14h e fecha às 3h30. Das 16h às 19h é DJ, das 19h às 23h é pagode e das 23h às 3h é DJ. Até as 16h a entrada VIP é R$ 20 e a consumação é R$ 120, sujeito a alteração. Open chopp das 14h às 18h por R$ 62,90. A comanda é individual.',
  },
  {
    topic: 'programacao_21_11',
    category: 'evento',
    answer:
      'Em 21/11 o open chopp é R$ 62,90, das 14h às 16h. Informe isso quando perguntarem dessa data. O valor pode mudar.',
  },
  {
    topic: 'programacao_22_11',
    category: 'evento',
    answer:
      'Em 22/11 o open chopp é R$ 62,90, das 14h às 18h. Informe isso quando perguntarem dessa data. O valor pode mudar.',
  },
  {
    topic: 'programacao_27_11',
    category: 'evento',
    answer:
      'Em 27/11 a casa fica fechada para um evento e abre ao público a partir das 23h15. Depois desse horário a noite segue com música e festa.',
  },
  {
    topic: 'reveillon',
    category: 'evento',
    answer:
      'Em 31/12/2026 o Pracinha abre o Réveillon Pracinha, celebrando 2027. O acesso é só por ingresso, em https://www.ingresse.com/super-reveillon-harmonia-seu-justino-pracinha/ . Não ofereça reserva comum nessa data. O Réveillon tem open food e open bar premium a celebração inteira, com ceia, finger foods, sobremesas, opções da madrugada, bebidas, drinks e cervejas. O cardápio completo está no link de compra. Não invente valor, horário, atração ou item que não esteja neste texto.',
  },
  {
    topic: 'eventos_corporativos',
    category: 'evento',
    answer:
      'Se o cliente quiser um evento corporativo ou uma confraternização, pergunte se prefere um pacote fechado de comidas e bebidas ou uma reserva simples de mesa, com comandas individuais. No pacote fechado, peça nome, empresa, telefone ou WhatsApp, e-mail, número estimado de participantes, data, horário, o que espera do evento e se prefere retorno por e-mail, WhatsApp ou ligação. Com esses dados completos, passe na hora para uma pessoa da equipe e pare de responder: as condições seguem por e-mail.',
  },
  {
    topic: 'atraso_tolerancia',
    category: 'reserva',
    answer:
      'A reserva tolera 15 minutos depois do horário marcado. Se for atrasar, o cliente deve avisar o quanto antes para a casa ver se a mesa continua disponível. Passados os 15 minutos, a reserva pode ser liberada conforme a ocupação.',
  },
  {
    topic: 'mesas_assentos',
    category: 'reserva',
    answer:
      'A reserva de mesa não tem custo. Não reservamos ambientes e não cobramos taxa para reservar. Para ver a disponibilidade, peça a data. As mesas acomodam de 4 a 12 pessoas, conforme o espaço na hora da reserva. Não dá para garantir uma quantidade específica de lugares. Somos bar e balada e não funcionamos com o público 100% sentado.',
  },
  {
    topic: 'areas_mesas_camarotes_diferenca',
    category: 'geral',
    answer:
      'A praça é ampla, com mesas e cadeiras, bistrôs com banquetas e teto retrátil. O parquelet é o deck da frente, com mesas bistrô e algumas banquetas. O Apê é a balada do andar de cima. O fumódromo fica em frente à unidade. Não há espaço kids. Narguilé não entra. Cite só o ambiente que o cliente perguntou.',
  },
  {
    topic: 'reserva_ape',
    category: 'reserva',
    answer:
      'O Apê é a balada do andar de cima, com pista de dança, banheiro feminino e masculino, barman exclusivo, DJ, sofás, mesas de centro e bistrôs de apoio. Dá para conectar o celular na caixa de som. A reserva não tem custo e não há limite de convidados, mas depende de disponibilidade: peça data, horário e quantidade de pessoas antes de confirmar. Aos sábados o Apê fica exclusivo para reservas até as 23h e, depois disso, abre ao público. Se pedirem fotos, envie as fotos do espaço.',
  },
  {
    topic: 'estacionamento',
    category: 'geral',
    answer:
      'Não temos estacionamento próprio. Há um estacionamento ao lado, sem vínculo com a casa. Os valores não são nossos: o cliente confere o preço direto no local.',
  },
  {
    topic: 'delivery',
    category: 'geral',
    answer: 'Não fazemos delivery e não trabalhamos com retirada no local.',
  },
  {
    topic: 'pet',
    category: 'geral',
    answer:
      'A casa é pet friendly e tem área aberta. O pet precisa estar na guia e acompanhado do responsável, para o conforto de todo mundo.',
  },
  {
    topic: 'como_chegar',
    category: 'geral',
    answer:
      'Ficamos na Rua Harmonia, 117, Vila Madalena. As estações de metrô mais próximas são Fradique Coutinho, da linha 4-Amarela, e Vila Madalena, da linha 2-Verde.',
  },
  {
    topic: 'beneficios_aniversario',
    category: 'reserva',
    answer:
      'Na reserva de aniversário, o aniversariante tem entrada VIP para si e um acompanhante. Pergunte quantos convidados vão e explique só a faixa correspondente. Até 10 convidados, 1 drink. De 11 a 19, 2 drinks. A partir de 20, uma opção entre balde Heineken ou Heineken Ultimate com 10 unidades, Chandon Brut, Rufus ou garrafa de gin nacional. As cortesias não se somam. Na reserva garantimos até 6 lugares sentados; acima disso, o restante do grupo segue o fluxo da casa. Benefícios sujeitos a alteração.',
  },
  {
    topic: 'beneficios_despedida',
    category: 'reserva',
    answer:
      'Em despedida, festa pós-casamento e outras comemorações, o anfitrião e um acompanhante têm entrada VIP. Com até 15 convidados, 1 drink de cortesia. A partir de 20 convidados, o anfitrião escolhe uma opção: garrafa de Chandon Brut, balde de Heineken com 10 unidades, garrafa de Gin 142, Rufus ou garrafa de Vodka Belvedere. Os benefícios não são cumulativos e dependem da disponibilidade.',
  },
  {
    topic: 'happy_hour',
    category: 'reserva',
    answer:
      'No happy hour, a partir de 20 convidados, o anfitrião escolhe uma opção: garrafa de Chandon Brut, balde de Heineken com 10 unidades ou garrafa de Gin 142. O benefício não é cumulativo e depende da disponibilidade.',
  },
  {
    topic: 'promocoes_chopp',
    category: 'geral',
    answer:
      'Quarta o chopp sai por R$ 7,45 no Amstel e R$ 8,45 na Heineken, e também por 50% do preço. Quinta tem open chopp Amstel por R$ 62,90 até as 22h, e em feriado até as 17h. Domingo o open chopp é das 14h às 16h por R$ 62,90. Em 01/11 e 20/11 o open chopp vai das 14h às 18h por R$ 62,90. Em 21/11, das 14h às 16h. Em 22/11, das 14h às 18h. Cite só o dia perguntado. Valores podem mudar.',
  },
  {
    topic: 'flyer_aniversario',
    category: 'reserva',
    answer:
      'Se o cliente quiser flyer da reserva, peça uma foto e a reserva finalizada. O modelo é o padrão da casa. Quando a foto chegar, avise que a equipe produz o flyer e envia no WhatsApp, e passe o pedido para uma pessoa da casa.',
  },
  {
    topic: 'historia',
    category: 'geral',
    answer:
      'A decoração dá a sensação de uma praça ao ar livre, com paisagismo, DJ e música ao vivo. À noite o clima é descontraído, para drinks autorais e comidas tradicionais com um toque da casa. Serve para aniversário, despedida e happy hour. No fim de semana o after sobe para o Apê do Justino, no segundo andar, com clima de balada, sofás e luz baixa.',
  },
  {
    topic: 'menores_criancas',
    category: 'geral',
    answer:
      'Menor de 18 anos pode ficar até as 23h, acompanhado dos pais ou responsáveis, como prevê o ECA. É proibido vender ou deixar consumir bebida alcoólica para menor.',
  },
  {
    topic: 'area_kids',
    category: 'geral',
    answer: 'Não temos espaço kids.',
  },
  {
    topic: 'musica',
    category: 'geral',
    answer:
      'Quarta é som ambiente. Quinta é Ao Vivo na Praça, com pagode, brasilidades e funk. Sexta é De Volta ao Mundo do Funk, com Grupo Mais Que Nosso e DJ Funk. Sábado é Amor e Pagode com Gustavo Balta e DJ no after. Domingo tem pagode das 15h às 18h30. Os estilos da casa incluem pop, MPB, samba, pagode, funk e sertanejo. Música ao vivo entra quinta, sexta, sábado e domingo. Cite só o dia perguntado.',
  },
  {
    topic: 'mencao_story',
    category: 'geral',
    answer:
      'Quando a pessoa marcar a casa no story do Instagram, responda: Amei sua menção. Me conta tudo: como foi sua experiência e o que você mais gostou? Estou ansiosa para saber.',
  },
  {
    topic: 'acessibilidade',
    category: 'geral',
    answer:
      'A casa recebe pessoas com deficiência ou mobilidade reduzida e tem as adaptações para acesso e conforto, incluindo rampas e banheiros adaptados.',
  },
  {
    topic: 'estrutura_funcionamento',
    category: 'geral',
    answer:
      'A casa tem área aberta, área coberta, área pet friendly e área para fumar em frente à unidade. A cozinha encerra sempre uma hora antes do fim da casa. O local tem acessibilidade, com rampas e banheiros adaptados.',
  },
  {
    topic: 'entrada_bebidas',
    category: 'geral',
    answer: 'Não é permitida a entrada de bebidas de fora.',
  },
  {
    topic: 'taxa_rolha',
    category: 'geral',
    answer: 'A taxa de rolha é R$ 120 para rótulos que a casa não vende.',
  },
  {
    topic: 'narguile',
    category: 'geral',
    answer: 'Não é permitido usar narguilé em nenhuma área da casa, nem trazer o aparelho.',
  },
  {
    topic: 'regras_bolo',
    category: 'geral',
    answer:
      'Bolo de até 2 kg pode entrar. Para gelar, precisa de nota fiscal com data de fabricação e de validade. Sem isso, o bolo fica na mesa. Docinhos não entram. Decoração pode, se ficar na mesa e não tiver logo ou marca. Não fornecemos vela. Fornecemos pratinho e talher.',
  },
  {
    topic: 'guarda_volume',
    category: 'geral',
    answer:
      'Não temos guarda-volumes nem chapelaria. O cliente cuida dos próprios pertences. O que for esquecido na casa é de responsabilidade de quem trouxe.',
  },
  {
    topic: 'formas_pagamento',
    category: 'geral',
    answer:
      'No crédito aceitamos Visa, Elo, American Express, Mastercard e Diners Club International. No débito, Visa, Elo, Maestro e Mastercard. Também aceitamos vale-refeição Sodexo e VR Refeição.',
  },
  {
    topic: 'vagas_emprego',
    category: 'geral',
    answer:
      'Por aqui não recebemos currículo. O envio para avaliação é no rh@ideiaum.com.br. No momento não há atendimento por telefone para vaga.',
  },
  {
    topic: 'parcerias',
    category: 'geral',
    answer: 'Material de parceria vai para luisfelipe@ideiaum.com.br.',
  },
  {
    topic: 'compras_fornecedor',
    category: 'geral',
    answer:
      'Por aqui não recebemos link de compra nem pedido para adquirir produto. O material para avaliação vai para comprador@ideiaum.com.br. Nesse assunto há atendimento por telefone.',
  },
  {
    topic: 'cancelamento_reserva',
    category: 'reserva',
    answer:
      'Se pedirem cancelamento, primeiro pergunte o motivo com calma e confirme se a pessoa quer mesmo cancelar. Quando couber, ofereça remarcar e lembre um benefício da casa. Só cancele depois que o cliente confirmar que quer cancelar de vez.',
  },
];

const LEGACY_TOPICS_TO_RETIRE = ['flyer_de_aniversario_convite_de_aniversario'];

function detectPracinhaFaqTopics(normalized) {
  const text = String(normalized || '');
  if (!text) return [];
  const topics = [];
  const add = (topic) => {
    if (topic && !topics.includes(topic)) topics.push(topic);
  };

  if (/\b19\s*[/\-]\s*11\b/.test(text)) add('programacao_19_11');
  if (/\b20\s*[/\-]\s*11\b/.test(text)) add('programacao_20_11');
  if (/\b21\s*[/\-]\s*11\b/.test(text)) add('programacao_21_11');
  if (/\b22\s*[/\-]\s*11\b/.test(text)) add('programacao_22_11');
  if (/\b27\s*[/\-]\s*11\b/.test(text)) add('programacao_27_11');
  if (/\b(ape|andar de cima|andar superior)\b/.test(text)) add('reserva_ape');
  if (/\brolha\b/.test(text)) add('taxa_rolha');
  if (/\bparceria\b/.test(text)) add('parcerias');
  if (/\b(historia da casa|como e a casa|sobre a pracinha)\b/.test(text)) add('historia');
  if (/\b(story|stories|mencao|marquei voces)\b/.test(text)) add('mencao_story');
  if (/\b(despedida|pos[- ]?casamento|cha de lingerie)\b/.test(text)) add('beneficios_despedida');
  if (/\bhappy hour\b/.test(text)) add('happy_hour');
  if (/\b(open chopp|double drink|chopp pela metade)\b/.test(text)) add('promocoes_chopp');

  return topics;
}

module.exports = {
  PRACINHA_ESTABLISHMENT_ID,
  PRACINHA_FAQS,
  LEGACY_TOPICS_TO_RETIRE,
  detectPracinhaFaqTopics,
};
