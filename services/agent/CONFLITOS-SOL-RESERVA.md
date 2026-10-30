# Conflitos da Sol — reserva no WhatsApp

Lista para continuar em outro computador. Testes de 29/10/2026 no número central. A direção de cada item é proposta: confirmar ou mudar antes de implementar.

Já no `master` e fora desta lista:

- `90f682e` — sexta com horário e pessoas já confirma a data; o dia da reserva não vira nascimento.
- `497f2e6` — no Pracinha, Balcão e Praça são áreas válidas; o oi não sai duplicado.
- `8c58561` — a frase do WhatsApp é da Sol, e a grade de horários só entra se essa frase não sair.

30 conflitos ainda abertos. Os marcados como bloqueiam impedem a reserva de fechar.

## Casa

1. **Comparar duas casas.** “Dúvida entre o Pracinha e o Seu Justino.” O nome mais longo trava a conversa numa casa só. Direção: se citar duas casas, perguntar qual delas antes de falar programação ou reserva. Bloqueia.
2. **Trocar de casa no meio.** Começou no Pracinha e depois diz “na verdade no Highline”. O lock da primeira casa continua. Direção: troca explícita solta o lock e zera data, horário, pessoas e área. Bloqueia.
3. **“No Pracinha” no número central.** Se o perfil operacional regride, a conversa cai no Apê e a sexta volta a parecer fechada. Direção: Pracinha de reserva é sempre a casa 8. Apê não recebe reserva de mesa.
4. **Central e número da casa.** A mesma pessoa fala nos dois. São conversas separadas. Direção: cada número segue só a casa daquele canal. Não cruzar o funil.

## Data e horário

5. **“Sexta” sozinha.** Sem horário e sem pessoas, ainda pede para confirmar o dia. Direção: se a próxima sexta é única, aceitar e perguntar só o horário.
6. **Mudar o dia.** “Na verdade sábado”, com a sexta já salva. A data antiga não é substituída. Direção: dia novo explícito substitui o anterior e a vaga é consultada de novo. Bloqueia.
7. **“15/09” sem ano.** Depois de pedir o nascimento, pode virar a data da reserva do ano corrente. Direção: se a pergunta anterior foi nascimento, tratar como nascimento e pedir o ano. Bloqueia.
8. **“Umas 19”.** Sem “h” ou “:” o horário não grava. Direção: hora solta entre 12 e 23, logo depois da pergunta de horário, vale como HH:00.
9. **Trocar o horário.** “Muda para 21h”, com 19h já salvo. O primeiro horário fica preso. Direção: horário novo substitui o antigo e a vaga é checada outra vez. Bloqueia.
10. **Fora da janela.** “14h” na sexta do Pracinha, que abre às 17h. A conversa segue e a criação só falha no fim. Direção: recusar na hora, dizer a janela real e pedir outro horário. Bloqueia.
11. **Dia fechado.** Terça no Pracinha. A Sol pode falar a casa e só no fechamento dizer que está fechado. Direção: terça no Pracinha é fechado. Oferecer quarta ou sexta, sem criar. Bloqueia.

## Pessoas e área

12. **“Somos em 7”.** Sem a palavra “pessoas” o número não entra. Direção: número logo depois da pergunta de pessoas conta como o tamanho do grupo.
13. **Grupo grande.** “Somos 70.” A Sol tenta uma reserva normal. Direção: acima de 60, uma frase e handoff. Sem pré-reserva. Bloqueia.
14. **Nome proibido no Highline.** Terraço, Balcão ou Área VIP apagam a frase inteira. Direção: trocar só o nome inválido pela área válida, sem apagar horário e pessoas. Bloqueia.
15. **“Qual área combina?” no Highline.** “Sexta às 21h, 6 pessoas.” A resposta lista a grade ou ignora o horário. Direção: uma sugestão com vaga nesse horário e uma pergunta. Sem grade.
16. **Lounge ou quintal no Justino.** O cliente não escolheu coberta ou descoberta, e a frase pode ser bloqueada. Direção: com o cliente, só coberta ou descoberta. Lounge e quintal ficam no painel.
17. **Sinônimo no Pracinha.** “Quero o salão” ou “a parte de cima” não vira Balcão nem Praça. Direção: salão ou interno é Balcão. Praça ou externo é Praça. Apê não é mesa.
18. **Vaga na conversa, erro na criação.** A consulta diz que tem vaga e o criar devolve fechado ou sem mesa. Direção: a frase de vaga só sai se a mesma regra da criação confirmar. Bloqueia.

## Identidade

19. **Só a idade.** “Tenho 39 anos” não vira nascimento e a reserva não fecha. Direção: pedir dia, mês e ano numa frase. Idade sozinha não basta.
20. **Nascimento já salvo no contato.** Se for uma data de adulto, entra sem confirmar e pode ser a data errada. Direção: confirmar essa data em uma frase antes de criar. Bloqueia.
21. **Aniversário de outra pessoa.** “É o aniversário da minha namorada.” A Sol pede o nascimento dela. Direção: o nascimento é de quem reserva. A ocasião vai na observação.
22. **“Sim” ambíguo.** Um sim solto vira aniversário mesmo quando era de outra coisa. Direção: “sim” só vira aniversário se a última pergunta foi exatamente essa.

## Fechamento

23. **Área vazia ou “padrão”.** A Sol chama criar assim e a mesa sai no lugar errado. Direção: sem Balcão ou Praça no Pracinha, e sem coberta ou descoberta no Justino, não criar. Bloqueia.
24. **“Reserva confirmada” antes da ferramenta.** O filtro troca a frase e o cliente não vê o que falta. Direção: a frase bloqueada vira a próxima pergunta real: nome, e-mail ou nascimento. Bloqueia.
25. **Erro genérico na criação.** Duplicata, mesa ocupada ou validação vira “me diz o que falta”, sem o motivo. Direção: repetir o motivo em uma frase e fazer só a pergunta que destrava.
26. **Alterar depois de criada.** “Passa para 8 pessoas” cria uma segunda reserva. Direção: depois de criada, alterar ou chamar a equipe. Nunca um novo criar. Bloqueia.

## Tom

27. **Lista ou grade.** A resposta vem em bullets, markdown ou grade de horários. Direção: se vier lista, reescrever em uma ou duas frases antes de enviar.
28. **Expediente.** Segunda a sexta, das 8h às 17h, quem escreve é a Terra. Direção: decidir se a frase final, mesmo de dia, fica com a Sol.
29. **Timeout de 25 segundos.** A prosa da Sol estoura e cai na Terra ou no texto pronto, e a grade volta. Direção: se a prosa falhar, uma frase curta com o horário já dito. Sem lista de janelas.
30. **Três perguntas juntas.** Faltam horário, pessoas e área ao mesmo tempo. Direção: uma pergunta por turno, na ordem horário, pessoas, área, nome, e-mail, nascimento.
