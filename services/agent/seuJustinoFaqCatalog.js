/**
 * Base de Informações adicionais do Seu Justino (places.id = 1).
 * Cada texto é fato para o cliente: a IA cita só o trecho da pergunta.
 * Não começar com "Regra" — esse prefixo é removido do prompt.
 */

const SEU_JUSTINO_ESTABLISHMENT_ID = 1;

const SEU_JUSTINO_FAQS = [
  {
    topic: 'dias_horarios_funcionamento',
    category: 'geral',
    label: 'Dias e horários de funcionamento',
    answer:
      'Terça, quarta e quinta a casa abre às 18h e vai até 1h. Sexta abre às 18h e vai até 3h30, com a cozinha até 1h. Sábado funciona das 14h às 5h. Domingo funciona das 12h às 22h. A cozinha encerra sempre uma hora antes do fim da casa, salvo quando o dia tiver horário próprio. Entrada, atração e promoção mudam conforme o dia, e valores e programação podem mudar sem aviso.',
  },
  {
    topic: 'valores_entrada',
    category: 'geral',
    label: 'Valores de entrada e lista',
    answer:
      'A entrada depende do dia. Terça e quarta não cobram entrada. Quinta não cobra entrada e tem couvert artístico de R$ 25. Sexta é VIP das 18h às 21h; depois disso, R$ 30 ou R$ 160 de consumação. Sábado é grátis das 14h às 15h; depois, R$ 30 seco ou R$ 160 de consumação. Domingo não cobra entrada; o couvert artístico, se perguntarem, é R$ 30. Feriados e a virada têm regra própria. Valores sujeitos a alteração.',
  },
  {
    topic: 'informacoes_terca',
    category: 'geral',
    label: 'Informações de terça-feira',
    answer:
      'Às terças a casa funciona das 18h à 1h, com som ambiente e comanda individual, sem entrada. Tem chopp Amstel por R$ 7,45 ou Heineken por R$ 8,45, válido até 0h. Cite só o que o cliente perguntou. Valores e condições da promoção podem mudar.',
  },
  {
    topic: 'informacoes_quarta',
    category: 'geral',
    label: 'Informações de quarta-feira',
    answer:
      'Às quartas a casa funciona das 18h à 1h, com som ambiente e comanda individual, no Happy Hour do Justa. A cozinha encerra à 0h. Não há entrada nem atração ao vivo. Até as 23h há open chopp Amstel por R$ 62,90 ou open de bolinhos de boteco e chopp por R$ 109,90. Cite só o que o cliente perguntou. Valores e condições podem mudar.',
  },
  {
    topic: 'informacoes_quinta',
    category: 'geral',
    label: 'Informações de quinta-feira',
    answer:
      'Às quintas a casa funciona das 18h à 1h, com pagode das 20h às 23h e comanda individual. A entrada é gratuita e o couvert artístico é R$ 25. Tem chopp Amstel por R$ 7,45 ou Heineken por R$ 8,45, válido até 0h. Cite só o que o cliente perguntou. Valores, promoções e programação podem mudar.',
  },
  {
    topic: 'informacoes_sexta',
    category: 'geral',
    label: 'Informações de sexta-feira',
    answer:
      'Às sextas a casa funciona das 18h às 3h30 e a cozinha encerra à 1h. A programação tem sertanejo, pagode e DJ nos intervalos. A entrada é VIP das 18h às 21h. Depois das 21h, o cliente escolhe R$ 30 de entrada ou R$ 160 de consumação. Cite só o que o cliente perguntou. Valores e condições podem mudar.',
  },
  {
    topic: 'informacoes_sabado',
    category: 'geral',
    label: 'Informações de sábado',
    answer:
      'Aos sábados a casa funciona das 14h às 5h, com comanda individual. Das 14h às 17h é som ambiente, das 17h às 21h pagode no Quintal, das 22h às 2h pagode na área interna e das 2h às 5h DJ na área interna. A entrada é gratuita das 14h às 15h; depois das 15h custa R$ 30 seco ou R$ 160 de consumação. Nas reservas das 14h às 17h, você terá uma mesa com 8 assentos e dois bistrôs de suporte. Nas reservas após as 17h, terá uma mesa com 6 assentos (com mesa bistrô de espera caso a mesa ainda não esteja pronta na chegada). Cite só o detalhe perguntado. Valores e programação podem mudar sem aviso.',
  },
  {
    topic: 'reservas_assentos_sabado',
    category: 'reserva',
    label: 'Reservas e assentos aos sábados',
    answer:
      'Nas reservas de sábado das 14h às 17h, você terá uma mesa com 8 assentos e dois bistrôs de suporte, e conforme os convidados forem chegando vamos acomodando todos na sua reserva de acordo com a disponibilidade da casa. Nas reservas após as 17h até o final do dia, você terá uma reserva de mesa com 6 assentos; se ao chegar à casa sua mesa não estiver disponível, disponibilizamos uma mesa bistrô até que sua mesa fique pronta. Como somos um bar-balada, não trabalhamos com o público 100% sentado, mas conforme houver mesas disponíveis a casa vai acomodando todos na sua reserva.',
  },
  {
    topic: 'informacoes_domingo',
    category: 'geral',
    label: 'Informações de domingo',
    answer:
      'Aos domingos a casa funciona das 12h às 22h, com comanda individual, samba e sertanejo. A entrada é gratuita. O couvert artístico, se perguntarem, é R$ 30 e pode mudar. No Seu Domingo a feijoada é R$ 89,90 até as 17h, opcional: o cardápio da casa segue normal. Crianças de 6 a 10 anos pagam metade da feijoada e menores de 5 anos não pagam. A roda de samba é das 15h às 18h. Cite só o que foi perguntado. Valores e programação podem mudar.',
  },
  {
    topic: 'reveillon',
    category: 'geral',
    label: 'Réveillon',
    answer:
      'Em 31/12/2026 o Seu Justino e o Pracinha fazem Réveillon só com ingresso, em https://www.ingresse.com/super-reveillon-harmonia-seu-justino-pracinha/ . O evento tem open food e open bar premium, com ceia, finger foods, sobremesas, opções da madrugada, bebidas, drinks e cervejas. O cardápio completo está no link de compra. Nesse dia a reserva comum fica indisponível: o caminho é comprar o ingresso. Fora do que está neste texto, confirme com a equipe em vez de completar horário, valor ou atração.',
  },
  {
    topic: 'eventos_corporativos',
    category: 'evento',
    label: 'Eventos corporativos',
    answer:
      'Se o cliente quiser fazer um evento, pergunte se prefere pacote fechado de comidas e bebidas ou reserva simples de mesa com comandas individuais. No pacote fechado, peça nome, empresa, telefone ou WhatsApp, e-mail, número estimado de pessoas, data, horário, o que espera do evento e se prefere retorno por e-mail, WhatsApp ou ligação. Com esses dados completos, passe na hora para uma pessoa da equipe e pare de responder: as condições seguem por e-mail. Na reserva simples, siga o fluxo normal, pergunte a data e informe as condições da casa naquele dia. Reserva simples permanece no atendimento de reservas.',
  },
  {
    topic: 'beneficios_aniversario',
    category: 'reserva',
    label: 'Aniversário e despedida',
    answer:
      'Na reserva de aniversário, o aniversariante tem entrada VIP para si e um acompanhante. A cortesia depende de quantas pessoas vão: até 10 convidados, 1 drink; de 11 a 19, 2 drinks; a partir de 20, uma opção entre garrafa de Chandon Brut, balde de Heineken ou Heineken Ultimate com 10 unidades, garrafa de Gin 142 ou garrafa de Vodka Belvedere. As cortesias não se somam. Diga só o benefício que o cliente perguntou. Ao fechar a reserva, ofereça o flyer e peça uma foto.',
  },
  {
    topic: 'flyer_aniversario',
    category: 'reserva',
    label: 'Flyer de aniversário',
    answer:
      'Quando a reserva de aniversário estiver fechada, ofereça o flyer e peça uma foto. Com a foto recebida, avise que a equipe produz o flyer e envia no WhatsApp quando ficar pronto, e passe o atendimento para uma pessoa da casa.',
  },
  {
    topic: 'regras_bolo',
    category: 'geral',
    label: 'Bolo, docinhos e balões',
    answer:
      'Em reserva de aniversário pode levar bolo de até 2 kg, com nota fiscal ou recibo, para a equipe guardar. Sem o comprovante, o bolo fica na mesa do cliente. A casa fornece pratinhos e talheres descartáveis para o bolo. Docinhos não entram. Balões podem, desde que fiquem na mesa e não tenham logomarca.',
  },
  {
    topic: 'sobre_a_casa',
    category: 'geral',
    label: 'Sobre a casa e estilo',
    answer:
      'O Seu Justino é um bar e balada na Vila Madalena, na Rua Harmonia, 77. Tem área coberta (parte interna) e área descoberta (quintal). O clima é de boteco animado: petiscos, drinks, chopp e programação musical que muda conforme o dia. À noite o público costuma ficar em pé para curtir as atrações; mesa e bistrô são apoio. Cite só o que o cliente perguntou.',
  },
  {
    topic: 'cardapio',
    category: 'cardapio',
    label: 'Cardápio e pratos',
    answer:
      'O cardápio digital da casa está em https://www.agilizaiapp.com.br/cardapio/justino . A cozinha serve petiscos de boteco, pratos e drinks. Aos domingos, no Seu Domingo, tem feijoada por R$ 89,90 até as 17h, opcional: o cardápio da casa segue normal. Crianças de 6 a 10 anos pagam metade da feijoada e menores de 5 anos não pagam. Fora do que estiver nas fichas do dia, confirme prato ou preço com a equipe. Cite só o que foi perguntado. Valores podem mudar.',
  },
  {
    topic: 'como_funciona_reserva',
    category: 'reserva',
    label: 'Como funciona a reserva',
    answer:
      'Para reservar, informe data, horário e quantas pessoas, e escolha entre área coberta (parte interna) ou área descoberta (quintal). A reserva tolera 15 minutos de atraso. Aos sábados das 14h às 17h você terá uma mesa com 8 assentos e dois bistrôs de suporte; após as 17h terá uma mesa com 6 assentos (e uma mesa bistrô caso sua mesa ainda não esteja pronta ao chegar). Como somos um bar-balada, não trabalhamos com o público 100% sentado, mas conforme os convidados chegam e há disponibilidade a casa vai acomodando todos na reserva.',
  },
  {
    topic: 'mesas_assentos',
    category: 'reserva',
    label: 'Mesas, lugares e assentos',
    answer:
      'Na reserva o cliente escolhe entre área coberta e área descoberta. Como somos um bar-balada, não trabalhamos com o público 100% sentado, mas conforme os convidados forem chegando e houver mesas disponíveis, a casa vai acomodando todos na sua reserva. Aos sábados das 14h às 17h a reserva conta com mesa de 8 assentos e dois bistrôs de suporte; após as 17h, mesa de 6 assentos (com mesa bistrô de apoio caso a mesa ainda não esteja pronta na chegada).',
  },
  {
    topic: 'tempo_permanencia',
    category: 'reserva',
    label: 'Tempo de permanência',
    answer:
      'A casa não define tempo de permanência: o cliente fica o quanto quiser. O horário da reserva é só o limite de chegada.',
  },
  {
    topic: 'atraso_tolerancia',
    category: 'reserva',
    label: 'Atraso e tolerância',
    answer:
      'A reserva tolera 15 minutos depois do horário marcado. Se for atrasar, o cliente deve avisar o quanto antes para a casa ver se a mesa continua disponível. Passados os 15 minutos, a reserva pode ser liberada conforme a ocupação.',
  },
  {
    topic: 'cancelamento_reserva',
    category: 'reserva',
    label: 'Cancelamento de reserva',
    answer:
      'Se pedirem cancelamento, primeiro pergunte o motivo com calma e confirme se quer mesmo cancelar. Quando couber, ofereça remarcar e lembre um benefício da casa. O link de cancelamento só sai depois que o cliente confirmar que quer cancelar de vez.',
  },
  {
    topic: 'areas_mesas_camarotes_diferenca',
    category: 'reserva',
    label: 'Áreas da casa',
    answer:
      'Para reservar, o cliente escolhe somente área coberta ou área descoberta. Área coberta é a parte interna. Área descoberta é o quintal. Depois da escolha, a casa encaixa a mesa naquele lado. Não ofereça Praça, Apê, lounge nem os nomes internos do quintal.',
  },
  {
    topic: 'acessibilidade',
    category: 'geral',
    label: 'Acessibilidade',
    answer:
      'O local tem acessibilidade, com rampas e banheiros adaptados.',
  },
  {
    topic: 'guarda_volume',
    category: 'geral',
    label: 'Guarda-volumes e chapelaria',
    answer:
      'A casa não oferece guarda-volumes nem chapelaria. Os pertences ficam com o próprio cliente durante a permanência, e objeto esquecido é responsabilidade de quem esqueceu.',
  },
  {
    topic: 'vagas_emprego',
    category: 'geral',
    label: 'Currículo, freelancer e vagas',
    answer:
      'Por aqui não recebemos currículo. O envio é para rh@ideiaum.com.br.',
  },
  {
    topic: 'formas_pagamento',
    category: 'geral',
    label: 'Formas de pagamento',
    answer:
      'A casa aceita dinheiro, Pix, cartão de débito e cartão de crédito. No débito: Visa, Elo, American Express, Mastercard e Diners Club International. No crédito: Visa, Elo, Maestro e Mastercard. Vale-refeição: Ticket e Sodexo. Alelo e a marca VR ficam de fora.',
  },
  {
    topic: 'como_chegar',
    category: 'geral',
    label: 'Como chegar',
    answer:
      'O endereço é Rua Harmonia, 77, Vila Madalena. Os metrôs mais próximos são Fradique Coutinho, na Linha 4-Amarela, e Vila Madalena, na Linha 2-Verde.',
  },
  {
    topic: 'compras_fornecedor',
    category: 'geral',
    label: 'Compras e fornecedor',
    answer:
      'Por aqui o atendimento é de reservas. Fornecedor e compras seguem por e-mail, em comprador@ideiaum.com.br, e no momento não há telefone para esse assunto. Banda envia material para a curadoria em https://docs.google.com/forms/d/1EhsYYOJ7534cKjT4gbAb-zUXfcFM-DrJnhCZkmtb0L0/edit . A curadoria analisa e retorna.',
  },
  {
    topic: 'estacionamento',
    category: 'geral',
    label: 'Estacionamento',
    answer:
      'A casa não tem estacionamento próprio. Há um estacionamento ao lado, sem vínculo com a casa. O valor é informado no local; a equipe da casa não tem essa tabela.',
  },
  {
    topic: 'entrada_bebidas',
    category: 'geral',
    label: 'Entrada com bebidas',
    answer: 'Não é permitido entrar com bebidas.',
  },
  {
    topic: 'estrutura_funcionamento',
    category: 'geral',
    label: 'Estrutura e funcionamento',
    answer:
      'A casa tem ar-condicionado, área aberta, área coberta e área para fumantes em frente à unidade. A cozinha encerra sempre uma hora antes do fim da casa.',
  },
  {
    topic: 'delivery',
    category: 'cardapio',
    label: 'Delivery',
    answer:
      'O delivery fica em https://www.ifood.com.br/delivery/sao-paulo-sp/villa-seu-justino-madalena-sumarezinho . Também há retirada no local e não existe pedido mínimo.',
  },
  {
    topic: 'menores_criancas',
    category: 'geral',
    label: 'Menores e crianças',
    answer:
      'Pelo Estatuto da Criança e do Adolescente, menor de 18 anos pode ficar no local acompanhado dos pais ou responsáveis. Venda e consumo de bebida alcoólica por menor são proibidos, no artigo 243 do ECA. A permanência de menor na casa vai até 23h.',
  },
  {
    topic: 'area_kids',
    category: 'geral',
    label: 'Área kids',
    answer: 'A casa não tem área kids.',
  },
  {
    topic: 'documento_entrada',
    category: 'geral',
    label: 'Documento para entrada',
    answer:
      'Para entrar é preciso documento com foto atualizada, físico ou digital. Pode ser passaporte, RG ou CNH.',
  },
  {
    topic: 'narguile',
    category: 'geral',
    label: 'Narguilé',
    answer: 'A casa não trabalha com narguilé e não permite narguilé no local.',
  },
  {
    topic: 'pet',
    category: 'geral',
    label: 'Pets',
    answer: 'O Seu Justino não é pet friendly.',
  },
  {
    topic: 'musica',
    category: 'geral',
    label: 'Música, programação e atrações',
    answer:
      'A atração e a programação mudam por dia. Terça e quarta têm som ambiente. Quinta tem pagode das 20h às 23h. Sexta tem sertanejo, pagode e DJ nos intervalos. Sábado tem som ambiente das 14h às 17h, pagode no Quintal das 17h às 21h, pagode na área interna das 22h às 2h e DJ das 2h às 5h. Domingo tem samba, sertanejo e roda de samba das 15h às 18h. Cite só o dia perguntado. Se pedirem artista ou horário de uma data específica sem ficha do dia, confirme com a equipe.',
  },
];

