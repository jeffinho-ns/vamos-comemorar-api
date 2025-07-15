const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth'); // Middleware de autenticação
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');

// Configurar o multer para uploads (usado apenas na rota de importar CSV)
const upload = multer({ dest: 'uploads/' });

// IMPORTANTE: Antes de usar esta API, certifique-se de que sua tabela `convidados`
// no banco de dados tem as seguintes colunas:
// - event_id (INT)
// - nome (VARCHAR)
// - documento (VARCHAR, nullable)
// - lista (VARCHAR) - para 'Geral', 'VIP', 'Pista', 'Camarote', etc.
// - adicionado_por (INT) - ID do promotor
// - usuario_cliente_id (INT, nullable) - NOVO: ID do usuário (cliente) que se inscreveu
// - combos_selecionados (JSON ou TEXT, nullable) - NOVO: JSON string dos combos

// --- Rota ÚNICA para Adicionar Convidado/Participante ---
// Esta rota agora é mais flexível:
// Se vier 'promoterIdDaLista', é um cliente se inscrevendo para um promotor.
// Se não vier, e o usuário for promotor, é o promotor adicionando para si.
router.post('/', upload.fields([
    { name: 'imagem_do_evento', maxCount: 1 },
    { name: 'imagem_do_combo', maxCount: 1 }
]), async (req, res) => {
    console.log('--- INICIANDO ROTA DE CRIAÇÃO DE EVENTO ---');
    try {
        // ... (obtenção de files e body) ...

        // Certifique-se que req.user.id está disponível e sendo salvo!
        const adicionadoPor = req.user.id; // <<< ESTA LINHA É CRÍTICA

        const params = [
            req.body.casa_do_evento, req.body.nome_do_evento,
            req.body.tipo_evento === 'unico' ? req.body.data_do_evento : null,
            req.body.hora_do_evento, req.body.local_do_evento, req.body.categoria, req.body.mesas, req.body.valor_da_mesa, req.body.brinde,
            req.body.numero_de_convidados, req.body.descricao, req.body.valor_da_entrada,
            imagemDoEvento, imagemDoCombo, req.body.observacao,
            req.body.tipo_evento, req.body.tipo_evento === 'semanal' ? req.body.dia_da_semana : null,
            adicionadoPor // <<< Adicione aqui o ID do usuário/promotor logado
        ];

        const query = `INSERT INTO eventos (
            casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
            local_do_evento, categoria, mesas, valor_da_mesa, brinde,
            numero_de_convidados, descricao, valor_da_entrada,
            imagem_do_evento, imagem_do_combo, observacao,
            tipo_evento, dia_da_semana, adicionado_por ) // <<< A COLUNA DEVE ESTAR AQUI
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const [result] = await pool.query(query, params);

        // ... (busca do evento recém-criado e retorno) ...
    } catch (error) {
        console.error('!!! ERRO DETALHADO AO CRIAR EVENTO !!!:', error);
        res.status(500).json({ error: 'Erro ao criar evento.' });
    }
});


// Listar todos os convidados (para uso administrativo/geral)
// Mudei para '/todos-convidados' para evitar conflito com '/:event_id'
router.get('/todos-convidados', auth, async (req, res) => {
  try {
    const [convidados] = await pool.query('SELECT * FROM convidados');
    res.json(convidados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erro ao buscar todos os convidados' });
  }
});

// Listar convidados por evento (para um promotor ver TODOS os convidados de UM evento)
router.get('/:event_id', auth, async (req, res) => {
  const { event_id } = req.params;

  try {
    const [convidados] = await pool.query(
      'SELECT * FROM convidados WHERE event_id = ?',
      [event_id]
    );
    res.json(convidados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erro ao buscar convidados por evento' });
  }
});

// Listar convidados por evento E promotor (para um promotor ver APENAS seus convidados de UM evento)
// NOVO ENDPOINT: Útil para o painel do promotor
router.get('/evento/:event_id/promotor/:promotor_id', auth, async (req, res) => {
  const { event_id, promotor_id } = req.params;
  // Opcional: verifique se req.user.id (promotor logado) corresponde a promotor_id
  // Ou se o req.user.role é 'admin' para permitir ver outros promotores
  if (req.user.id !== parseInt(promotor_id) && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Não autorizado a ver esta lista.' });
  }

  try {
    const [convidados] = await pool.query(
      'SELECT * FROM convidados WHERE event_id = ? AND adicionado_por = ?',
      [event_id, promotor_id]
    );
    res.json(convidados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erro ao buscar convidados por promotor no evento' });
  }
});


// Deletar convidado
router.delete('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id; // O usuário logado que está tentando deletar

  try {
    // Adiciona uma verificação para que apenas o promotor que adicionou (ou um admin) possa deletar
    const [convidado] = await pool.query('SELECT adicionado_por FROM convidados WHERE id = ?', [id]);
    if (convidado.length === 0) {
      return res.status(404).json({ message: 'Convidado não encontrado.' });
    }
    if (convidado[0].adicionado_por !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Você não tem permissão para remover este convidado.' });
    }

    await pool.query('DELETE FROM convidados WHERE id = ?', [id]);
    res.json({ message: 'Convidado removido com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erro ao remover convidado' });
  }
});

// Atualizar dados do convidado
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { nome, documento, lista, combos_selecionados } = req.body; // Adicionado combos_selecionados
  const userId = req.user.id;

  try {
    const [convidado] = await pool.query('SELECT adicionado_por FROM convidados WHERE id = ?', [id]);
    if (convidado.length === 0) {
      return res.status(404).json({ message: 'Convidado não encontrado.' });
    }
    if (convidado[0].adicionado_por !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Você não tem permissão para atualizar este convidado.' });
    }

    await pool.query(
      'UPDATE convidados SET nome = ?, documento = ?, lista = ?, combos_selecionados = ? WHERE id = ?',
      [nome, documento, lista, JSON.stringify(combos_selecionados || []), id] // Converte para JSON string
    );
    res.json({ message: 'Convidado atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erro ao atualizar convidado' });
  }
});

// Buscar convidados com filtro por nome
router.get('/search/:event_id', auth, async (req, res) => {
  const { event_id } = req.params;
  const { nome, promotorId } = req.query; // Adicionei promotorId para filtrar se necessário

  let query = 'SELECT * FROM convidados WHERE event_id = ?';
  const params = [event_id];

  if (nome) {
    query += ' AND nome LIKE ?';
    params.push(`%${nome}%`);
  }
  if (promotorId) { // Filtra por promotor se o ID for passado
    query += ' AND adicionado_por = ?';
    params.push(promotorId);
  }

  try {
    const [result] = await pool.query(query, params);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erro ao buscar convidados' });
  }
});

// Contagem por lista
router.get('/contagem/:event_id', auth, async (req, res) => {
  const { event_id } = req.params;
  const { promotorId } = req.query; // Adicionei promotorId para filtrar por promotor

  let query = `
    SELECT lista, COUNT(*) as total 
    FROM convidados 
    WHERE event_id = ?
  `;
  const params = [event_id];

  if (promotorId) { // Filtra por promotor se o ID for passado
    query += ' AND adicionado_por = ?';
    params.push(promotorId);
  }

  query += ' GROUP BY lista';

  try {
    const [result] = await pool.query(query, params);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erro ao contar convidados por lista' });
  }
});

// Importar CSV
router.post('/importar/:event_id', auth, upload.single('arquivo'), async (req, res) => {
  const { event_id } = req.params;
  const adicionado_por = req.user.id; // Assume que o promotor logado está importando
  const convidados = [];

  try {
    const filePath = path.resolve(req.file.path);

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // Assume que o CSV tem colunas 'nome', 'documento', 'lista', 'combos' (opcional)
        convidados.push([
          event_id,
          row.nome,
          row.documento || null,
          row.lista || 'Geral',
          adicionado_por, // Quem adicionou é o promotor logado
          null, // usuario_cliente_id (pois foi adicionado pelo promotor via CSV)
          JSON.stringify(row.combos ? JSON.parse(row.combos) : []), // Parse do JSON se existir
        ]);
      })
      .on('end', async () => {
        if (convidados.length === 0) {
          return res.status(400).json({ message: 'Arquivo CSV vazio ou inválido.' });
        }

        try {
          await pool.query(`
            INSERT INTO convidados (event_id, nome, documento, lista, adicionado_por, usuario_cliente_id, combos_selecionados) 
            VALUES ?
          `, [convidados]);

          fs.unlinkSync(filePath);
          res.json({ message: 'Convidados importados com sucesso.' });
        } catch (err) {
          console.error('Erro ao salvar convidados importados:', err);
          res.status(500).json({ message: 'Erro ao salvar convidados importados.' });
        }
      });
  } catch (err) {
    console.error('Erro no upload ou processamento do arquivo:', err);
    res.status(500).json({ message: 'Erro no processamento do arquivo.' });
  }
});

// Exportar CSV
router.get('/exportar/:event_id', auth, async (req, res) => {
  const { event_id } = req.params;
  const { promotorId } = req.query; // Para exportar apenas a lista de um promotor

  let query = `
    SELECT nome, documento, lista, combos_selecionados
    FROM convidados
    WHERE event_id = ?
  `;
  const params = [event_id];

  if (promotorId) {
    query += ' AND adicionado_por = ?';
    params.push(promotorId);
  }

  try {
    const [rows] = await pool.query(query, params);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Nenhum convidado encontrado para esse evento/promotor.' });
    }

    const fields = ['nome', 'documento', 'lista', 'combos_selecionados'];
    const json2csv = new Parser({ fields });
    const csvData = json2csv.parse(rows);

    res.header('Content-Type', 'text/csv');
    res.attachment(`convidados_evento_${event_id}${promotorId ? `_promotor_${promotorId}` : ''}.csv`);
    return res.send(csvData);
  } catch (error) {
    console.error('Erro ao exportar convidados:', error);
    res.status(500).json({ message: 'Erro ao exportar convidados.' });
  }
});

module.exports = router;