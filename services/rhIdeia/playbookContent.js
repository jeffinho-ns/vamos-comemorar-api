'use strict';

const { PLAYBOOK_ROLES } = require('./playbookRoles');

function text(lines) {
  return lines.filter(Boolean).join('\n\n');
}

const COMMON = [
  {
    slug: 'bem-vindo',
    part: 'parte_1',
    title: 'Bem-vindo e como usar este manual',
    sort: 10,
    body: text([
      'Bem-vindo ao Seu Justino. Este manual existe para ninguém precisar adivinhar o que fazer.',
      'Leia a Parte 1 e a Parte 2 por inteiro. A página da sua função e o checklist do seu setor ficam no sistema, só para o seu cargo.',
      'Caixa verde é o jeito certo. Caixa vermelha é o que nunca se faz. Faixa marrom é regra da casa: não mude por conta própria.',
      'Na dúvida, pergunte ao seu líder. Perguntar nunca é erro. Errar calado, sim.',
      'Salão responde ao Chefe de Fila. Cozinha responde ao Chefe de Cozinha. Bar responde ao Chefe de Bar. Portaria, caixa, limpeza e apoio respondem ao Gerente. Se o líder não estiver, responde o Gerente. Se o Gerente não estiver, responde o Chefe de Fila.',
    ]),
  },
  {
    slug: 'historia',
    part: 'parte_1',
    title: 'A nossa história',
    sort: 20,
    body: text([
      'Em 2004 um grupo de amigos teve a ideia de abrir um bar. Nasceu o Seu Justino, na Rua Santa Justina, 674.',
      'A casa cresceu, fechou o primeiro endereço por excesso de público e, em 2012, reabriu na Rua Harmonia, 77, na Vila Madalena.',
      'Dois ambientes: o salão principal e os lounges, e o pomar no meio da cidade, com jabuticabeira, caquizeiro, mangueira e tangerineira.',
      'Versão curta para o cliente: o Seu Justino nasceu em 2004, de amigos que se reuniam para jogar sinuca. Em 2012 reabriu na Vila Madalena, com o salão e o quintal. A decoração é feita de coisas antigas que a casa foi juntando.',
      'O cliente não vem só pela cerveja. Quem sabe contar de onde a casa veio atende diferente de quem só anota pedido.',
    ]),
  },
  {
    slug: 'valores',
    part: 'parte_1',
    title: 'Missão, visão e valores',
    sort: 30,
    body: text([
      'Missão: receber cada pessoa como se recebe um amigo em casa. Comida boa, bebida gelada, música de verdade e gente que atende com prazer.',
      'Visão: ser o bar que as pessoas escolhem sempre, pela música, pela cozinha e, principalmente, pelo atendimento.',
      'Os sete valores: simpatia de verdade, limpo sempre, agilidade, honestidade, respeito, time e cuidar de quem cuida.',
      'A casa se compromete com escala justa, folga respeitada, intervalo de verdade e cobrança em particular. Ambiente pesado e brincadeira que humilha não combinam com este lugar. Se algo assim estiver acontecendo, fale com o Gerente.',
    ]),
  },
  {
    slug: 'horarios',
    part: 'parte_1',
    title: 'Horários, couvert e cartão',
    sort: 40,
    body: text([
      'Segunda a casa fecha. Terça e quarta abrem 18h e fecham 1h. O quadro completo da semana está neste capítulo e é o que se responde no telefone, no WhatsApp e na porta.',
      'Sábado abre 14h e fecha 5h. Domingo abre 12h e fecha 21h, com feijoada em buffet até as 17h.',
      'Couvert artístico de terça a quinta: R$ 20 por pessoa. Domingo: R$ 30 por pessoa.',
      'Taxa de serviço: 13% sobre o consumo. O cliente pode pedir para retirar.',
      'Cartão de consumo é individual. Perdeu o cartão: cobra-se o valor real localizado no Zig, sem multa.',
      'No limite de lotação a portaria fecha a entrada e libera uma pessoa para cada uma que sai. O limite do dia é o que o Gerente passou no alinhamento.',
      'Menor entra só com o responsável legal, com termo assinado, até as 23h, e nunca bebe álcool.',
    ]),
  },
  {
    slug: 'regras',
    part: 'parte_2',
    title: 'Regras que valem para todos',
    sort: 50,
    body: text([
      'Uniforme: polo da casa, calça marrom, avental e sapato fechado antiderrapante.',
      'Lave as mãos ao chegar, depois do banheiro, antes de tocar em alimento e depois do lixo, de dinheiro, de tossir ou de recolher louça suja.',
      'Celular não entra em área de cliente. Fica no armário o turno inteiro.',
      'Cliente que chega na porta é recebido em até 30 segundos. A primeira bebida chega em até 3 minutos. Depois de servir o prato, volte em 2 minutos.',
      'Cortesia, desconto e cancelamento só o Gerente autoriza. A frase é: vou falar com o responsável e já volto.',
      'Beber em serviço, levar coisa da casa, consumir sem lançar, servir menor, deixar sair sem pagar e bater ponto por outro são faltas graves.',
      'O Regulamento Interno manda mais que este manual. Foto, gravação e rede social da casa seguem a regra da empresa: nada de publicar bastidor, cliente ou procedimento.',
    ]),
  },
  {
    slug: 'emergencia',
    part: 'parte_7',
    title: 'Contatos e emergência',
    sort: 60,
    body: text([
      'Em emergência, ligue direto, sem pedir autorização.',
      'SAMU 192: mal súbito, desmaio, queda, corte profundo, queimadura grave.',
      'Bombeiros 193: fogo, vazamento de gás, resgate, alagamento.',
      'Polícia Militar 190: briga, ameaça, furto, roubo, cliente violento.',
      'Defesa Civil 199: temporal, risco na estrutura, queda de árvore ou de fiação.',
      'Achados e perdidos vão para o Gerente, com data, local e quem achou. Documento e celular ficam separados e trancados. Nada fica com quem achou.',
    ]),
  },
  {
    slug: 'sete-dias',
    part: 'parte_7',
    title: 'Os seus 7 primeiros dias',
    sort: 70,
    body: text([
      'Ninguém começa atendendo sozinho.',
      'Dia 1: você recebe o uniforme, conhece a casa e lê as Partes 1 e 2. Assina o termo aqui no sistema.',
      'Dia 2: sombra. Você acompanha um colega do seu setor o turno inteiro, sem assumir posto.',
      'Dia 3: cardápio e cartas. Prova os principais itens e aprende o que sugerir.',
      'Dia 4: Zig na prática, antes de a casa abrir.',
      'Dia 5: meia praça acompanhada. Correção na hora, em particular.',
      'Dia 6: praça completa, com o líder observando. No fim, dez minutos de conversa.',
      'Dia 7: a prova deste manual. Nota abaixo de 14 acertos: você refaz o treino do ponto fraco.',
      'Você tem um padrinho do mesmo setor. É com ele que tira dúvida sem medo.',
    ]),
  },
  {
    slug: 'termo',
    part: 'parte_7',
    title: 'Termo de recebimento e confidencialidade',
    sort: 80,
    body: text([
      'Empregador: Vila Seu Justino Restaurante e Entretenimento Ltda. CNPJ 63.296.173/0001-19. Unidade Madalena.',
      'Documento: Manual Operacional, versão 1, agosto de 2026.',
      'Ao aceitar, você declara que leu as regras da casa, especialmente as Partes 1 e 2, recebeu orientação da sua função e do seu checklist, e sabe quem é o seu líder.',
      'Este manual complementa o Regulamento Interno e não substitui a lei, a convenção coletiva nem o contrato de trabalho.',
      'O material é interno. Você não reproduz, fotografa, publica nem entrega este conteúdo a pessoas de fora. Receitas, fichas técnicas, preços internos, procedimentos e dados de clientes ficam no trabalho.',
      'Esta obrigação não impede direito trabalhista, orientação jurídica ou sindical, nem o relato de irregularidade a canal interno ou autoridade.',
    ]),
  },
];

