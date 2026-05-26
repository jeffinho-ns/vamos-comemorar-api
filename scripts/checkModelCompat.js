#!/usr/bin/env node
/**
 * Valida compatibilidade de um modelo da OpenAI com o caminho atual do agente
 * (Chat Completions API + tool_choice forçado).
 *
 * Uso:
 *   OPENAI_API_KEY=sk-... node scripts/checkModelCompat.js gpt-5.4-mini
 *
 * O script testa 3 cenários críticos:
 *   1) chat.completions.create simples (modelo responde texto)
 *   2) chat.completions.create com tool_choice='auto' (function calling)
 *   3) chat.completions.create com tool_choice={type:'function', ...} (FORÇADO)
 *
 * Se algum passo falhar, o relatório diz exatamente o que precisa ser
 * ajustado no agentService antes de migrar o modelo padrão.
 */

require('dotenv').config();
const OpenAI = require('openai');

const MODEL = process.argv[2] || process.env.OPENAI_AGENT_MODEL || 'gpt-5.5';

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY não definida. Exporte ou ponha em .env.');
  process.exit(2);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TOOL_DEF = {
  type: 'function',
  function: {
    name: 'criar_pre_reserva',
    description: 'Cria uma pré-reserva no sistema. Use SOMENTE quando todos os dados obrigatórios foram coletados.',
    parameters: {
      type: 'object',
      properties: {
        estabelecimento_id: { type: 'integer' },
        data: { type: 'string', description: 'YYYY-MM-DD' },
        horario: { type: 'string', description: 'HH:mm' },
        quantidade_pessoas: { type: 'integer' },
        cliente_dados: {
          type: 'object',
          properties: {
            nome: { type: 'string' },
            email: { type: 'string' },
            data_nascimento: { type: 'string', description: 'YYYY-MM-DD' },
          },
          required: ['nome', 'email', 'data_nascimento'],
        },
      },
      required: ['estabelecimento_id', 'data', 'horario', 'quantidade_pessoas', 'cliente_dados'],
    },
  },
};

const SAMPLE_MESSAGES = [
  {
    role: 'system',
    content:
      'Você é uma anfitriã do Highline no WhatsApp. Tom: humano, caloroso, sem markdown. Se o cliente já passou TODOS os dados, chame criar_pre_reserva.',
  },
  {
    role: 'user',
    content:
      'Boa noite! Quero reservar pra próximo sábado, 20h, 4 pessoas no Deck. Meu nome é Pedro Silva, e-mail pedro@example.com, nasci em 12/05/1990.',
  },
];

function summarizeError(error) {
  const msg = error?.message || String(error);
  const status = error?.status || error?.response?.status;
  return `status=${status || '?'} | ${msg}`;
}

async function step1Simple() {
  process.stdout.write(`[1/3] Texto simples ... `);
  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: 'Diga "ok" em uma palavra.' }],
      temperature: 0.3,
    });
    const text = completion.choices?.[0]?.message?.content?.trim() || '';
    console.log(`✅ resposta="${text.slice(0, 60)}"`);
    return { ok: true };
  } catch (error) {
    console.log(`❌ ${summarizeError(error)}`);
    return { ok: false, error };
  }
}

async function step2ToolAuto() {
  process.stdout.write(`[2/3] tool_choice='auto' (function calling) ... `);
  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: SAMPLE_MESSAGES,
      tools: [TOOL_DEF],
      tool_choice: 'auto',
      temperature: 0.3,
    });
    const msg = completion.choices?.[0]?.message;
    const toolCall = msg?.tool_calls?.[0];
    if (!toolCall) {
      console.log(`⚠️  modelo NÃO chamou tool (gerou só texto). Texto: "${(msg?.content || '').slice(0, 80)}"`);
      return { ok: false, reason: 'no_tool_call_in_auto' };
    }
    console.log(`✅ tool=${toolCall.function?.name}`);
    return { ok: true, toolCall };
  } catch (error) {
    console.log(`❌ ${summarizeError(error)}`);
    return { ok: false, error };
  }
}

async function step3ToolForced() {
  process.stdout.write(`[3/3] tool_choice={function:criar_pre_reserva} (FORÇADO) ... `);
  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: SAMPLE_MESSAGES,
      tools: [TOOL_DEF],
      tool_choice: { type: 'function', function: { name: 'criar_pre_reserva' } },
      temperature: 0.3,
    });
    const msg = completion.choices?.[0]?.message;
    const toolCall = msg?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== 'criar_pre_reserva') {
      console.log(`⚠️  tool NÃO foi forçada. msg=${JSON.stringify(msg).slice(0, 120)}`);
      return { ok: false, reason: 'force_failed' };
    }
    let args = {};
    try {
      args = JSON.parse(toolCall.function.arguments || '{}');
    } catch (_e) {
      console.log(`❌ arguments não é JSON válido: ${toolCall.function.arguments}`);
      return { ok: false, reason: 'invalid_arguments_json' };
    }
    console.log(`✅ tool forçada com args: ${JSON.stringify(args).slice(0, 120)}...`);
    return { ok: true, args };
  } catch (error) {
    console.log(`❌ ${summarizeError(error)}`);
    return { ok: false, error };
  }
}

(async () => {
  console.log(`\n=== Validando compatibilidade do modelo: ${MODEL} ===\n`);
  const r1 = await step1Simple();
  const r2 = await step2ToolAuto();
  const r3 = await step3ToolForced();

  console.log('\n=== Veredito ===');
  // Apenas Texto Simples (1) e Tool Forçada (3) são bloqueantes — eles cobrem
  // os dois caminhos críticos do agentService. Tool em "auto" (2) pode
  // legitimamente não disparar quando o modelo julga que faltam dados; nesse
  // caso o forçado (3) ainda garante a chamada quando o estado está pronto.
  const blocking = !r1.ok || !r3.ok;
  if (!blocking) {
    console.log(`✅ ${MODEL} é COMPATÍVEL com o agentService atual.`);
    console.log('   Pode setar OPENAI_AGENT_MODEL=' + MODEL + ' no Render sem mudar código.');
    if (!r2.ok) {
      console.log(`\n💡 Observação (não-bloqueante):`);
      console.log('   No teste com tool_choice=auto, o modelo gerou texto em vez de chamar a tool.');
      console.log('   Isso geralmente significa que o modelo é mais cauteloso (positivo)');
      console.log('   ou que faltava algum dado no sample message. O agentService cobre esse');
      console.log('   caminho com forceCreatePreReservaIfReady (que usa tool_choice forçado).');
    }
    process.exit(0);
  }

  console.log(`❌ ${MODEL} NÃO é compatível com o agentService atual. Detalhes:`);
  if (!r1.ok) console.log(' - Falhou texto simples → modelo provavelmente exige Responses API.');
  if (!r3.ok) console.log(' - tool_choice forçado não funciona (precisa adaptar agentService).');
  if (!r2.ok && r3.ok && r1.ok) {
    // Não deveria entrar aqui (não é bloqueante), mas mantemos por clareza.
    console.log(' - tool_choice=auto não disparou tool (não-bloqueante).');
  }
  console.log('\nRecomendação: NÃO trocar o modelo padrão ainda.');
  process.exit(1);
})();
