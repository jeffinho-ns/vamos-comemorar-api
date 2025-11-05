/*
  Popula as mesas do Highline em PRODUÇÃO via API HTTP.
  Mapeamento: Rooftop -> area_id 5, Deck -> area_id 2
*/

const BASE_URL = 'https://vamos-comemorar-api.onrender.com';

const groups = [
  { area_id: 5, nums: ['50','51','52','53','54','55'], capacity: 2, table_type: 'baixa', desc: 'Mesa baixa 2 lugares - Rooftop' },
  { area_id: 5, nums: ['70','71','72','73'], capacity: 2, table_type: 'alta', desc: 'Mesa alta (bistrô) 2 lugares - Rooftop' },
  { area_id: 5, nums: ['44','45','46','47'], capacity: 6, table_type: 'centro', desc: 'Mesa centro 6 lugares - Rooftop' },
  { area_id: 5, nums: ['60','61','62','63','64','65'], capacity: 10, table_type: 'ao_redor', desc: 'Mesa ao redor 10 lugares - Rooftop' },
  { area_id: 5, nums: ['40','41','42'], capacity: 8, table_type: 'vista', desc: 'Mesa com vista 8 lugares - Rooftop' },
  { area_id: 2, nums: ['01','02','03','04'], capacity: 8, table_type: 'oito', desc: 'Mesa 8 lugares - Deck' },
  { area_id: 2, nums: ['05','06','07','08'], capacity: 2, table_type: 'frente', desc: 'Mesa frente 2 lugares - Deck' },
  { area_id: 2, nums: ['09','10','11','12'], capacity: 6, table_type: 'seis', desc: 'Mesa 6 lugares - Deck' },
  { area_id: 2, nums: ['15','16','17'], capacity: 3, table_type: 'frente_bar', desc: 'Mesa frente do bar 3 lugares - Deck' },
];

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} - ${text}`);
  }
  return res.json();
}

async function seed() {
  for (const g of groups) {
    for (const num of g.nums) {
      try {
        const payload = {
          area_id: g.area_id,
          table_number: String(num),
          capacity: g.capacity,
          table_type: g.table_type,
          description: g.desc,
          is_active: 1,
        };
        const json = await postJson(`${BASE_URL}/api/restaurant-tables`, payload);
        console.log('OK', g.area_id, num, json?.table?.id ?? '');
      } catch (e) {
        // Se já existir, apenas loga e continua
        console.warn('WARN', g.area_id, num, e.message);
      }
    }
  }
}

seed().catch(err => {
  console.error('Falha ao semear mesas:', err);
  process.exit(1);
});



























