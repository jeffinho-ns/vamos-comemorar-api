const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

const operationalDetailsRoutes = require('../../routes/operationalDetails');

/**
 * Dados de dois estabelecimentos na mesma data: era esse cenário que fazia a
 * página do Reserva Rooftop (places.id 9) exibir o evento do Pracinha (id 8).
 */
const ROWS = [
    {
        id: 44,
        establishment_id: 1,
        establishment_name: 'Seu Justino',
        event_date: new Date('2026-09-17T00:00:00.000Z'),
        event_name: 'PAGODE DE QUINTAL',
        artist_fee: 3000,
        updated_at: new Date('2026-09-10T00:00:00.000Z'),
        is_active: true,
    },
    {
        id: 45,
        establishment_id: 8,
        establishment_name: 'Pracinha do Seu Justino',
        event_date: new Date('2026-09-17T00:00:00.000Z'),
        event_name: 'ISSO AQUI É BRASIL',
        artist_fee: 2500,
        updated_at: new Date('2026-09-09T00:00:00.000Z'),
        is_active: true,
    },
];

/** Pool falso: aplica o filtro de establishment_id como o Postgres faria. */
function createPool() {
    return {
        async query(sql, params = []) {
            const filtersByEstablishment = /od\.establishment_id = \$\d/.test(sql);
            const establishmentId = filtersByEstablishment ? params[params.length - 1] : null;

            let rows = ROWS.filter((row) => row.is_active);
            if (establishmentId !== null) {
                rows = rows.filter((row) => row.establishment_id === Number(establishmentId));
            }

            if (/LIMIT 1/.test(sql)) {
                rows = [...rows].sort((a, b) => b.updated_at - a.updated_at).slice(0, 1);
            }
            return { rows };
        },
    };
}

async function startServer() {
    const app = express();
    app.use('/api/v1/operational-details', operationalDetailsRoutes(createPool()));

    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();

    return {
        url: (path) => `http://127.0.0.1:${port}/api/v1/operational-details${path}`,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
}

test('evento do dia é o do estabelecimento pedido, não o de outra casa', async () => {
    const server = await startServer();
    try {
        const response = await fetch(server.url('/date/2026-09-17?establishment_id=8'));
        const payload = await response.json();

        assert.strictEqual(response.status, 200);
        assert.strictEqual(payload.data.establishment_id, 8);
        assert.strictEqual(payload.data.event_name, 'ISSO AQUI É BRASIL');
    } finally {
        await server.close();
    }
});

test('estabelecimento sem evento na data recebe 404 em vez do evento de outro', async () => {
    const server = await startServer();
    try {
        const response = await fetch(server.url('/date/2026-09-17?establishment_id=9'));

        assert.strictEqual(response.status, 404);
    } finally {
        await server.close();
    }
});

test('anônimo não recebe campos financeiros e a data vem em YYYY-MM-DD', async () => {
    const server = await startServer();
    try {
        const response = await fetch(server.url('/date/2026-09-17?establishment_id=1'));
        const payload = await response.json();

        assert.strictEqual(payload.data.event_date, '2026-09-17');
        assert.ok(!('artist_fee' in payload.data), 'cachê não pode vazar para anônimo');
    } finally {
        await server.close();
    }
});

test('establishment_id inválido é recusado com 400', async () => {
    const server = await startServer();
    try {
        const response = await fetch(server.url('/date/2026-09-17?establishment_id=abc'));

        assert.strictEqual(response.status, 400);
    } finally {
        await server.close();
    }
});

test('sem establishment_id mantém o comportamento legado (evento mais recente)', async () => {
    const server = await startServer();
    try {
        const response = await fetch(server.url('/date/2026-09-17'));
        const payload = await response.json();

        assert.strictEqual(response.status, 200);
        assert.strictEqual(payload.data.establishment_id, 1);
    } finally {
        await server.close();
    }
});

test('upcoming agrupa por establishment_id e mantém todos os eventos da data', async () => {
    const server = await startServer();
    try {
        const response = await fetch(server.url('/upcoming?days=30'));
        const payload = await response.json();

        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(Object.keys(payload.data).sort(), ['1', '8']);
        assert.strictEqual(payload.data['8'][0].event_date, '2026-09-17');
        assert.strictEqual(payload.total, 2);
    } finally {
        await server.close();
    }
});

test('upcoming filtrado por estabelecimento sem eventos devolve grupo vazio', async () => {
    const server = await startServer();
    try {
        const response = await fetch(server.url('/upcoming?days=30&establishment_id=9'));
        const payload = await response.json();

        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(payload.data, {});
    } finally {
        await server.close();
    }
});
