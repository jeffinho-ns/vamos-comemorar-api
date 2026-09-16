/**
 * Subcategorias do cardápio não têm tabela própria: são o valor de `menu_items.subcategory`.
 * O "id" da subcategoria é o MIN(menu_items.id) que a representa (ver GET /cardapio/subcategories).
 *
 * Atenção: o Postgres devolve colunas criadas sem quotes em minúsculas
 * (`subcategory`, `categoryid`, `barid`) — ler `row.subCategory` retorna undefined.
 */

/** Busca o item de referência da subcategoria. Retorna null se o id não existir. */
async function findSubcategoryRef(db, refId) {
    const result = await db.query(
        'SELECT id, subcategory, categoryid, barid FROM menu_items WHERE id = $1',
        [refId],
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
        id: Number(row.id),
        name: String(row.subcategory || '').trim(),
        categoryId: row.categoryid,
        barId: row.barid,
    };
}

async function hasSubcategoryOrderColumn(db) {
    try {
        const result = await db.query(
            `SELECT 1 FROM information_schema.columns
              WHERE table_name = 'menu_items' AND column_name = 'subcategory_order'`,
        );
        return result.rows.length > 0;
    } catch (_) {
        return false;
    }
}

/**
 * Renomeia a subcategoria em todos os itens dela (os itens permanecem na subcategoria,
 * só o nome muda). Inclui itens na lixeira para que não voltem com o nome antigo.
 *
 * @returns {{ ok: boolean, code?: string, name?: string, previousName?: string,
 *             updatedItems?: number, conflictName?: string }}
 */
async function renameSubcategory(db, ref, { newName, order } = {}) {
    const name = String(newName || '').trim();
    if (!name) return { ok: false, code: 'INVALID_NAME' };
    if (!ref || !ref.name) return { ok: false, code: 'REF_WITHOUT_SUBCATEGORY' };

    const isSameName = ref.name.toLowerCase() === name.toLowerCase();

    if (!isSameName) {
        const duplicate = await db.query(
            `SELECT COUNT(*) AS count FROM menu_items
              WHERE LOWER(TRIM(subcategory)) = LOWER($1)
                AND categoryid = $2
                AND barid = $3`,
            [name, ref.categoryId, ref.barId],
        );
        if (parseInt(duplicate.rows[0].count, 10) > 0) {
            return { ok: false, code: 'DUPLICATE_NAME', conflictName: name };
        }
    }

    const updated = await db.query(
        `UPDATE menu_items SET subcategory = $1
          WHERE LOWER(TRIM(subcategory)) = LOWER($2)
            AND categoryid = $3
            AND barid = $4`,
        [name, ref.name, ref.categoryId, ref.barId],
    );

    const orderValue = Number.isFinite(Number(order)) && order !== null && order !== undefined
        ? parseInt(String(order), 10)
        : null;

    if (orderValue !== null && (await hasSubcategoryOrderColumn(db))) {
        await db.query(
            `UPDATE menu_items SET subcategory_order = $1
              WHERE LOWER(TRIM(subcategory)) = LOWER($2)
                AND categoryid = $3
                AND barid = $4`,
            [orderValue, name, ref.categoryId, ref.barId],
        );
    }

    return {
        ok: true,
        name,
        previousName: ref.name,
        updatedItems: updated.rowCount || 0,
    };
}

module.exports = { findSubcategoryRef, renameSubcategory };
