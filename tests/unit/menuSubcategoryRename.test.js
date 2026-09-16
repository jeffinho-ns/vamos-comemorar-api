const test = require('node:test');
const assert = require('node:assert');

const {
    findSubcategoryRef,
    renameSubcategory,
} = require('../../services/menuSubcategoryService');

/**
 * Fake db que responde por padrão de SQL e grava as queries executadas.
 * Reproduz o comportamento do node-pg: colunas sem quotes voltam em minúsculas.
 */
function createDb({ ref, duplicateCount = 0, updatedRows = 0, hasOrderColumn = true }) {
    const queries = [];
    return {
        queries,
        async query(sql, params = []) {
            queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });

            if (/FROM menu_items WHERE id = \$1/.test(sql)) {
                return { rows: ref ? [ref] : [] };
            }
            if (/information_schema\.columns/.test(sql)) {
                return { rows: hasOrderColumn ? [{ '?column?': 1 }] : [] };
            }
            if (/SELECT COUNT\(\*\)/.test(sql)) {
                return { rows: [{ count: String(duplicateCount) }] };
            }
            if (/UPDATE menu_items SET subcategory =/.test(sql)) {
                return { rowCount: updatedRows, rows: [] };
            }
            if (/UPDATE menu_items SET subcategory_order =/.test(sql)) {
                return { rowCount: updatedRows, rows: [] };
            }
            throw new Error(`Query não esperada no teste: ${sql}`);
        },
    };
}

const REF_ROW = {
    id: '1278',
    subcategory: 'chá das 9',
    categoryid: '9',
    barid: '1',
};

test('findSubcategoryRef lê as colunas minúsculas devolvidas pelo Postgres', async () => {
    const db = createDb({ ref: REF_ROW });
    const ref = await findSubcategoryRef(db, 1278);

    assert.deepStrictEqual(ref, {
        id: 1278,
        name: 'chá das 9',
        categoryId: '9',
        barId: '1',
    });
});

test('findSubcategoryRef devolve null quando o id não existe', async () => {
    const db = createDb({ ref: null });
    assert.strictEqual(await findSubcategoryRef(db, 999999), null);
});

test('renomear mantém os itens: um único UPDATE atinge todos eles', async () => {
    const db = createDb({ ref: REF_ROW, updatedRows: 10 });
    const ref = await findSubcategoryRef(db, 1278);

    const result = await renameSubcategory(db, ref, { newName: 'Chá' });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.name, 'Chá');
    assert.strictEqual(result.previousName, 'chá das 9');
    assert.strictEqual(result.updatedItems, 10);

    const update = db.queries.find((q) => /UPDATE menu_items SET subcategory = \$1/.test(q.sql));
    assert.ok(update, 'deve executar o UPDATE de rename');
    // Regressão: antes os parâmetros vinham undefined (row.subCategory) e o UPDATE não pegava nenhuma linha.
    assert.deepStrictEqual(update.params, ['Chá', 'chá das 9', '9', '1']);
    assert.ok(!update.params.includes(undefined), 'nenhum parâmetro pode ser undefined');
});

test('renomear com espaços extras no nome antigo ainda encontra os itens', async () => {
    const db = createDb({ ref: { ...REF_ROW, subcategory: '  Chá das 9  ' }, updatedRows: 10 });
    const ref = await findSubcategoryRef(db, 1278);

    const result = await renameSubcategory(db, ref, { newName: 'Chá' });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.previousName, 'Chá das 9');
});

test('renomear recusa nome vazio', async () => {
    const db = createDb({ ref: REF_ROW });
    const ref = await findSubcategoryRef(db, 1278);

    const result = await renameSubcategory(db, ref, { newName: '   ' });
    assert.deepStrictEqual(result, { ok: false, code: 'INVALID_NAME' });
});

test('renomear recusa nome já usado por outra subcategoria da mesma categoria', async () => {
    const db = createDb({ ref: REF_ROW, duplicateCount: 3, updatedRows: 10 });
    const ref = await findSubcategoryRef(db, 1278);

    const result = await renameSubcategory(db, ref, { newName: 'Chá' });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'DUPLICATE_NAME');
    assert.ok(
        !db.queries.some((q) => /UPDATE menu_items SET subcategory = \$1/.test(q.sql)),
        'não deve renomear quando há conflito',
    );
});

test('só ajustar caixa do nome não cai na checagem de duplicidade', async () => {
    const db = createDb({ ref: REF_ROW, duplicateCount: 1, updatedRows: 10 });
    const ref = await findSubcategoryRef(db, 1278);

    const result = await renameSubcategory(db, ref, { newName: 'Chá das 9' });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.updatedItems, 10);
});

test('order fornecida atualiza subcategory_order de todos os itens', async () => {
    const db = createDb({ ref: REF_ROW, updatedRows: 10 });
    const ref = await findSubcategoryRef(db, 1278);

    await renameSubcategory(db, ref, { newName: 'Chá', order: 2 });

    const orderUpdate = db.queries.find((q) =>
        /UPDATE menu_items SET subcategory_order = \$1/.test(q.sql),
    );
    assert.ok(orderUpdate, 'deve atualizar subcategory_order');
    assert.deepStrictEqual(orderUpdate.params, [2, 'Chá', '9', '1']);
});

test('base sem coluna subcategory_order não quebra o rename', async () => {
    const db = createDb({ ref: REF_ROW, updatedRows: 10, hasOrderColumn: false });
    const ref = await findSubcategoryRef(db, 1278);

    const result = await renameSubcategory(db, ref, { newName: 'Chá', order: 2 });

    assert.strictEqual(result.ok, true);
    assert.ok(
        !db.queries.some((q) => /SET subcategory_order/.test(q.sql)),
        'não deve tentar atualizar coluna inexistente',
    );
});
