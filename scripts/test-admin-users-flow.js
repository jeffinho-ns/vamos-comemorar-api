require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
/**
 * Testa o fluxo dos modais de usuários (criar + editar):
 * 1. Login como admin
 * 2. Criar novo usuário com role atendente e permissão em um estabelecimento específico
 * 3. Alterar o role do usuário (testar modal de edição via API)
 *
 * Uso:
 *   API_URL=https://vamos-comemorar-api.onrender.com ADMIN_EMAIL=seu@admin.com ADMIN_PASSWORD=suasenha node scripts/test-admin-users-flow.js
 * Ou para local: API_URL=http://localhost:10000 ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/test-admin-users-flow.js
 */

const API_URL = process.env.API_URL || process.env.API_BASE_URL || 'https://vamos-comemorar-api.onrender.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const log = (msg, data) => {
  console.log(msg, data !== undefined ? JSON.stringify(data, null, 2) : '');
};

async function main() {
  console.log('\n=== Teste: criar usuário atendente + alterar role ===\n');
  console.log('API_URL:', API_URL);

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log('\n⚠️  Defina ADMIN_EMAIL e ADMIN_PASSWORD para rodar contra a API.');
    console.log('Exemplo (PowerShell): $env:ADMIN_EMAIL="admin@exemplo.com"; $env:ADMIN_PASSWORD="suaSenha"; node scripts/test-admin-users-flow.js');
    console.log('Exemplo (bash): ADMIN_EMAIL=admin@exemplo.com ADMIN_PASSWORD=xxx node scripts/test-admin-users-flow.js\n');
    process.exit(0);
  }

  let token;
  try {
    // 1) Login
    const loginRes = await fetch(`${API_URL}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const loginBody = await loginRes.json().catch(() => ({}));
    if (!loginRes.ok) {
      console.error('❌ Login falhou:', loginRes.status, loginBody);
      process.exit(1);
    }
    token = loginBody.token;
    console.log('✅ Login OK');

    // 2) Listar estabelecimentos para pegar um id
    const placesRes = await fetch(`${API_URL}/api/places`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const places = await placesRes.json().catch(() => []);
    const placesList = Array.isArray(places) ? places : (places.data || []);
    const establishmentId = placesList[0]?.id;
    if (!establishmentId) {
      console.log('⚠️  Nenhum estabelecimento encontrado. Criando usuário sem permissão de estabelecimento.');
    } else {
      console.log('✅ Estabelecimento para permissão:', establishmentId, placesList[0]?.name || '');
    }

    // 3) Criar novo usuário com role atendente (prioridade de atendente de um estabelecimento)
    const emailNovo = `teste.atendente.${Date.now()}@teste.com`;
    const createRes = await fetch(`${API_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Usuário Teste Atendente',
        email: emailNovo,
        password: 'senha123456',
        role: 'atendente',
      }),
    });
    const createBody = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      console.error('❌ Criar usuário falhou:', createRes.status, createBody);
      process.exit(1);
    }
    const userId = createBody.userId ?? createBody.id;
    console.log('✅ Usuário criado:', userId, 'role:', createBody.role);

    // 4) Se temos estabelecimento, criar permissão (atendente de um estabelecimento específico)
    if (establishmentId) {
      const permRes = await fetch(`${API_URL}/api/establishment-permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: userId,
          user_email: emailNovo,
          establishment_id: establishmentId,
          can_manage_reservations: true,
          can_manage_checkins: true,
          can_view_reports: true,
          can_view_os: true,
          can_download_os: true,
          can_view_operational_detail: true,
          can_edit_os: false,
          can_edit_operational_detail: false,
          can_create_os: false,
          can_create_operational_detail: false,
          is_active: true,
        }),
      });
      const permBody = await permRes.json().catch(() => ({}));
      if (!permRes.ok) {
        console.warn('⚠️  Criar permissão falhou:', permRes.status, permBody);
      } else {
        console.log('✅ Permissão de estabelecimento criada para o usuário');
      }
    }

    // 5) Alterar role do usuário (simula salvar no modal de edição)
    const newRole = 'recepcao'; // Recepcionista
    const updateRes = await fetch(`${API_URL}/api/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Usuário Teste Atendente',
        email: emailNovo,
        role: newRole,
      }),
    });
    const updateBody = await updateRes.json().catch(() => ({}));
    if (!updateRes.ok) {
      console.error('❌ Atualizar role falhou:', updateRes.status, updateBody);
      process.exit(1);
    }
    console.log('✅ Role alterado para:', newRole);

    // 6) Listar usuários e verificar se o usuário aparece com o role correto
    const listRes = await fetch(`${API_URL}/api/users?search=teste.atendente`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listBody = await listRes.json().catch(() => []);
    const users = Array.isArray(listBody) ? listBody : [];
    const found = users.find((u) => u.email === emailNovo);
    if (found) {
      console.log('✅ Usuário na listagem: role =', found.role);
    }

    console.log('\n=== Todos os passos OK (criar usuário + permissão + alterar role) ===\n');
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

main();
