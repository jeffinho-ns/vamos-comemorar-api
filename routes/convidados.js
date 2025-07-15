const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth'); // Middleware de autenticação
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');

// Configurar o multer para uploads (usado APENAS na rota de importar CSV)
const upload = multer({ dest: 'uploads/' });

// IMPORTANTE: Antes de usar esta API, certifique-se de que sua tabela `convidados`
// no banco de dados tem as seguintes colunas (já conversamos sobre isso):
// - event_id (INT)
// - nome (VARCHAR)
// - documento (VARCHAR, nullable)
// - lista (VARCHAR) - para 'Geral', 'VIP', 'Pista', 'Camarote', etc.
// - adicionado_por (INT) - ID do promotor (quem criou a lista/entrada)
// - usuario_cliente_id (INT, nullable) - NOVO: ID do usuário (cliente) que se inscreveu
// - combos_selecionados (JSON ou TEXT, nullable) - NOVO: JSON string dos combos

// --- Rota ÚNICA e CORRETA para Adicionar Convidado/Participante ---
// Esta é a rota que o frontend do Flutter vai chamar para o cliente se inscrever
// ou para o promotor adicionar convidados.
// Não precisa de `upload.fields` aqui, pois não está recebendo arquivos diretamente.
router.post('/', auth, async (req, res) => {
  const { eventId, nome, documento, lista, promoterIdDaLista, combosSelecionados } = req.body;
  
  // O 'adicionado_por' na tabela será o ID do promotor responsável pela lista.
  // Se 'promoterIdDaLista' for fornecido (cliente se inscrevendo para um promotor), use-o.
  // Caso contrário (promotor logado adicionando para sua própria lista), use req.user.id.
  const promoterIdFinal = promoterIdDaLista || req.user.id;

  // O 'usuario_cliente_id' será o ID do usuário (cliente) logado que está fazendo a requisição.
  // Isso nos permite rastrear quem se inscreveu.
  const userIdLogado = req.user.id; 

  // Validação dos dados essenciais
  if (!eventId || !nome || !promoterIdFinal) {
    return res.status(400).json({ message: 'Dados essenciais (Evento, Nome, Promotor) são obrigatórios.' });
  }

  try {
    const query = `
      INSERT INTO convidados (event_id, nome, documento, lista, adicionado_por, usuario_cliente_id, combos_selecionados)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    await pool.query(query, [
      eventId,
      nome,
      documento || null,         // Usa o documento fornecido ou null
      lista || 'Geral',           // Usa a lista fornecida ou 'Geral' se não especificado
      promoterIdFinal,            // O ID do promotor (da lista)
      userIdLogado,               // O ID do cliente que está se adicionando
      JSON.stringify(combosSelecionados || []) // Converte o array de objetos em JSON string
    ]);

    res.status(201).json({ message: 'Convidado adicionado/participação registrada com sucesso!' });
  } catch (err) {
    console.error('Erro detalhado ao adicionar convidado:', err);
    res.status(500).json({ message: 'Erro ao adicionar convidado.' });
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
  const { nome, documento, lista, combos_selecionados } = req.body;
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
      [nome, documento, lista, JSON.stringify(combos_selecionados || []), id]
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
  const { nome, promotorId } = req.query;

  let query = 'SELECT * FROM convidados WHERE event_id = ?';
  const params = [event_id];

  if (nome) {
    query += ' AND nome LIKE ?';
    params.push(`%${nome}%`);
  }
  if (promotorId) {
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
  const { promotorId } = req.query;

  let query = `
    SELECT lista, COUNT(*) as total 
    FROM convidados 
    WHERE event_id = ?
  `;
  const params = [event_id];

  if (promotorId) {
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
  const adicionado_por = req.user.id;
  const convidados = [];

  try {
    const filePath = path.resolve(req.file.path);

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        convidados.push([
          event_id,
          row.nome,
          row.documento || null,
          row.lista || 'Geral',
          adicionado_por,
          null, // usuario_cliente_id (pois foi adicionado pelo promotor via CSV)
          JSON.stringify(row.combos ? JSON.parse(row.combos) : []),
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
  const { promotorId } = req.query;

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