const ROLE_BODIES = {
  gerente: text([
    'Você responde à Direção. Respondem a você: Chefe de Fila, Chefe de Cozinha, Chefe de Bar, Caixa, Portaria, Segurança, Limpeza, Estoque e Manutenção.',
    'Antes de abrir: confere a escala, o fundo de caixa, o Zig e as maquininhas. Cobra o checklist de cada líder. Confirma atração, horário do show e o valor de entrada. Confere banheiros. Liga o som na playlist do horário. O ar só liga quando a casa precisa.',
    'Durante: circula salão, portaria, cozinha, bar e banheiro. Fala com clientes. Decide lotação, fila, cortesia e desconto. Ninguém mais decide isso. Resolve conflito em particular. Acompanha a venda no Zig e o delivery.',
    'No fechamento: fecha o caixa, recebe os checklists, confere estoque crítico e o desligamento de equipamentos, gás, luzes e portas. Sai por último. Registra público, faturamento, problemas e o que resolver amanhã.',
    'Toda semana: treino de 30 minutos, reunião de resultado com os líderes e relatório para a Direção. Ocorrência grave vai no mesmo dia.',
    'Compra: você aprova até R$ 350. Acima disso, a Direção aprova.',
    'Nunca corrija alguém na frente do cliente ou da equipe. Nunca beba com cliente. Nunca abra exceção de lotação.',
    'Nota 10: a casa roda bem nos 20 minutos em que você não está no salão, porque cada líder sabe o que fazer.',
    'Nos 7 dias de quem entra, você conduz o dia 1 e a prova do dia 7.',
  ]),
  chefe_fila: text([
    'Você responde ao Gerente. Respondem a você: Cumim, Suiteiro e Garçons. Você abre a casa.',
    'Antes de abrir: destrava acessos, roda o checklist do salão, define praças, marca reservas, confere mise en place, uniforme e higiene, e faz o alinhamento de 5 minutos.',
    'Durante: recebe o cliente que vem da portaria, controla giro e fila com a hostess, cobra venda sugestiva, resolve reclamação antes de virar problema. Cortesia e desconto só com o Gerente. Controla o suiteiro e os rádios. Assume a casa na ausência do Gerente.',
    'No fechamento: confere cada praça antes de liberar o garçom, anota quebra de louça e entrega o checklist assinado ao Gerente.',
    'Nunca libere garçom sem conferir a praça. Nunca dê cortesia por conta própria. Nunca discuta com a cozinha na frente do cliente.',
    'Nota 10: você sabe, sem olhar o sistema, quais mesas esperam comida, quais vão pedir a conta e quais precisam de mais uma rodada.',
  ]),
  chefe_cozinha: text([
    'Você responde ao Gerente. Respondem a você: Cozinheiro Líder, Cozinheiros, Auxiliares e Pia.',
    'Antes de abrir: confere mise en place e a produção do dia, temperatura de câmaras e a planilha, validade e etiqueta. Define o prato do dia e o que vender primeiro. Avisa o Chefe de Fila do que faltou no cardápio antes de abrir.',
    'Durante: comanda a saída e confere um por um. Mantém ficha técnica, peso e apresentação. Avisa o salão quando o tempo passar do normal. Quem fala com o Chefe de Fila é você, não o cozinheiro. Cuida de faca, fogo, piso, gás e EPI.',
    'No fechamento: guarda, etiqueta e resfria o que sobrou. Anota desperdício. Confere limpeza de praças, coifa, fogão, chapa, piso e pia.',
    'Nos 7 dias, você conduz o dia 3 junto com o Chefe de Bar: cardápio e cartas.',
  ]),
  chefe_bar: text([
    'Você responde ao Gerente e comanda o bar: Subchefe, Bartenders e Barbacks.',
    'Antes de abrir: confere gelo, frutas, fichas técnicas, chopeira, gás e o checklist do bar. Avisa o salão do que não vai sair.',
    'Durante: padrão de dose não muda por preferência de quem prepara. Caipirinha leva fruta de verdade. O passador sai com bandeja quente, diz o nome e o preço, lança na hora e não insiste com quem disse não.',
    'Nada volta frio para a bandeja: isso é descarte. Nada sai sem lançar no cartão.',
    'Nos 7 dias, você conduz o dia 3 junto com o Chefe de Cozinha.',
  ]),
  cumim: text([
    'Você é o assistente do Chefe de Fila. Responde a ele. Quando ele não está no salão, os garçons recorrem a você.',
    'Distribui abertura e fechamento de forma justa e acompanha quem ficou com o quê. Confere mapa de praças, reservas e a atração do dia.',
    'Atende no padrão da casa. Reclamação e emergência seguem a linha do Chefe de Fila. Cortesia e desconto continuam só com o Gerente.',
    'Nunca distribua tarefa por simpatia. Nunca passe por cima do Chefe de Fila. Nunca corrija colega na frente do cliente.',
    'Nota 10: o Chefe de Fila sai por meia hora e ninguém percebe.',
  ]),
  suiteiro: text([
    'Você fica na expedição: um na cozinha, um no bar. Responde ao Chefe de Fila.',
    'Organiza a saída: pedido junto, na ordem, sem prato de mesa diferente misturado. Confere se está completo, com acompanhamento, molho e pegador do compartilhado, e se a borda está limpa.',
    'Chama o garçom pelo rádio, pelo nome. Se não confirmar, chama de novo em 30 segundos. Prato pronto parado é prato perdido.',
    'Em movimento fraco a casa pode operar sem suiteiro: quem chama é o Chefe de Cozinha ou o Chefe de Bar, conforme a escala.',
    'Nunca libere pedido incompleto, frio ou sem conferir. Nunca chame aos gritos. Nunca entregue a quem não é da praça.',
  ]),
  garcom: text([
    'Você responde ao Chefe de Fila. Sua praça é sua até o Chefe de Fila conferir o fechamento.',
    'Receba em até 30 segundos, primeira bebida em até 3 minutos, e volte 2 minutos depois de servir o prato. Sugira bebida, sobremesa e café. Lance no Zig na hora, no cartão da pessoa. Cartão é individual.',
    'No domingo, se for o escalado, cuida do buffet da feijoada.',
    'No fechamento: recolhe louça, higieniza, desmonta aparadores, sobe cadeiras, fecha janelas e só sai depois de mostrar a praça ao Chefe de Fila.',
    'Nunca anote no papel para lançar depois. Nunca diga que não é a sua praça. Nunca discuta com o cliente. Nunca leve prato reclamado de volta sem avisar o líder.',
    'Nota 10: o cliente pede você pelo nome e a mesa não fica com copo vazio parado.',
  ]),
  hostess: text([
    'Você responde ao Gerente e trabalha a fila com o Chefe de Fila.',
    'Receba em até 30 segundos. Confira o limite de lotação que o Gerente passou. No limite, fecha a entrada e libera uma pessoa para cada uma que sai.',
    'Menor só entra com responsável legal, termo de responsabilidade assinado, até as 23h, sem bebida alcoólica.',
    'Informe a fila com honestidade. Ninguém fica sem saber quanto falta.',
  ]),
  seguranca: text([
    'Você responde ao Gerente. Cuida da entrada, da lotação e da saída.',
    'No limite, a entrada fecha. Quem fura fila é abordado com educação.',
    'Na saída, ninguém deixa a casa sem passar no caixa. Cliente que bebeu demais: pare o serviço de álcool, avise o Gerente, ofereça água, comida e transporte. Nunca confronte.',
    'Menor sem responsável ou depois das 23h não entra. O termo de responsabilidade é da entrada.',
  ]),
  caixa: text([
    'Você responde ao Gerente. Fundo de caixa, Zig e maquininhas são conferidos com ele na abertura e no fechamento.',
    'Taxa de serviço de 13%. O cliente pode pedir para retirar. Cartão perdido: valor real no Zig, sem multa.',
    'Cancelamento, cortesia e desconto só com o Gerente. Sangria e diferença ficam no fechamento, com ele.',
    'Ninguém sai sem passar no caixa. No dia 4 de quem entra, você treina o Zig junto com o líder do setor.',
  ]),
  cozinheiro_lider: text([
    'Você responde ao Chefe de Cozinha e segura a praça quando ele está na expedição ou na planilha.',
    'Confere mise en place da sua praça, ficha técnica e o tempo de saída. Avisa o Chefe de Cozinha antes de faltar item.',
    'Quem fala com o salão é o Chefe de Cozinha. Você não discute pedido na passa-prato.',
  ]),
  cozinheiro: text([
    'Você responde ao Chefe de Cozinha, e ao Cozinheiro Líder na praça.',
    'Mesma receita, mesmo peso, mesma apresentação. Etiqueta o que abrir. Temperatura e validade não são detalhe.',
    'Prato que passou do tempo: avise o Chefe de Cozinha. Não mande para o salão por conta própria.',
  ]),
  auxiliar_cozinha: text([
    'Você responde ao Chefe de Cozinha. Apoia produção, higienização e a pia.',
    'Louça suja não espera. Pano de chão não sobe para bancada. EPI em faca, forno e piso molhado.',
    'Nada sem etiqueta fica aberto na câmara.',
  ]),
  subchefe_bar: text([
    'Você responde ao Chefe de Bar e cobre a estação quando ele sai para a ronda.',
    'Gelo, fruta, dose e ficha técnica seguem o padrão. Você não muda receita e não autoriza cortesia.',
    'Cobra do barback o abastecimento antes de faltar.',
  ]),
  bartender: text([
    'Você responde ao Chefe de Bar. Dose e proporção não mudam por preferência.',
    'Caipirinha: fruta de verdade e com fartura. Sugira pela fruta, não pela cachaça.',
    'Nunca dose no olho. Nunca devolva gelo de copo ao balde. Nunca beba em serviço. Nunca entregue item sem lançar no cartão. Nunca faça cortesia por conta própria.',
    'Nota 10: o cliente atravessa o salão para pedir no seu balcão.',
  ]),
  barback: text([
    'Você responde ao Chefe de Bar e apoia todos os bartenders. Gelo nunca acaba. Essa é a regra número um.',
    'Abastece copo, taça, garrafa, suco, fruta e guarnição antes de faltar. Recolhe vidro, mantém piso seco e leva louça para a pia.',
    'Nunca deixe o bartender parar para buscar gelo. Nunca deixe caco perto do gelo. Nunca prepare drink sem autorização.',
    'Nota 10: o bartender passa a noite sem sair da estação.',
  ]),
  estoquista: text([
    'Você responde ao Gerente e atende cozinha, bar e salão.',
    'Receba conferindo nota, quantidade, peso, validade e temperatura. O que estiver errado, devolve. Armazene no PVPS: primeiro que vence, primeiro que sai. Nada sai sem registro.',
    'Cotação com pelo menos dois fornecedores. Quem aprova até R$ 350 é o Gerente. Acima disso, a Direção. Fornecedor de alimento só entra com homologação da nutricionista.',
    'Nunca receba sem conferir. Nunca libere sem registro. Nunca aceite item vencido, amassado ou fora de temperatura.',
    'Nota 10: nenhum produto acaba no meio do sábado e o inventário fecha sem surpresa.',
  ]),
  limpeza: text([
    'Você responde ao Gerente. O banheiro é ronda a cada 30 minutos: papel, sabonete, toalha, vaso, pia, espelho, cheiro e piso seco.',
    'A limpeza do filtro e da grelha do ar-condicionado é sua, com data no controle da casa. A parte técnica é da manutenção.',
    'Nunca misture produtos de limpeza. Nunca use o pano do chão em mesa ou bancada. Nunca deixe químico perto de alimento. No pico, sinalize piso molhado.',
    'Nota 10: ninguém precisa avisar que o banheiro precisa de você.',
  ]),
  manutencao: text([
    'Você responde ao Gerente e atende os setores pelo líder de cada área.',
    'Vistoria diária: elétrica, hidráulica, iluminação, gás, refrigeração e áreas comuns. Lâmpada queimada troca antes de abrir.',
    'Livro de manutenção: o que quebrou, quando, quem avisou, o que foi feito. Preventiva de coifa, exaustão, ar, chopeira, câmaras e extintores. O certificado do terceirizado fica com você, e o Gerente é avisado antes de vencer.',
    'Nunca faça gambiarra em elétrica, gás ou hidráulica. Nunca trabalhe com equipamento ligado na tomada. Nunca deixe ferramenta em área de cliente.',
  ]),
  nutricionista: text([
    'Você é a responsável técnica. Trabalha com o Gerente e o Chefe de Cozinha e orienta quem manipula alimento.',
    'Homologa fornecedor de alimento antes da primeira compra. Aponta vistoria com prazo, e o Gerente cobra o cumprimento.',
    'Ficha técnica, temperatura, etiqueta e descarte seguem o seu parecer. O salão não altera receita.',
  ]),
};

