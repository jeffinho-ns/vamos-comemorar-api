/**
 * Middleware para registrar ações dos usuários no sistema
 * Captura informações detalhadas sobre cada ação realizada
 */

const logAction = async (pool, {
  userId,
  userName,
  userEmail,
  userRole,
  actionType,
  actionDescription,
  resourceType = null,
  resourceId = null,
  establishmentId = null,
  establishmentName = null,
  ipAddress = null,
  userAgent = null,
  requestMethod = null,
  requestUrl = null,
  status = 'success',
  additionalData = null
}) => {
  try {
    const query = `
      INSERT INTO action_logs (
        user_id, user_name, user_email, user_role,
        action_type, action_description,
        resource_type, resource_id,
        establishment_id, establishment_name,
        ip_address, user_agent,
        request_method, request_url,
        status, additional_data
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
    `;

    const values = [
      userId,
      userName,
      userEmail,
      userRole,
      actionType,
      actionDescription,
      resourceType,
      resourceId,
      establishmentId,
      establishmentName,
      ipAddress,
      userAgent,
      requestMethod,
      requestUrl,
      status,
      additionalData ? JSON.stringify(additionalData) : null
    ];

    await pool.query(query, values);
    console.log(`📝 Log registrado: ${actionType} por ${userName} (${userRole})`);
  } catch (error) {
    console.error('❌ Erro ao registrar log de ação:', error);
  }
};

/**
 * Middleware Express para logging automático
 */
const autoLogMiddleware = (pool) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      if (req.user && res.statusCode < 400) {
        let actionType = 'unknown';
        switch (req.method) {
          case 'POST':
            actionType = 'create';
            break;
          case 'PUT':
          case 'PATCH':
            actionType = 'update';
            break;
          case 'DELETE':
            actionType = 'delete';
            break;
          case 'GET':
            actionType = 'view';
            break;
        }

        const ipAddress = req.ip || req.connection?.remoteAddress;
        const userAgent = req.get('user-agent');

        setImmediate(() => {
          logAction(pool, {
            userId: req.user.id,
            userName: req.user.name || 'Usuário',
            userEmail: req.user.email,
            userRole: req.user.role,
            actionType,
            actionDescription: `${req.method} ${req.originalUrl}`,
            ipAddress,
            userAgent,
            requestMethod: req.method,
            requestUrl: req.originalUrl,
            status: 'success'
          });
        });
      }

      return originalJson(body);
    };

    next();
  };
};

module.exports = {
  logAction,
  autoLogMiddleware
};
