'use strict';

/**
 * Informações adicionais (fatos para o cliente) do Reserva Rooftop Perdizes (id = 9)
 * e do Restaurante Reserva Pinheiros (id = 21).
 * Regras de comportamento/condução moram em houseRulesCatalog.js (custom_rules).
 */

const RESERVA_ROOFTOP_ESTABLISHMENT_ID = 9;
const RESERVA_PINHEIROS_ESTABLISHMENT_ID = 21;

const RESERVA_ROOFTOP_FAQS = [
  {
    topic: 'unidades',
    category: 'geral',
    answer:
      'Trabalhamos com duas unidades: o Restaurante Reserva Rooftop, no Jardim das Perdizes (funcionando normalmente), e o Restaurante Reserva Pinheiros, cuja inauguração está prevista mas ainda sem data oficial confirmada.',
  },
  {
    topic: 'sobre_a_casa',
    category: 'geral',
    answer:
      'O Reserva Rooftop fica no Jardim das Perdizes e combina gastronomia variada, parrilla, drinks autorais e música ao vivo em ambientes amplos (Área Interna, Área Externa e Salão). Nos dias frios dispomos de aquecedores e cobertores. Tour 360° em https://www.lista360.com.br/virtual-tour/reservarooftop/ .',
  },
  {
    topic: 'dias_horarios_funcionamento',
    category: 'geral',
    answer:
      'Funcionamos de terça a domingo. A cozinha encerra às 00h30 de terça a sábado e às 21h30 aos domingos. O consumo é registrado em comandas individuais apresentadas no caixa na saída. Horários e programação estão sujeitos a alterações conforme a data.',
  },
  {
    topic: 'valores_entrada',
    category: 'geral',
    answer:
      'Não cobramos taxa de reserva (a reserva é gratuita). Às sextas-feiras à noite há entrada fixa de R$ 20,00 e não é cobrado couvert artístico. Nos demais dias com música ao vivo, o couvert artístico é de R$ 20,00 (opcional). Valores sujeitos a alterações.',
  },
  {
    topic: 'musica',
    category: 'geral',
    answer:
      'Programação musical padrão: terça a quinta tem Brasilidades (voz e violão) das 20h às 23h; sexta tem Folk (voz e violão) das 20h às 23h; sábado tem Samba das 13h às 16h e Brasilidades (voz e violão) das 16h às 23h; domingo tem Brasilidades (voz e violão) das 13h às 17h. Programação sujeita a alterações conforme a data.',
  },
  {
    topic: 'como_funciona_reserva',
    category: 'reserva',
    answer:
      'A reserva é gratuita. Informe a unidade desejada, data, horário, quantidade de pessoas e a preferência entre Área Interna, Área Externa ou Salão. De terça a sexta fazemos reservas normalmente; aos sábados e domingos garantimos até 16 assentos das 12h às 16h e até 10 assentos a partir das 17h (convidados adicionais são acomodados conforme disponibilidade).',
  },
  {
    topic: 'areas_mesas_camarotes_diferenca',
    category: 'reserva',
    answer:
      'No Reserva Rooftop Perdizes trabalhamos com três opções de ambiente na reserva: Área Interna, Área Externa (disponível especialmente aos sábados e domingos mediante disponibilidade) e Salão. Você pode visualizar os espaços no Tour 360°: https://www.lista360.com.br/virtual-tour/reservarooftop/ .',
  },
  {
    topic: 'cardapio',
    category: 'cardapio',
    answer:
      'O cardápio digital do Reserva Rooftop Perdizes está em https://www.agilizaiapp.com.br/cardapio/reserva-rooftop . O cardápio do Restaurante Reserva Pinheiros ainda está em finalização e será baseado no menu de Perdizes.',
  },
  {
    topic: 'feijoada',
    category: 'cardapio',
    answer:
      'Aos sábados, das 12h às 16h, servimos feijoada com buffet completo de acompanhamentos por R$ 98,90 por pessoa. Crianças de 0 a 5 anos não pagam e de 6 a 10 anos pagam meia. Valores e programação sujeitos a alterações.',
  },
  {
    topic: 'promocao_vinho',
    category: 'cardapio',
    answer:
      'Às terças, quartas, quintas e domingos temos opções de garrafas de vinho por R$ 99,00 e taças por R$ 29,90, além de isenção da taxa de rolha no jantar limitada a 1 garrafa de vinho por reserva.',
  },
  {
    topic: 'taxa_rolha',
    category: 'geral',
    answer:
      'A taxa de rolha é de R$ 100,00, válida somente para garrafas de vinho. Às terças, quartas, quintas e domingos no jantar há isenção na primeira garrafa por reserva.',
  },
  {
    topic: 'beneficios_aniversario',
    category: 'reserva',
    answer:
      'Os benefícios de aniversário com reserva não são cumulativos (vale apenas a faixa atingida): até 19 convidados, 1 sobremesa cortesia; de 20 a 29 convidados, 1 torre de Reserva Spritz (com opção sem álcool); a partir de 30 convidados, 1 garrafa de Gin Nacional.',
  },
  {
    topic: 'regras_bolo',
    category: 'geral',
    answer:
      'No Reserva Rooftop Perdizes é permitida a entrada de bolo de até 3 kg (mediante apresentação de Nota Fiscal ou assinatura de Termo de Responsabilidade), até 100 docinhos e pequenas decorações de mesa. A casa armazena o bolo e fornece talheres.',
  },
  {
    topic: 'eventos_corporativos',
    category: 'evento',
    answer:
      'Temos 3 formatos para eventos: 1) Evento fechado (pacote de comidas e bebidas inclusas por período determinado, elaborado a partir do budget do cliente); 2) Reserva com menu pré-selecionado lançado em comanda única; 3) Consumação por pessoa (caso ultrapasse o valor definido, paga-se a diferença). Informe qual formato prefere e a data desejada.',
  },
  {
    topic: 'beneficios_programas',
    category: 'geral',
    answer:
      'Aceitamos: Prime Gourmet (terça a quinta, domingo à noite e almoço de sexta: na compra de uma massa ou risoto, ganha outro igual ou de menor valor), Duo Gourmet (mesmos dias: na compra de um prato principal ou da parrilla, ganha outro igual ou de menor valor) e Mastercard Surpreenda (isenção de rolha na 1ª garrafa + 1 sobremesa cortesia). Condições não cumulativas.',
  },
  {
    topic: 'como_chegar',
    category: 'geral',
    answer:
      'Ficamos na Rua Marc Chagall, s/n, em frente ao Portão 2 (Stand Tecnisa), Jardim das Perdizes — o endereço não possui número, basta buscar "Reserva Rooftop" no GPS ou aplicativo de transporte. Estações mais próximas: Água Branca e Palmeiras-Barra Funda.',
  },
  {
    topic: 'estacionamento',
    category: 'geral',
    answer:
      'O Reserva Rooftop Perdizes possui estacionamento próprio e gratuito para clientes.',
  },
  {
    topic: 'formas_pagamento',
    category: 'geral',
    answer:
      'Aceitamos dinheiro em espécie, Pix, cartão de débito (Visa, Elo, American Express, Mastercard e Diners Club), cartão de crédito (Visa, Elo, Mastercard e Maestro) e vale-refeição (Alelo, Sodexo/Pluxee, Ticket e VR). Trabalhamos com comandas individuais.',
  },
  {
    topic: 'acessibilidade',
    category: 'geral',
    answer:
      'Sim, nossa casa conta com elevadores e rampas para proporcionar conforto e acessibilidade a todos.',
  },
  {
    topic: 'pet',
    category: 'geral',
    answer:
      'Sim, o Reserva Rooftop é pet friendly e você pode trazer seu pet.',
  },
  {
    topic: 'menores_criancas',
    category: 'geral',
    answer:
      'Menores de idade desacompanhados podem permanecer até as 22h; após esse horário, somente acompanhados pelo responsável legal (não é permitido outro adulto sem guarda legal). Em Perdizes, aos finais de semana pode haver recreação infantil conforme a programação da data.',
  },
  {
    topic: 'dias_frio',
    category: 'geral',
    answer:
      'Nos dias frios disponibilizamos aquecedores e cobertores para os clientes ficarem bem acomodados.',
  },
  {
    topic: 'redes_sociais_fotos',
    category: 'geral',
    answer:
      'Você pode conhecer nossos ambientes no Tour 360°: https://www.lista360.com.br/virtual-tour/reservarooftop/ .',
  },
  {
    topic: 'natal',
    category: 'evento',
    answer:
      'Natal 2026 no Reserva Rooftop: ingressos de primeiro lote por R$ 400,00 por pessoa (poucas unidades), à venda em https://zig.tickets/evento/natal-2026-reserva-rooftop (com taxa) ou via Pix direto conosco sem taxa. O menu especial de Natal está em finalização.',
  },
  {
    topic: 'reveillon',
    category: 'evento',
    answer:
      'As vendas para o Réveillon 2027 no Reserva Rooftop estão abertas em https://zig.tickets/evento/reveillon-2027-reserva-rooftop (com taxa) ou via Pix direto conosco sem taxa. Após adquirir o ingresso pelo site, entre em contato conosco para reservar a mesa.',
  },
  {
    topic: 'vagas_emprego',
    category: 'geral',
    answer:
      'Este canal é exclusivo para reservas. Currículos, vagas e oportunidades de freelancer devem ser enviados diretamente ao RH pelo e-mail rh@ideiaum.com.br .',
  },
  {
    topic: 'compras_fornecedor',
    category: 'geral',
    answer:
      'Este canal é exclusivo para reservas. Propostas de fornecedores, compras e apresentação de produtos devem ser enviadas para compradora@idea1.com.br . Contratações de bandas, músicos e atrações musicais são realizadas exclusivamente pela plataforma E-Shows.',
  },
  {
    topic: 'parcerias',
    category: 'geral',
    answer:
      'Para parcerias, encaminhe seu material para analista.mkt02@ideiaum.com.br .',
  },
];