const ROLE_FLOWS = [
  {
    slug: 'fluxo-saida',
    title: 'Fluxo da saída',
    roles: ['caixa', 'seguranca', 'gerente'],
    body: text([
      'A saída passa no caixa. Segurança confere. O Gerente é quem autoriza qualquer exceção, e exceção de saída sem caixa não existe.',
      'Sangria, cancelamento e diferença fecham com o Gerente e o operador.',
    ]),
  },
  {
    slug: 'fluxo-portaria',
    title: 'Fluxo da portaria',
    roles: ['hostess', 'seguranca', 'gerente', 'chefe_fila'],
    body: text([
      'O cliente é recebido em até 30 segundos. A hostess informa a fila. A segurança sustenta o limite de lotação do dia, confirmado pelo Gerente na abertura.',
      'No limite, entra uma pessoa para cada uma que sai. O Chefe de Fila acomoda quem a portaria libera.',
    ]),
  },
  {
    slug: 'fluxo-salao',
    title: 'Fluxo do salão',
    roles: ['chefe_fila', 'cumim', 'garcom', 'suiteiro'],
    body: text([
      'Do boa-noite à conta: receber, acomodar, primeira bebida em 3 minutos, sugerir, lançar na hora, voltar 2 minutos depois do prato e só fechar a praça com o Chefe de Fila.',
      'Mise en place é antes de abrir: mesa alinhada, cardápio limpo, aparador montado, comanda e material de apoio.',
    ]),
  },
  {
    slug: 'fluxo-pedido',
    title: 'Fluxo do pedido',
    roles: ['garcom', 'suiteiro', 'cozinheiro', 'cozinheiro_lider', 'chefe_cozinha', 'bartender', 'subchefe_bar', 'chefe_bar', 'caixa'],
    body: text([
      'O pedido nasce no Zig, no cartão de quem consumiu. Cozinha e bar produzem. O suiteiro confere e chama pelo rádio. O caixa só vê a conta no fechamento.',
      'Item sem lançamento não sai. Comanda de pessoas diferentes não se junta.',
    ]),
  },
  {
    slug: 'menor',
    title: 'Entrada de menor',
    roles: ['hostess', 'seguranca', 'gerente'],
    body: text([
      'Menor entra só com o responsável legal, com o termo de responsabilidade assinado na entrada, até as 23h.',
      'Nunca bebida alcoólica. Sem termo, não entra. Quem guarda o termo é a portaria, e o Gerente responde pela casa.',
    ]),
  },
  {
    slug: 'alcada-compra',
    title: 'Alçada de compra',
    roles: ['estoquista', 'gerente'],
    body: text([
      'O líder do setor pede o que falta. O estoquista cota com dois ou mais fornecedores. O Gerente aprova até R$ 350. Acima disso, a Direção.',
      'Recebimento: estoquista com o líder do setor, conferindo nota, quantidade, peso, validade e temperatura. Alimento novo só com a nutricionista.',
    ]),
  },
];

