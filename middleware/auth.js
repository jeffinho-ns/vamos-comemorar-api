require('dotenv').config();
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'chave_secreta';

function auth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.log(`❌ Tentativa de acesso sem token: ${req.method} ${req.path} - IP: ${req.ip}`);
        return res.status(403).json({ 
            message: 'Token é necessário',
            error: 'MISSING_TOKEN'
        });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            console.error(`❌ Token inválido para ${req.method} ${req.path}:`, err.message);
            return res.status(403).json({ 
                message: 'Token inválido ou expirado',
                error: 'INVALID_TOKEN'
            });
        }
        
        console.log(`✅ Usuário autenticado: ${user.role} (ID: ${user.id}) para ${req.method} ${req.path}`);
        req.user = user;
        next();
    });
}

module.exports = auth;