const ALIAS_TO_TOPIC = {
  informacoes_de_sabado: 'informacoes_sabado',
  informacoes_sabado: 'informacoes_sabado',
  sabado: 'informacoes_sabado',
  reservas_e_assentos_aos_sabados: 'reservas_assentos_sabado',
  informacoes_de_terca_feira: 'informacoes_terca',
  informacoes_de_terca: 'informacoes_terca',
  terca: 'informacoes_terca',
  informacoes_de_quarta_feira: 'informacoes_quarta',
  informacoes_de_quarta: 'informacoes_quarta',
  quarta: 'informacoes_quarta',
  informacoes_de_quinta_feira: 'informacoes_quinta',
  informacoes_de_quinta: 'informacoes_quinta',
  quinta: 'informacoes_quinta',
  informacoes_de_sexta_feira: 'informacoes_sexta',
  informacoes_de_sexta: 'informacoes_sexta',
  sexta: 'informacoes_sexta',
  informacoes_de_domingo: 'informacoes_domingo',
  domingo: 'informacoes_domingo',
  feriado_de_15_11: 'programacao_15_11',
  feriado_15_11: 'programacao_15_11',
  feriado_de_02_11: 'programacao_02_11',
  feriado_02_11: 'programacao_02_11',
  '01_11_vespera_de_feriado': 'programacao_01_11',
  vespera_01_11: 'programacao_01_11',
  reveillon_ano_novo_virada_do_ano: 'reveillon',
  ano_novo: 'reveillon',
  virada: 'reveillon',
  eventos_corporativos_confraternizacoes: 'eventos_corporativos',
  confraternizacao: 'eventos_corporativos',
  aniversario_despedida: 'beneficios_aniversario',
  flyer_convite_de_aniversario: 'flyer_aniversario',
  bolo_de_aniversario_docinhos_e_baloes: 'regras_bolo',
  descartaveis_pratinhos_de_bolo: 'regras_bolo',
  sobre_a_casa_estilo: 'sobre_a_casa',
  sobre_a_casa_e_estilo: 'sobre_a_casa',
  estilo_da_casa: 'sobre_a_casa',
  cardapio_e_pratos: 'cardapio',
  cardapio_pratos: 'cardapio',
  como_funciona_a_reserva: 'como_funciona_reserva',
  como_funciona_reserva_de_mesa: 'como_funciona_reserva',
  reserva_de_mesa: 'como_funciona_reserva',
  atracoes: 'musica',
  atracao: 'musica',
  musica_e_programacao: 'musica',
  musica_programacao_e_atracoes: 'musica',
  mesas_lugares_e_assentos: 'mesas_assentos',
  tempo_de_permanencia: 'tempo_permanencia',
  atraso_tolerancia: 'atraso_tolerancia',
  cancelamento_de_reserva: 'cancelamento_reserva',
  guarda_volume_chapelaria: 'guarda_volume',
  chapelaria: 'guarda_volume',
  envio_de_curriculo_freelancer_vagas_de_emprego: 'vagas_emprego',
  curriculo: 'vagas_emprego',
  vagas: 'vagas_emprego',
  forma_de_pagamento: 'formas_pagamento',
  formas_de_pagamento: 'formas_pagamento',
  pagamento: 'formas_pagamento',
  como_chegar_endereco: 'como_chegar',
  endereco: 'como_chegar',
  compras_fornecedor: 'compras_fornecedor',
  fornecedor: 'compras_fornecedor',
  entrada_com_bebidas: 'entrada_bebidas',
  estrutura_e_funcionamento: 'estrutura_funcionamento',
  menores_de_idade_criancas: 'menores_criancas',
  criancas: 'menores_criancas',
  area_kids: 'area_kids',
  kids: 'area_kids',
  rg_e_documento_para_entrada: 'documento_entrada',
  documento: 'documento_entrada',
  petfrendly: 'pet',
  pet_friendly: 'pet',
  narguile: 'narguile',
};