const RESERVA_PINHEIROS_FAQS = [
  {
    topic: 'unidades',
    category: 'geral',
    answer:
      'A inauguração do Restaurante Reserva Pinheiros está prevista, mas ainda não possui data oficial confirmada. Enquanto isso, o Restaurante Reserva Rooftop (Jardim das Perdizes) funciona normalmente.',
  },
  {
    topic: 'areas_mesas_camarotes_diferenca',
    category: 'reserva',
    answer:
      'O Restaurante Reserva Pinheiros conta com duas áreas para reserva: Deck (mesas ao ar livre, até 24 pessoas por turno) e Salão (ambiente interno com mesas, sofás e banquetas no bar, até 118 pessoas por turno).',
  },
  {
    topic: 'como_funciona_reserva',
    category: 'reserva',
    answer:
      'Para reservar no Restaurante Reserva Pinheiros (assim que a data de inauguração estiver aberta), informe data, horário, quantidade de pessoas e se prefere Deck ou Salão.',
  },
  {
    topic: 'cardapio',
    category: 'cardapio',
    answer:
      'O cardápio do Restaurante Reserva Pinheiros ainda está em finalização e será baseado no menu do Reserva Rooftop Perdizes (https://www.agilizaiapp.com.br/cardapio/reserva-rooftop), podendo ter ajustes.',
  },
  {
    topic: 'regras_bolo',
    category: 'geral',
    answer:
      'No Restaurante Reserva Pinheiros é permitida a entrada de bolo de até 2 kg e decoração simples e minimalista de mesa (como balões ou pequeno arranjo de flores). Não é permitida a entrada de docinhos.',
  },
  {
    topic: 'estacionamento',
    category: 'geral',
    answer:
      'Na unidade Reserva Pinheiros há serviço de valet operado pelo prédio, sem vínculo direto com o restaurante.',
  },
  {
    topic: 'area_kids',
    category: 'geral',
    answer:
      'O Restaurante Reserva Pinheiros não possui espaço kids.',
  },
  {
    topic: 'dress_code',
    category: 'geral',
    answer:
      'O dress code no Reserva Pinheiros é casual elegante. Evite chinelos, trajes esportivos e bermudas rasgadas.',
  },
  {
    topic: 'dias_horarios_funcionamento',
    category: 'geral',
    answer:
      'Os horários de funcionamento do Restaurante Reserva Pinheiros variam conforme o dia da semana; confirme a disponibilidade e a previsão de abertura para a data desejada.',
  },
  {
    topic: 'beneficios_aniversario',
    category: 'reserva',
    answer:
      'Comemoramos aniversários com condições especiais mediante reserva. Informe a data, o horário e a quantidade de convidados para orientarmos o benefício vigente na unidade.',
  },
  {
    topic: 'musica',
    category: 'geral',
    answer:
      'A programação musical varia conforme o dia e a operação da unidade. Informe a data desejada para alinharmos os detalhes.',
  },
  {
    topic: 'pet',
    category: 'geral',
    answer:
      'Para confirmar a política de pets na data da visita ao Reserva Pinheiros, consulte nossa equipe ao informar o ambiente desejado.',
  },
];

module.exports = {
  RESERVA_ROOFTOP_ESTABLISHMENT_ID,
  RESERVA_PINHEIROS_ESTABLISHMENT_ID,
  RESERVA_ROOFTOP_FAQS,
  RESERVA_PINHEIROS_FAQS,
};
