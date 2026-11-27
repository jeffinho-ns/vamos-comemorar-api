'use strict';

/**
 * Informações adicionais (fatos para o cliente) do HighLine (places.id = 7).
 * Regras de postura/fluxo moram em houseRulesCatalog.js (custom_rules).
 * Avisos temporários de bloqueio de agenda (aviso_bloqueio_agenda_*) são preservados no banco.
 */

const HIGHLINE_ESTABLISHMENT_ID = 7;

const HIGHLINE_FAQS = [
  {
    topic: 'sobre_a_casa',
    category: 'geral',
    answer:
      'O Highline é bar, restaurante e balada na Vila Madalena, com diferentes ambientes: Deck, Bar Central, Rooftop e Club (pista que abre à meia-noite aos sábados). Une gastronomia, drinks autorais e programação musical forte às sextas e sábados.',
  },
  {
    topic: 'dias_horarios_funcionamento',
    category: 'geral',
    answer:
      'Sexta e sábado a casa funciona forte. Aos sábados abrimos às 16h e vamos até 4h, com abertura do Club à meia-noite. De segunda a quarta ficamos fechados. Quinta abre em datas específicas — confirme a programação da semana.',
  },
  {
    topic: 'valores_entrada',
    category: 'evento',
    answer:
      'Com reserva e nome na lista (sujeito a alteração): até 18h entrada VIP; das 18h à meia-noite R$ 60 seco ou R$ 160 consumação; após meia-noite R$ 80 seco ou R$ 200 consumação. A reserva de mesa normal não tem custo — o valor cobrado é apenas o da entrada.',
  },
  {
    topic: 'consumacao',
    category: 'geral',
    answer:
      'A consumação é 100% revertida em desconto na comanda do cliente e não há devolução de saldo não utilizado. Vale tanto para a entrada com consumação quanto para os pacotes consumíveis de Rooftop VIP e Camarote.',
  },
  {
    topic: 'como_funciona_reserva',
    category: 'reserva',
    answer:
      'A reserva de mesa normal e bistrô no Highline é gratuita (sem taxa ou caução; paga-se apenas a entrada da noite conforme o horário de chegada). Informe data, horário, quantidade de pessoas e a área preferida. Às sextas a mesa fica segurada para chegada até 21h e aos sábados até 19h. Para grupos de 7 a 60 pessoas fazemos uma reserva única combinando mesas próximas; acima de 60 convidados o alinhamento é feito com a equipe.',
  },
  {
    topic: 'mesas_assentos',
    category: 'reserva',
    answer:
      'No Highline a mesa reservada gratuitamente funciona como ponto de encontro e apoio para o grupo. Como somos bar e balada, as pessoas costumam curtir em pé e não garantimos cadeira para todos os convidados ao mesmo tempo. Caso o grupo queira espaço exclusivo adicional, trabalhamos também com pacotes consumíveis no Rooftop e camarotes no Club.',
  },
  {
    topic: 'areas_mesas_camarotes_diferenca',
    category: 'reserva',
    answer:
      'Mesa normal (Deck - Mesas, Deck - Mesas Redondas e Bar Central - Bistrôs) não tem custo de reserva. No Rooftop VIP os pacotes são 100% consumíveis: Lounge (6 assentos) por R$ 800 e Bangalô (8 assentos) por R$ 1.000. No Club os camarotes variam conforme VIPs: 8 VIPs por R$ 2.000 (R$ 1.600 consumação) ou 10 VIPs por R$ 2.500 (R$ 2.000 consumação). Valores sujeitos a alteração.',
  },
  {
    topic: 'venda_de_mesa',
    category: 'reserva',
    answer:
      'Caso queira adquirir uma mesa adicional ou espaço exclusivo além da reserva cortesia: no Rooftop os valores são 100% consumíveis, com Lounge (6 assentos) por R$ 800 e Bangalô (8 assentos) por R$ 1.000. No Club os camarotes saem por R$ 2.000 com 8 VIPs (consome R$ 1.600) ou R$ 2.500 com 10 VIPs (consome R$ 2.000). Valores sujeitos a alteração.',
  },
  {
    topic: 'beneficios_aniversario',
    category: 'reserva',
    answer:
      'O aniversariante ganha 2 VIPs e 2 drinks G&T. Com 20 ou mais convidados presentes, ganha 1 garrafa de Gin 142 ou Clericot. Com 30 ou mais presentes, ganha a garrafa + 1 drink cortesia. Os benefícios por quantidade de convidados não são cumulativos.',
  },
  {
    topic: 'regras_bolo',
    category: 'geral',
    answer:
      'Pode levar bolo de até 2 kg, apresentando a nota fiscal na entrada.',
  },
  {
    topic: 'cardapio',
    category: 'cardapio',
    answer:
      'O cardápio digital oficial do Highline está em https://www.agilizaiapp.com.br/cardapio/highline .',
  },
  {
    topic: 'musica',
    category: 'geral',
    answer:
      'A programação musical varia conforme o evento e a operação de cada dia, passando por brasilidades, open format e house no Club. Informe a data desejada para alinharmos o estilo da noite.',
  },
  {
    topic: 'dress_code',
    category: 'geral',
    answer:
      'O dress code é casual elegante — evite chinelo e bermuda rasgada.',
  },
  {
    topic: 'estacionamento',
    category: 'geral',
    answer:
      'Não temos estacionamento próprio, mas normalmente há serviço de valet/manobrista na porta nos dias de funcionamento.',
  },
  {
    topic: 'menores_de_idade',
    category: 'geral',
    answer:
      'Menores de 18 anos podem entrar e permanecer no Highline somente até as 23h e acompanhados pelos pais ou responsável legal. Após as 23h a casa é exclusiva para maiores de 18 anos.',
  },
  {
    topic: 'pet',
    category: 'geral',
    answer:
      'O Highline não é pet friendly — não permitimos entrada de animais, mesmo de pequeno porte ou no colo, exceto cães-guia conforme a legislação.',
  },
  {
    topic: 'redes_sociais_fotos',
    category: 'geral',
    answer:
      'Para ver fotos dos ambientes e a vibe da casa, acesse o Instagram oficial: https://www.instagram.com/highlinebar/ .',
  },
];

/** Meta-regras antigas que estavam na tabela de FAQs e migraram para custom_rules / código. */
const HIGHLINE_TOPICS_TO_DELETE = [
  'assentos',
  'capacidade_diaria_highline',
  'capacidade_por_reserva',
  'coleta_dados_progressiva_reserva',
  'como_reservar',
  'controle_duplicidade_reservas',
  'eco_saudacao_cliente',
  'horario_corte_chegada_reserva',
  'pergunta_area_antes_de_mesa',
  'primeiro_contato_anuncio',
  'prioridade_treinamento_ia',
  'proibicao_confirmacao_falsa_reserva',
  'proibicao_multiplas_reservas_mesmo_grupo',
  'reserva',
  'reserva_areas_operacional_highline',
  'reserva_grupos_grandes_highline',
  'subareas_canonicas_highline',
  'tom_atendimento_humano',
  'valor_entrada_vs_caucao',
];

module.exports = {
  HIGHLINE_ESTABLISHMENT_ID,
  HIGHLINE_FAQS,
  HIGHLINE_TOPICS_TO_DELETE,
};
