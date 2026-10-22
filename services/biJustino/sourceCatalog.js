/**
 * De onde o painel do Renato lê hoje, e o que a API já consegue copiar.
 * Os segredos ficam só em variável de ambiente no Render. Este arquivo não tem valor.
 */

const APPS_SCRIPT_ENV = [
  'BI_APPS_SCRIPT_URL',
  'BI_APPS_SCRIPT_EMAIL',
  'BI_APPS_SCRIPT_PASSWORD',
];

const SOURCES = [
  {
    id: 'faturamento_zig',
    label: 'Faturamento que o painel lê da planilha (Zig já lançado lá)',
    kind: 'apps_script',
    action: 'getRevenueOverview',
    env: APPS_SCRIPT_ENV,
    coletavel: true,
  },
  {
    id: 'dre_sharepoint',
    label: 'DRE no SharePoint',
    kind: 'microsoft',
    action: null,
    env: ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_DRE_SHARE_URL', 'MS_DRE_CELL_MAP'],
    coletavel: false,
  },
  {
    id: 'instagram',
    label: 'Indicadores do Instagram',
    kind: 'meta',
    action: null,
    env: ['IG_ACCESS_TOKEN', 'IG_USER_ID'],
    coletavel: false,
  },
  {
    id: 'zig_robo',
    label: 'Robô que entra na ZigPay e grava na planilha',
    kind: 'robo',
    action: null,
    env: [],
    coletavel: false,
    nota: 'As credenciais da Zig ficam no computador dele, em .seujustino/zigpay_credentials.json. Ainda não copiamos essa entrada.',
  },
  {
    id: 'reservas_agilizai',
    label: 'Reservas do Seu Justino que já estão no banco do Agilizai',
    kind: 'agilizai',
    action: null,
    env: [],
    coletavel: false,
    nota: 'Não precisa da planilha. Entra numa etapa seguinte, lendo restaurant_reservations.',
  },
];

function preenchida(env, name) {
  return Boolean(env && env[name] && String(env[name]).trim());
}

function listSources(env) {
  return SOURCES.map((source) => {
    const variaveis = source.env.map((name) => ({
      name,
      preenchida: preenchida(env, name),
    }));
    const pronto = source.env.every((name) => preenchida(env, name));
    return {
      id: source.id,
      label: source.label,
      kind: source.kind,
      action: source.action,
      coletavel: source.coletavel && pronto,
      aguardandoCredencial: source.coletavel && !pronto,
      nota: source.nota || null,
      variaveis,
    };
  });
}

function findSource(id) {
  return SOURCES.find((source) => source.id === id) || null;
}

module.exports = {
  SOURCES,
  listSources,
  findSource,
};
