'use strict';

function num(valor) {
  if (valor == null || valor === '' || Number.isNaN(Number(valor))) return null;
  return Number(valor);
}

function avaliarConfig(cfg, capturedAt) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const hora = capturedAt ? new Date(capturedAt).getHours() : 12;
  const itens = [];
  const add = (id, titulo, valor, estado) => itens.push({ id, titulo, valor, estado });

  add('ia', 'IA no WhatsApp', c.iaWhatsappLigada == null ? 'não lido' : (c.iaWhatsappLigada ? 'Ligada' : 'Desligada'),
    c.iaWhatsappLigada == null ? 'y' : (c.iaWhatsappLigada ? 'g' : ((hora >= 9 && hora <= 21) ? 'r' : 'y')));

  const regras = num(c.regrasChars);
  add('regras', 'Regras da IA', regras == null ? (c.regrasExcedem ? 'acima de 1.500' : 'não lido') : `${regras} caracteres`,
    (regras != null && regras > 1500) || c.regrasExcedem ? 'r' : (regras == null ? 'y' : 'g'));

  const intervalos = Array.isArray(c.followUpIntervalos) ? c.followUpIntervalos : [];
  add('followup', 'Follow-up automático', c.followUpLigado == null ? 'não lido' : (c.followUpLigado ? `Ligado • ${intervalos.length} intervalos` : 'Desligado'),
    c.followUpLigado == null ? 'y' : (c.followUpLigado ? (intervalos.length >= 2 ? 'g' : 'y') : 'y'));

  const humanos = [c.humanoGrupoGrande, c.humanoSemMesas, c.humanoForaPrazo];
  const ligados = humanos.filter((item) => item === true).length;
  add('humano', 'Chamar humano', humanos.every((item) => item == null) ? 'não lido' : `${ligados} de 3 ligados`,
    humanos.every((item) => item == null) ? 'y' : (ligados === 3 ? 'g' : (ligados > 0 ? 'y' : 'r')));

  const sac = c.sac || {};
  const travados = num(sac.ativosMais24h);
  add('travados', 'Atendimentos travados há mais de 24 h', travados == null ? 'não lido' : String(travados),
    travados == null ? 'y' : (travados === 0 ? 'g' : (travados <= 5 ? 'y' : 'r')));

  const pesos = { ia: 3, regras: 2, followup: 2, humano: 2, travados: 2 };
  let ponto = 0;
  let max = 0;
  let lidos = 0;
  itens.forEach((item) => {
    if (/^não lido/i.test(item.valor)) return;
    const peso = pesos[item.id] || 1;
    max += peso;
    lidos += 1;
    ponto += peso * (item.estado === 'g' ? 1 : (item.estado === 'y' ? 0.5 : 0));
  });
  const nota = max ? Math.round((ponto / max) * 100) : null;
  const faixa = nota == null ? null : (lidos < 5 ? 'Provisória' : (nota >= 80 ? 'Bom' : (nota >= 50 ? 'Atenção' : 'Crítico')));
  return { nota, faixa, lidos, total: itens.length, itens };
}

module.exports = { avaliarConfig };
