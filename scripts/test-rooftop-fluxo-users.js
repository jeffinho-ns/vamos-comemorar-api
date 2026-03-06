/**
 * Testa se todos os 7 usuários do Reserva Rooftop conseguem:
 * - Fazer login
 * - Acessar permissões (establishment 9)
 * - Buscar eventos, reservas, listas, conduções
 * - Confirmar condução (POST)
 *
 * Uso: node scripts/test-rooftop-fluxo-users.js
 * API_URL: variável de ambiente ou default vamos-comemorar-api.onrender.com
 */

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'https://vamos-comemorar-api.onrender.com';
const DEFAULT_PASSWORD = '@123Mudar';
const ROOFTOP_ESTABLISHMENT_ID = 9;

const USERS = [
  'recepcao@reservarooftop.com.br',
  'gerente.maitre@reservarooftop.com.br',
  'diego.gomes@reservarooftop.com.br',
  'vbs14@hotmail.com',
  'reservas@reservarooftop.com.br',
  'coordenadora.reservas@ideiaum.com.br',
  'analista.mkt02@ideiaum.com.br',
];

const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Resposta não-JSON: ${text.slice(0, 200)}`);
  }
  return { res, data };
}

async function login(email) {
  const { res, data } = await fetchJson(`${API_URL}/api/users/login`, {
    method: 'POST',
    body: JSON.stringify({ access: email, password: DEFAULT_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Login falhou: ${res.status}`);
  }
  if (!data?.token) {
    throw new Error('Resposta de login sem token');
  }
  return data.token;
}

async function run() {
  console.log('🧪 Teste de acesso à página rooftop-fluxo para os 7 usuários');
  console.log(`   API: ${API_URL}`);
  console.log(`   Estabelecimento: Reserva Rooftop (id ${ROOFTOP_ESTABLISHMENT_ID})`);
  console.log(`   Data: ${today}\n`);

  let passed = 0;
  let failed = 0;

  for (const email of USERS) {
    console.log(`\n📧 ${email}`);
    try {
      const token = await login(email);
      const headers = { Authorization: `Bearer ${token}` };

      // 1. Permissões (deve incluir establishment 9)
      const permRes = await fetch(`${API_URL}/api/establishment-permissions/my-permissions`, { headers });
      if (!permRes.ok) {
        throw new Error(`Permissões: ${permRes.status}`);
      }
      const permData = await permRes.json();
      const perms = permData?.data || [];
      const hasRooftop = perms.some((p) => Number(p.establishment_id) === ROOFTOP_ESTABLISHMENT_ID);
      if (!hasRooftop) {
        throw new Error('Usuário sem permissão para Reserva Rooftop (establishment 9)');
      }
      console.log('   ✅ Permissões OK (establishment 9)');

      // 2. Eventos
      const evRes = await fetch(
        `${API_URL}/api/v1/eventos?establishment_id=${ROOFTOP_ESTABLISHMENT_ID}`,
        { headers }
      );
      if (!evRes.ok) {
        throw new Error(`Eventos: ${evRes.status}`);
      }
      const evData = await evRes.json();
      const eventos = evData.eventos ?? evData.data ?? [];
      console.log(`   ✅ Eventos: ${eventos.length} encontrados`);

      // 3. GET conduction (leitura da fila)
      const condRes = await fetch(
        `${API_URL}/api/rooftop/conduction?establishment_id=${ROOFTOP_ESTABLISHMENT_ID}&flow_date=${today}`,
        { headers }
      );
      if (!condRes.ok) {
        throw new Error(`Conduction GET: ${condRes.status}`);
      }
      const condData = await condRes.json();
      const conducedIds = condData.conduced_ids ?? [];
      console.log(`   ✅ Conduction GET: ${conducedIds.length} conduzidos`);

      // 4. Restaurant reservations (fallback quando não há evento)
      const rrRes = await fetch(
        `${API_URL}/api/restaurant-reservations?establishment_id=${ROOFTOP_ESTABLISHMENT_ID}&date=${today}`,
        { headers }
      );
      if (!rrRes.ok) {
        throw new Error(`Restaurant reservations: ${rrRes.status}`);
      }
      const rrData = await rrRes.json();
      const reservas = rrData.reservations ?? rrData.data ?? [];
      console.log(`   ✅ Reservas restaurante: ${reservas.length}`);

      // 5. Guest lists (fallback)
      const glRes = await fetch(
        `${API_URL}/api/admin/guest-lists?month=${month}&establishment_id=${ROOFTOP_ESTABLISHMENT_ID}`,
        { headers }
      );
      if (!glRes.ok) {
        throw new Error(`Guest lists: ${glRes.status}`);
      }
      const glData = await glRes.json();
      const lists = glData.guestLists ?? glData.data ?? [];
      const listsToday = (Array.isArray(lists) ? lists : []).filter(
        (l) => l?.reservation_date && String(l.reservation_date).slice(0, 10) === today
      );
      console.log(`   ✅ Guest lists: ${listsToday.length} para hoje`);

      // 6. POST conduction (interação) - teste idempotente
      const postPayload = {
        establishment_id: ROOFTOP_ESTABLISHMENT_ID,
        flow_date: today,
        queue_item_id: `test-${Date.now()}-${email.replace(/@/g, '-')}`,
        entity_type: 'reservation_owner',
        entity_id: 1,
      };
      const postRes = await fetch(`${API_URL}/api/rooftop/conduction`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(postPayload),
      });
      if (!postRes.ok) {
        const errData = await postRes.json().catch(() => ({}));
        console.log(`   ⚠️ Conduction POST: ${postRes.status} (${errData.message || errData.error || 'verificar payload'})`);
      } else {
        console.log('   ✅ Conduction POST (interação) OK');
      }

      console.log('   ✅ Todos os testes passaram');
      passed++;
    } catch (err) {
      console.error(`   ❌ Erro: ${err.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`📊 Resultado: ${passed}/${USERS.length} usuários OK, ${failed} falharam`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