const CHECKLISTS = {
  gerente: ['Escala do dia conferida e falta coberta', 'Fundo de caixa, Zig e maquininhas ok', 'Limite de lotação informado no alinhamento', 'Banheiros conferidos', 'Relatório do dia registrado antes de sair'],
  chefe_fila: ['Casa aberta e acessos destravados', 'Praças definidas e reservas marcadas', 'Mise en place e uniforme conferidos', 'Alinhamento de 5 minutos feito', 'Cada praça conferida antes de liberar'],
  chefe_cozinha: ['Temperaturas anotadas', 'Validade e etiqueta conferidas', 'Cardápio do dia avisado ao salão antes de abrir', 'Sobras etiquetadas e resfriadas', 'Pia e praças zeradas'],
  chefe_bar: ['Gelo, fruta e fichas técnicas conferidos', 'Chopeira e gás ok', 'O que não vai sair foi avisado ao salão', 'Bandeja do passador quente e lançada', 'Fechamento do bar entregue ao Gerente'],
  cumim: ['Tarefas de abertura distribuídas e acompanhadas', 'Mapa de praças conferido com o Chefe de Fila', 'Pendência do checklist cobrada', 'Fechamento distribuído e praças conferidas'],
  suiteiro: ['Praça de saída organizada por mesa', 'Pedido conferido antes de chamar', 'Garçom confirmou no rádio', 'Bancada limpa e seca'],
  garcom: ['Praça montada antes de abrir', 'Pedidos lançados na hora no cartão certo', 'Checagem 2 minutos depois do prato', 'Praça mostrada ao Chefe de Fila no fechamento'],
  hostess: ['Limite de lotação anotado', 'Fila informada', 'Termo de menor quando houver', 'Entrada fechada no limite'],
  seguranca: ['Acesso e lotação conferidos com o Gerente', 'Fila conduzida sem confronto', 'Saída só depois do caixa', 'Ocorrência registrada com o Gerente'],
  caixa: ['Fundo de caixa conferido na abertura', 'Taxa de 13% aplicada com opção de retirada', 'Cancelamento só com o Gerente', 'Fechamento conferido com o Gerente'],
  cozinheiro_lider: ['Mise en place da praça pronta', 'Ficha técnica à mão', 'Falta avisada antes de estourar', 'Praça limpa no fechamento'],
  cozinheiro: ['Receita, peso e apresentação no padrão', 'Item aberto etiquetado', 'Atraso avisado ao Chefe de Cozinha'],
  auxiliar_cozinha: ['Pia em dia', 'EPI em uso', 'Nada aberto sem etiqueta', 'Pano de chão separado de bancada'],
  subchefe_bar: ['Estação coberta na ausência do Chefe de Bar', 'Dose no padrão', 'Barback abasteceu antes de faltar'],
  bartender: ['Ficha técnica seguida', 'Todo item lançado no cartão', 'Gelo de copo não voltou ao balde', 'Estação limpa'],
  barback: ['Gelo não acabou', 'Copo, fruta e guarnição abastecidos', 'Piso seco e sem caco', 'Louça do bar foi para a pia'],
  estoquista: ['Recebimento conferido na nota', 'PVPS respeitado', 'Nada saiu sem registro', 'Cotação apresentada ao Gerente'],
  limpeza: ['Banheiro em ronda de 30 minutos', 'Piso molhado sinalizado', 'Químico longe de alimento', 'Material de limpeza avisado antes de acabar'],
  manutencao: ['Vistoria diária feita antes de abrir', 'Lâmpada queimada trocada', 'Livro de manutenção atualizado', 'Certificado de terceirizado dentro da validade'],
  nutricionista: ['Fornecedor de alimento homologado antes da compra', 'Apontamento de vistoria com prazo', 'Desvio de temperatura ou etiqueta comunicado ao Gerente'],
};

function roleChapters() {
  return PLAYBOOK_ROLES.map((role, index) => ({
    slug: `funcao-${role.key}`,
    part: 'parte_4',
    audience: 'role',
    visible_roles: [role.key],
    title: role.label,
    sort: 100 + index,
    body: ROLE_BODIES[role.key],
  }));
}

function flowChapters() {
  return ROLE_FLOWS.map((flow, index) => ({
    slug: flow.slug,
    part: 'parte_3',
    audience: 'role',
    visible_roles: flow.roles,
    title: flow.title,
    sort: 200 + index,
    body: flow.body,
  }));
}

function commonChapters() {
  return COMMON.map((chapter) => ({
    ...chapter,
    audience: 'common',
    visible_roles: [],
  }));
}

function allChapters() {
  return [...commonChapters(), ...roleChapters(), ...flowChapters()];
}

module.exports = {
  allChapters,
  CHECKLISTS,
};