/** Tópicos genéricos antigos do seed. A resposta nova fica no tópico canônico. */
const LEGACY_TOPICS_TO_RETIRE = [
  'pets',
  'aniversarios',
  'aniversario',
  'areas',
  'area',
  'horario_funcionamento',
  // Datas passadas: confundem feijoada/programação atual se ficarem ativas.
  'programacao_01_11',
  'programacao_02_11',
  'programacao_15_11',
];

function canonicalAliasFor(topic) {
  const raw = String(topic || '').trim();
  const key = raw
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return ALIAS_TO_TOPIC[key] || ALIAS_TO_TOPIC[raw] || '';
}

function detectSeuJustinoFaqTopics(normalized) {
  const text = String(normalized || '');
  if (!text) return [];
  const topics = [];
  const add = (topic) => {
    if (topic && !topics.includes(topic)) topics.push(topic);
  };

  if (/\b15\s*[/\-]\s*11\b/.test(text) || /\b15 de novembro\b/.test(text)) {
    add('programacao_15_11');
  }
  if (
    /\b0?2\s*[/\-]\s*11\b/.test(text) ||
    /\b(2|dois) de novembro\b/.test(text) ||
    /\bfinados\b/.test(text)
  ) {
    add('programacao_02_11');
  }
  if (/\b0?1\s*[/\-]\s*11\b/.test(text) || /\b(1|primeiro) de novembro\b/.test(text)) {
    add('programacao_01_11');
  }
  if (/\b(reveillon|ano novo|virada)\b/.test(text) || /\b31\s*[/\-]\s*12\b/.test(text)) {
    add('reveillon');
  }

  const hasSpecificDate = topics.length > 0;
  if (!hasSpecificDate && /\btercas?\b/.test(text)) add('informacoes_terca');
  if (!hasSpecificDate && /\bquartas?\b/.test(text)) add('informacoes_quarta');
  if (!hasSpecificDate && /\bquintas?\b/.test(text)) add('informacoes_quinta');
  if (!hasSpecificDate && /\bsextas?\b/.test(text)) add('informacoes_sexta');
  if (!hasSpecificDate && /\bdomingos?\b/.test(text)) add('informacoes_domingo');
  if (!hasSpecificDate && /\bsabad[oa]s?\b/.test(text)) {
    add('informacoes_sabado');
    if (/\b(mesa|mesas|bistro|assent|sentad|em pe|lugar|lugares|reserv\w*)\b/.test(text)) {
      add('reservas_assentos_sabado');
    }
  }

  if (
    /\b(evento corporativo|confraterniz|pacote fechado|festa da empresa|fazer um evento|realizar um evento)\b/.test(
      text
    )
  ) {
    add('eventos_corporativos');
  }
  if (/\b(permanenc|quanto tempo posso ficar|fico a vontade)\b/.test(text)) {
    add('tempo_permanencia');
  }
  if (/\batras\w*\b|\btoleranc\w*\b/.test(text)) add('atraso_tolerancia');
  if (/\b(cancelar|cancelamento|desmarcar)\b/.test(text)) add('cancelamento_reserva');
  if (/\b(guarda[- ]?volume|chapelaria|guardar (a )?bolsa|pertence)\b/.test(text)) {
    add('guarda_volume');
  }
  if (/\b(curriculo|freelancer|vaga de emprego|trabalhar ai|trabalhar aqui)\b/.test(text)) {
    add('vagas_emprego');
  }
  if (/\b(pagamento|cartao|pix|vale[- ]?refeicao|dinheiro|alelo|sodexo)\b/.test(text)) {
    add('formas_pagamento');
  }
  if (/\b(endereco|como chegar|onde fica|harmonia)\b/.test(text)) add('como_chegar');
  if (/\b(fornecedor|comprador|orcamento de compra|banda|curadoria)\b/.test(text)) {
    add('compras_fornecedor');
  }
  if (/\b(acessib|rampa|cadeirante|banheiro adaptado)\b/.test(text)) add('acessibilidade');
  if (
    /\b(entrar com bebidas?|levar bebidas?|bebida de fora|entrada com bebidas?)\b/.test(text)
  ) {
    add('entrada_bebidas');
  }
  if (/\b(ar[- ]?condicionado|area para fumar|fumante|cozinha fecha|horario da cozinha)\b/.test(text)) {
    add('estrutura_funcionamento');
  }
  if (
    /\b(estilo|conceito|proposta|vibe|perfil) (da|do|de) (casa|bar|lugar|local)\b|\btipo de (casa|bar|lugar|local)\b|\bcomo (e|funciona) (a|o) (casa|bar|lugar|local)\b|\bsobre a casa\b/.test(
      text
    )
  ) {
    add('sobre_a_casa');
    add('estrutura_funcionamento');
    add('mesas_assentos');
  }
  if (
    /\bcomo funciona (a )?reserva\b|\bcomo reservar\b|\breserva de mesa\b|\breservar mesa\b/.test(text)
  ) {
    add('como_funciona_reserva');
    add('mesas_assentos');
    add('areas_mesas_camarotes_diferenca');
  }
  if (/\b(cardapio|pratos?|petisco|petiscos|feijoada|comida|menu)\b/.test(text)) {
    add('cardapio');
  }
  if (/\b(atracao|atracoes|line[- ]?up|quem toca|programacao musical)\b/.test(text)) {
    add('musica');
  }
  if (/\b(delivery|ifood|entrega|retirada)\b/.test(text)) add('delivery');
  if (/\b(menor de idade|menores|crianca|criancas|eca)\b/.test(text)) add('menores_criancas');
  if (/\b(flyer|convite de aniversario)\b/.test(text)) add('flyer_aniversario');
  if (/\b(area kids|espaco kids|kids)\b/.test(text)) add('area_kids');
  if (/\b(documento|rg|cnh|passaporte|identidade)\b/.test(text)) add('documento_entrada');
  if (/\b(narguile|narghile)\b/.test(text)) add('narguile');
  if (/\b(bolo|docinho|docinhos|balao|baloes|pratinho|descartav)\b/.test(text)) {
    add('regras_bolo');
  }
  if (/\b(mesa|mesas|assento|sentar|sentado|em pe|bistro)\b/.test(text) && !/\bsabad/.test(text)) {
    add('mesas_assentos');
  }

  return topics;
}

module.exports = {
  SEU_JUSTINO_ESTABLISHMENT_ID,
  SEU_JUSTINO_FAQS,
  LEGACY_TOPICS_TO_RETIRE,
  canonicalAliasFor,
  detectSeuJustinoFaqTopics,
};
