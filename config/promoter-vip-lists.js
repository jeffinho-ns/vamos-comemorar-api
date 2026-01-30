/**
 * Configuração de listas VIP por promoter
 * 
 * Para cada promoter, define uma lista de nomes que devem ter check-in VIP automático
 * Os nomes são comparados de forma case-insensitive e com normalização de espaços
 */

/**
 * Lista de configurações VIP por promoter
 * 
 * Para adicionar novos nomes à lista VIP da promoter rafacolelho@highlinebar.com.br,
 * basta adicionar os nomes no array vipNames abaixo.
 */
const promoterVIPLists = [
  {
    promoterEmail: 'rafacolelho@highlinebar.com.br',
    vipNames: [
      // Adicione aqui os nomes que devem ter check-in VIP automático
      // Exemplo:
      // 'João Silva',
      // 'Maria Santos',
    ]
  }
  // Adicione outras promoters e suas listas VIP aqui
];

/**
 * Normaliza um nome para comparação (remove espaços extras, converte para minúsculas)
 * @param {string} name Nome a ser normalizado
 * @returns {string} Nome normalizado
 */
function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Verifica se um nome está na lista VIP de uma promoter específica
 * 
 * @param {string} promoterEmail Email da promoter
 * @param {string} guestName Nome do convidado
 * @returns {boolean} true se o nome está na lista VIP, false caso contrário
 */
function isNameInVIPList(promoterEmail, guestName) {
  if (!promoterEmail || !guestName) return false;
  
  const config = promoterVIPLists.find(c => 
    normalizeName(c.promoterEmail) === normalizeName(promoterEmail)
  );
  
  if (!config || !config.vipNames || config.vipNames.length === 0) {
    return false;
  }
  
  const normalizedGuestName = normalizeName(guestName);
  
  // Verificar se algum nome da lista VIP corresponde (case-insensitive)
  return config.vipNames.some(vipName => {
    const normalizedVIPName = normalizeName(vipName);
    // Comparação exata (case-insensitive)
    return normalizedGuestName === normalizedVIPName;
  });
}

/**
 * Obtém a lista VIP de uma promoter específica
 * 
 * @param {string} promoterEmail Email da promoter
 * @returns {string[]} Array de nomes VIP ou array vazio se não encontrado
 */
function getVIPListForPromoter(promoterEmail) {
  if (!promoterEmail) return [];
  
  const config = promoterVIPLists.find(c => 
    normalizeName(c.promoterEmail) === normalizeName(promoterEmail)
  );
  
  return config?.vipNames || [];
}

module.exports = {
  promoterVIPLists,
  isNameInVIPList,
  getVIPListForPromoter,
  normalizeName
};
