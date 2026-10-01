'use strict';

function text(value) {
  return String(value == null ? '' : value).trim();
}

/**
 * Monta o endereço exibido nas telas a partir do formulário de empresa.
 * Aceita os nomes do painel (endereco, numero, bairro) e os da tabela places.
 */
function formatVenueAddress(body) {
  const source = body || {};
  const street = text(source.street || source.endereco);
  const number = text(source.number || source.numero);
  const neighborhood = text(source.neighborhood || source.bairro);
  const complement = text(source.complement || source.complemento);
  const city = text(source.city || source.cidade);
  const state = text(source.state || source.estado);
  const zipcode = text(source.zipcode || source.cep);
  const name = text(source.name || source.nome);
  const email = text(source.email);

  const streetLine = [street, number].filter(Boolean).join(', ');
  const cityLine = [city, state].filter(Boolean).join(' - ');
  const locality = [neighborhood, cityLine].filter(Boolean).join(', ');
  const formatted = [streetLine, complement, locality, zipcode].filter(Boolean).join(' - ');
  const numberInt = /^\d+$/.test(number) ? Number(number) : null;

  return {
    street,
    number,
    numberInt,
    neighborhood,
    complement,
    city,
    state,
    zipcode,
    formatted,
    name,
    email,
  };
}

module.exports = { formatVenueAddress };
