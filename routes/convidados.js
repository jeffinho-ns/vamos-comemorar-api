const express = require('express');
const router = express.Router();
const pool = require('../config/database'); // ou onde estiver sua conexão MySQL
const auth = require('../middleware/auth'); // se quiser proteger com JWT
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');


// Configurar o multer para uploads
const upload = multer({ dest: 'uploads/' });



// Adicionar convidado
router.post('/', auth, async (req, res) => {
    const { eventId, nomes } = req.body;

    const adicionado_por = req.user.id;
    
    if (!eventId || !Array.isArray(nomes) || nomes.length === 0) {
      return res.status(400).json({ message: 'Dados inválidos' });
    }
    
    const values = nomes.map((nome) => [eventId, nome, null, 'Geral', adicionado_por]);
  
    try {
      const placeholders = values.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const flatValues = values.flat();
  
      const query = `
        INSERT INTO convidados (event_id, nome, documento, lista, adicionado_por)
        VALUES ${placeholders}
      `;
  
      await pool.query(query, flatValues);
      res.status(201).json({ message: 'Convidados adicionados com sucesso!' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Erro ao adicionar convidados.' });
    }
  });
  

// Listar convidados por evento
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
    res.status(500).json({ message: 'Erro ao buscar convidados' });
  }
});

// (Opcional) Deletar convidado
router.delete('/:id', auth, async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM convidados WHERE id = ?', [id]);
    res.json({ message: 'Convidado removido com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erro ao remover convidado' });
  }
});

// Atualizar dados de um convidado
router.put('/:id', auth, async (req, res) => {
    const { id } = req.params;
    const { nome, documento, lista } = req.body;
  
    try {
      await pool.query(
        'UPDATE convidados SET nome = ?, documento = ?, lista = ? WHERE id = ?',
        [nome, documento, lista, id]
      );
      res.json({ message: 'Convidado atualizado com sucesso' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Erro ao atualizar convidado' });
    }
  });

  // Buscar convidados de um evento com filtro por nome
router.get('/search/:event_id', auth, async (req, res) => {
    const { event_id } = req.params;
    const { nome } = req.query;
  
    try {
      const [result] = await pool.query(
        'SELECT * FROM convidados WHERE event_id = ? AND nome LIKE ?',
        [event_id, `%${nome}%`]
      );
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Erro ao buscar convidados' });
    }
  });

  router.get('/contagem/:event_id', auth, async (req, res) => {
    const { event_id } = req.params;
  
    try {
      const [result] = await pool.query(`
        SELECT lista, COUNT(*) as total 
        FROM convidados 
        WHERE event_id = ? 
        GROUP BY lista
      `, [event_id]);
  
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Erro ao contar convidados por lista' });
    }
  });


  // Upload de CSV para adicionar convidados
router.post('/importar/:event_id', auth, upload.single('arquivo'), async (req, res) => {
    const { event_id } = req.params;
    const adicionado_por = req.user.id; // assumindo que o middleware auth insere o usuário em req.user
    const convidados = [];
  
    try {
      const filePath = path.resolve(req.file.path);
  
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          // Espera-se colunas: nome, documento, lista
          if (row.nome) {
            convidados.push([
              event_id,
              row.nome,
              row.documento || null,
              row.lista || 'Geral',
              adicionado_por
            ]);
          }
        })
        .on('end', async () => {
          if (convidados.length === 0) {
            return res.status(400).json({ message: 'Arquivo vazio ou inválido.' });
          }
  
          try {
            await pool.query(`
              INSERT INTO convidados (event_id, nome, documento, lista, adicionado_por) 
              VALUES ?
            `, [convidados]);
  
            fs.unlinkSync(filePath); // deletar arquivo temporário
            res.json({ message: 'Convidados importados com sucesso.' });
          } catch (err) {
            console.error('Erro ao salvar convidados:', err);
            res.status(500).json({ message: 'Erro ao salvar convidados.' });
          }
        });
  
    } catch (err) {
      console.error('Erro no upload:', err);
      res.status(500).json({ message: 'Erro no processamento do arquivo.' });
    }
  });

  // Exportar convidados de um evento
router.get('/exportar/:event_id', auth, async (req, res) => {
    const { event_id } = req.params;
  
    try {
      const [rows] = await pool.query(`
        SELECT nome, documento, lista
        FROM convidados
        WHERE event_id = ?
      `, [event_id]);
  
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Nenhum convidado encontrado para esse evento.' });
      }
  
      const json2csv = new Parser({ fields: ['nome', 'documento', 'lista'] });
      const csvData = json2csv.parse(rows);
  
      res.header('Content-Type', 'text/csv');
      res.attachment(`convidados_evento_${event_id}.csv`);
      return res.send(csvData);
    } catch (error) {
      console.error('Erro ao exportar convidados:', error);
      res.status(500).json({ message: 'Erro ao exportar convidados.' });
    }
  });
  
  
  

module.exports = router;
