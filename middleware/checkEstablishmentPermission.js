/**
 * Middleware para verificar permissões de estabelecimento
 * 
 * Uso:
 * router.get('/endpoint', auth, checkEstablishmentPermission('can_edit_os', 'establishment_id'), handler);
 * 
 * O middleware espera que req.body ou req.query contenha establishment_id
 */

module.exports = (permissionName, establishmentIdSource = 'body') => {
  return async (req, res, next) => {
    try {
      const pool = req.app.get('pool');
      const userId = req.user.id;
      
      // Obter establishment_id da fonte especificada
      let establishmentId;
      if (establishmentIdSource === 'body') {
        establishmentId = req.body.establishment_id;
      } else if (establishmentIdSource === 'query') {
        establishmentId = req.query.establishment_id;
      } else if (establishmentIdSource === 'params') {
        establishmentId = req.params.establishment_id;
      } else if (typeof establishmentIdSource === 'function') {
        establishmentId = establishmentIdSource(req);
      }
      
      if (!establishmentId) {
        return res.status(400).json({
          success: false,
          error: 'establishment_id é obrigatório'
        });
      }
      
      // Se o usuário é admin, permitir acesso total
      if (req.user.role === 'admin' || req.user.role === 'Administrador') {
        return next();
      }

      // analista.mkt03@ideiaum.com.br: acesso apenas ao estabelecimento Pracinha do Seu Justino (id 8)
      const userEmail = (req.user.email || req.user.userEmail || '').trim().toLowerCase();
      const role = (req.user.role || '').toLowerCase();
      if (userEmail === 'analista.mkt03@ideiaum.com.br' && (role === 'promoter' || role === 'promoter-list')) {
        if (Number(establishmentId) !== 8) {
          return res.status(403).json({
            success: false,
            error: 'Acesso negado: você tem acesso apenas ao estabelecimento Pracinha do Seu Justino',
            establishment_id: establishmentId
          });
        }
        return next();
      }
      
      // Buscar permissão do usuário para este estabelecimento
      const query = `
        SELECT ${permissionName}, is_active
        FROM user_establishment_permissions
        WHERE user_id = $1 
          AND establishment_id = $2 
          AND is_active = TRUE
      `;
      
      const result = await pool.query(query, [userId, establishmentId]);
      
      if (result.rows.length === 0) {
        // Se não tem permissão específica, negar acesso
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: você não tem permissão para este estabelecimento',
          permission: permissionName,
          establishment_id: establishmentId
        });
      }
      
      const permission = result.rows[0];
      
      if (!permission[permissionName]) {
        return res.status(403).json({
          success: false,
          error: `Acesso negado: você não tem permissão para ${permissionName}`,
          permission: permissionName,
          establishment_id: establishmentId
        });
      }
      
      // Adicionar informações de permissão ao request para uso posterior
      req.establishmentPermission = permission;
      
      next();
    } catch (error) {
      console.error('❌ Erro ao verificar permissão:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao verificar permissão',
        details: error.message
      });
    }
  };
};

/**
 * Middleware para verificar se o usuário tem acesso a um estabelecimento
 * (sem verificar permissão específica, apenas se tem acesso)
 */
module.exports.checkEstablishmentAccess = async (req, res, next) => {
  try {
    const pool = req.app.get('pool');
    const userId = req.user.id;
    
    // Obter establishment_id de várias fontes possíveis
    const establishmentId = req.body.establishment_id || 
                           req.query.establishment_id || 
                           req.params.establishment_id;
    
    if (!establishmentId) {
      return res.status(400).json({
        success: false,
        error: 'establishment_id é obrigatório'
      });
    }
    
    // Se o usuário é admin, permitir acesso total
    if (req.user.role === 'admin' || req.user.role === 'Administrador') {
      return next();
    }

    const userEmail = (req.user.email || req.user.userEmail || '').trim().toLowerCase();
    const role = (req.user.role || '').toLowerCase();
    if (userEmail === 'analista.mkt03@ideiaum.com.br' && (role === 'promoter' || role === 'promoter-list')) {
      if (Number(establishmentId) !== 8) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: você tem acesso apenas ao estabelecimento Pracinha do Seu Justino',
          establishment_id: establishmentId
        });
      }
      return next();
    }
    
    // Verificar se o usuário tem acesso a este estabelecimento
    const query = `
      SELECT id, is_active
      FROM user_establishment_permissions
      WHERE user_id = $1 
        AND establishment_id = $2 
        AND is_active = TRUE
    `;
    
    const result = await pool.query(query, [userId, establishmentId]);
    
    if (result.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado: você não tem acesso a este estabelecimento',
        establishment_id: establishmentId
      });
    }
    
    next();
  } catch (error) {
    console.error('❌ Erro ao verificar acesso ao estabelecimento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao verificar acesso',
      details: error.message
    });
  }
};

