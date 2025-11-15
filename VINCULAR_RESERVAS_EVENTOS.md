# 🔗 Vinculação de Reservas a Eventos

## 📋 Resumo

Implementada vinculação automática de reservas de restaurante a eventos, garantindo que a página de check-ins exiba apenas as reservas corretas para cada evento.

## 🎯 Problema Resolvido

Anteriormente, a página de check-ins exibia reservas de todos os estabelecimentos quando havia múltiplos eventos no mesmo dia. Agora cada evento mostra apenas suas próprias reservas vinculadas.

## 🔧 Mudanças Implementadas

### 1. Banco de Dados (`migrations/add_evento_id_to_reservations.sql`)

Adicionada coluna `evento_id` nas tabelas:
- `restaurant_reservations`
- `large_reservations`

```sql
ALTER TABLE restaurant_reservations 
ADD COLUMN evento_id INT NULL DEFAULT NULL COMMENT 'ID do evento ao qual esta reserva está vinculada',
ADD INDEX idx_evento_id (evento_id);

ALTER TABLE large_reservations 
ADD COLUMN evento_id INT NULL DEFAULT NULL COMMENT 'ID do evento ao qual esta reserva está vinculada',
ADD INDEX idx_evento_id (evento_id);
```

### 2. Backend (`controllers/EventosController.js`)

#### 2.1. Vinculação Automática

No endpoint `getCheckinsConsolidados`, adicionada vinculação automática de reservas não vinculadas:

```javascript
// Vincular automaticamente reservas de restaurante não vinculadas a este evento
// quando têm o mesmo establishment_id e data_evento
if (eventoInfo.establishment_id && eventoInfo.data_evento) {
  await this.pool.execute(`
    UPDATE restaurant_reservations 
    SET evento_id = ? 
    WHERE establishment_id = ? 
    AND DATE(reservation_date) = DATE(?)
    AND evento_id IS NULL
  `, [eventoId, eventoInfo.establishment_id, eventoInfo.data_evento]);
}
```

#### 2.2. Filtro por Evento

Atualizada query de busca de guest lists para filtrar por `evento_id`:

```javascript
// Tenta usar filtro por evento_id, fallback para filtro tradicional se coluna não existir
WHERE rr.establishment_id = ?
AND DATE(rr.reservation_date) = DATE(?)
AND (rr.evento_id = ? OR rr.evento_id IS NULL)
```

### 3. Front-end (`app/admin/eventos/[id]/check-ins/page.tsx`)

Simplificado o código para usar diretamente os dados retornados pelo backend:

```javascript
// O backend agora vincula automaticamente reservas ao evento e retorna os dados corretos
setGuestListsRestaurante(data.dados.guestListsRestaurante || []);
```

## 🚀 Como Executar

### 1. Executar Migração

Execute o script SQL no banco de dados:

```bash
mysql -u usuario -p nome_banco < migrations/add_evento_id_to_reservations.sql
```

Ou via MySQL Workbench/phpMyAdmin:
- Abra o arquivo `migrations/add_evento_id_to_reservations.sql`
- Execute o script

### 2. Testar

1. Acesse um evento: `/admin/eventos/29/check-ins` (Seu Justino)
2. Verifique se aparecem apenas as reservas do Seu Justino
3. Acesse outro evento: `/admin/eventos/28/check-ins` (Highline)
4. Verifique se aparecem apenas as reservas do Highline

## ✅ Resultado Esperado

- ✅ Cada evento mostra apenas suas próprias reservas
- ✅ Reservas são vinculadas automaticamente na primeira visualização
- ✅ Sistema funciona mesmo sem a coluna `evento_id` (fallback implementado)
- ✅ Compatível com eventos sem vinculação explícita

## 🔄 Próximos Passos (Opcional)

Para implementar vinculação manual na interface:

1. Adicionar campo de seleção de evento no modal de Nova Reserva
2. Adicionar botão "Vincular a Evento" no modal de Detalhes da Reserva
3. Listar eventos disponíveis para o estabelecimento na data selecionada

## 📝 Notas

- A coluna `evento_id` é opcional (pode ser NULL)
- Vinculação automática ocorre apenas para reservas não vinculadas (`evento_id IS NULL`)
- Sistema tem fallback para funcionar sem a coluna `evento_id` (compatibilidade retroativa)
- Vinculação é baseada em `establishment_id` + `data_evento` iguais






