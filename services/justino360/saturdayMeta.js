'use strict';

/** Degraus da planilha de meta de sábado. O mais alto atingido vale. */
const TIERS = [
  { key: '60', label: 'Manter padrão', trigger: 60000, top5Total: 400, rafflesPerSector: 0 },
  { key: '75', label: 'Bater 75 mil', trigger: 75000, top5Total: 400, rafflesPerSector: 0 },
  { key: '86', label: 'Bater 86 mil', trigger: 86000, top5Total: 250, rafflesPerSector: 3 },
  { key: '94', label: 'Bater 94 mil', trigger: 94600, top5Total: 250, rafflesPerSector: 4 },
  { key: '104', label: '100 mil reforçado', trigger: 104600, top5Total: 500, rafflesPerSector: 4 },
];

const INDIVIDUAL_BASE = 8000;
const INDIVIDUAL_STEP = 2500;
const INDIVIDUAL_BONUS = 50;
const RAFFLE_VALUE = 100;
const SECTORS = ['Salão', 'Bar', 'Caixa', 'Cozinha'];
const MANAGER_BONUS = 150;
const FLOOR_LEAD_BONUS = 50;

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function individualBonus(amount) {
  const sale = Number(amount) || 0;
  if (sale < INDIVIDUAL_BASE) return 0;
  const extra = Math.floor((sale - INDIVIDUAL_BASE) / INDIVIDUAL_STEP);
  return INDIVIDUAL_BONUS + extra * INDIVIDUAL_BONUS;
}

function reachedTier(revenue) {
  const value = Number(revenue) || 0;
  let current = null;
  for (const tier of TIERS) {
    if (value >= tier.trigger) current = tier;
  }
  return current;
}

function rankSales(sales) {
  return [...sales]
    .map((row) => ({
      id: row.id,
      waiter_name: row.waiter_name,
      waiter_code: row.waiter_code || null,
      amount: money(row.amount),
      service_fee: money(row.service_fee),
      people_count: row.people_count == null || row.people_count === '' ? null : Number(row.people_count),
    }))
    .sort((a, b) => b.amount - a.amount || a.waiter_name.localeCompare(b.waiter_name))
    .map((row, index) => ({ ...row, position: index + 1 }));
}

function bonusForDay({ revenue, sales }) {
  const ranked = rankSales(sales || []);
  const tier = reachedTier(revenue);
  const top5 = ranked.slice(0, 5);
  const eachTop = tier ? money(tier.top5Total / 5) : 0;
  const rafflePot = tier ? money(tier.rafflesPerSector * SECTORS.length * RAFFLE_VALUE) : 0;
  const winners = ranked.map((row) => {
    const inTop = Boolean(tier) && row.position <= 5;
    const individual = tier ? individualBonus(row.amount) : 0;
    const ranking = inTop ? eachTop : 0;
    return {
      ...row,
      in_top5: inTop,
      hit_individual: row.amount >= INDIVIDUAL_BASE,
      bonus_ranking: ranking,
      bonus_individual: individual,
      bonus_total: money(ranking + individual),
    };
  });
  const rankingCost = money(winners.reduce((sum, row) => sum + row.bonus_ranking, 0));
  const individualCost = money(winners.reduce((sum, row) => sum + row.bonus_individual, 0));
  const leadership = tier
    ? { gerente: MANAGER_BONUS, chefe_fila: FLOOR_LEAD_BONUS }
    : { gerente: 0, chefe_fila: 0 };
  return {
    tier: tier
      ? { key: tier.key, label: tier.label, trigger: tier.trigger }
      : null,
    top5,
    winners,
    raffle: {
      sectors: SECTORS,
      per_sector: tier ? tier.rafflesPerSector : 0,
      value: RAFFLE_VALUE,
      pot: rafflePot,
    },
    leadership,
    cost: {
      ranking: rankingCost,
      individual: individualCost,
      raffle: rafflePot,
      leadership: money(leadership.gerente + leadership.chefe_fila),
      sheet_total: money(rankingCost + rafflePot),
      full_total: money(rankingCost + individualCost + rafflePot + leadership.gerente + leadership.chefe_fila),
    },
  };
}

function consolidate(days) {
  const map = new Map();
  for (const day of days) {
    for (const sale of day.sales || []) {
      const code = String(sale.waiter_code || sale.waiter_name).trim().toLowerCase();
      const current = map.get(code) || {
        waiter_name: sale.waiter_name,
        waiter_code: sale.waiter_code || null,
        total: 0,
        appearances: 0,
        best_position: null,
        wins: 0,
      };
      current.total = money(current.total + Number(sale.amount));
      current.appearances += 1;
      if (sale.position === 1) current.wins += 1;
      if (current.best_position == null || sale.position < current.best_position) {
        current.best_position = sale.position;
      }
      if (sale.waiter_name.length > current.waiter_name.length) current.waiter_name = sale.waiter_name;
      map.set(code, current);
    }
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      average: row.appearances ? money(row.total / row.appearances) : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

module.exports = {
  TIERS,
  bonusForDay,
  rankSales,
  consolidate,
  individualBonus,
};
