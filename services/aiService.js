const OpenAI = require('openai');

const systemPrompt = 'Você é o assistente do projeto Vamos Comemorar. Sua função é ler a mensagem do cliente e retornar um JSON com: { "intent": string, "params": object }. As intenções podem ser: "fazer_reserva", "ver_disponibilidade", "duvida_geral" ou "falar_com_humano".';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function interpretMessage(messageText) {
  if (!messageText || typeof messageText !== 'string') {
    throw new Error('messageText deve ser uma string não vazia.');
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não definida no ambiente.');
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Mensagem do cliente: ${messageText}`,
      },
    ],
    temperature: 0.2,
  });

  const content = completion?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Resposta vazia da OpenAI.');
  }

  return JSON.parse(content);
}

module.exports = {
  interpretMessage,
};
