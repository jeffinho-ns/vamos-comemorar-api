# Conflitos da Sol — reserva no WhatsApp

Lista para continuar em outro computador. Testes de 29/10/2026 no número central. A direção de cada item é proposta: confirmar ou mudar antes de implementar.

Já no `master` e fora desta lista:

- `90f682e` — sexta com horário e pessoas já confirma a data; o dia da reserva não vira nascimento.
- `497f2e6` — no Pracinha, Balcão e Praça são áreas válidas; o oi não sai duplicado.
- `8c58561` — a frase do WhatsApp é da Sol, e a grade de horários só entra se essa frase não sair.

Os 30 conflitos estão no `master`. Quarta leva (tom): 27, 28, 29 e 30.

Primeira leva no `master` (parse do funil): 1, 2, 6, 8, 9 e 12.
Segunda leva (fechamento): 7, 10, 11, 13, 14, 18, 20, 23, 24 e 26.
Terceira leva (casa, área, identidade): 3, 4, 5, 15, 16, 17, 19, 21, 22 e 25.

## Casa

1. **Comparar duas casas.** Feito. Duas casas na mesma fala perguntam qual delas, sem lock.
2. **Trocar de casa no meio.** Feito. Casa nova zera data, horário, pessoas e área.
3. **“No Pracinha” no número central.** Feito. Pracinha de reserva é sempre a casa 8. Apê não recebe reserva de mesa.
4. **Central e número da casa.** Feito. O last_establishment do contato não trava a casa do outro canal.

## Data e horário

5. **“Sexta” sozinha.** Feito. A próxima sexta única confirma a data e pergunta só o horário.
6. **Mudar o dia.** Feito. Dia novo explícito substitui o anterior e a vaga é consultada de novo.
7. **“15/09” sem ano.** Feito. Depois de pedir o nascimento, pede o ano e não vira data da reserva.
8. **“Umas 19”.** Feito. Hora solta entre 12 e 23, tipo “umas 19”, grava HH:00.
9. **Trocar o horário.** Feito. Horário novo substitui o antigo e a vaga é consultada de novo.
10. **Fora da janela.** Feito. Sexta 14h no Pracinha recusa na hora e cita as 17h.
11. **Dia fechado.** Feito. Terça no Pracinha oferece quarta ou sexta, sem criar.

## Pessoas e área

12. **“Somos em 7”.** Feito. “Somos em 7” / “vamos 7” entra como tamanho do grupo.
13. **Grupo grande.** Feito. Acima de 60, uma frase e handoff. Sem pré-reserva.
14. **Nome proibido no Highline.** Feito. Troca só o nome inválido e mantém horário e pessoas.
15. **“Qual área combina?” no Highline.** Feito. Uma sugestão no horário e uma pergunta. Sem grade.
16. **Lounge ou quintal no Justino.** Feito. Com o cliente, só coberta ou descoberta.
17. **Sinônimo no Pracinha.** Feito. Salão/interno é Balcão. Praça/externo é Praça. Apê não é mesa.
18. **Vaga na conversa, erro na criação.** Feito. A frase de vaga só sai se a mesma regra da criação confirmar.

## Identidade

19. **Só a idade.** Feito. Pede dia, mês e ano. Idade sozinha não fecha.
20. **Nascimento já salvo no contato.** Feito. Confirma a data em uma frase antes de criar.
21. **Aniversário de outra pessoa.** Feito. O nascimento é de quem reserva. A ocasião vai na observação.
22. **“Sim” ambíguo.** Feito. “Sim” só vira aniversário se a última pergunta foi essa.

## Fechamento

23. **Área vazia ou “padrão”.** Feito. Sem Balcão/Praça no Pracinha ou coberta/descoberta no Justino, não cria.
24. **“Reserva confirmada” antes da ferramenta.** Feito. A frase vira a próxima pergunta real (nome, e-mail ou nascimento).
25. **Erro genérico na criação.** Feito. Repete o motivo e faz só a pergunta que destrava.
26. **Alterar depois de criada.** Feito. Depois de criada, chama a equipe. Não cria de novo.

## Tom

27. **Lista ou grade.** Feito. Lista, markdown ou grade vira uma ou duas frases antes de enviar.
28. **Expediente.** Feito. A frase final, mesmo de dia, fica com a Sol. Terra só entra se o modelo da Sol falhar por acesso/compat.
29. **Timeout de 25 segundos.** Feito. Se a prosa estourar, uma frase curta com o horário já dito. Sem Terra, sem FAQ offline e sem grade.
30. **Três perguntas juntas.** Feito. Uma pergunta por turno, na ordem horário, pessoas, área, nome, e-mail, nascimento.
