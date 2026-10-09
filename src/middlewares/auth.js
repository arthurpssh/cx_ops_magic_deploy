const path = require('path');
const config = require('../config/macros');
const { isManager } = require('../services/managerService');

const VIEWS = path.join(__dirname, '../views');
const isApi = (req) => req.path.startsWith('/api/');

/**
 * Manutenção: bloqueia tudo (exceto /api/health, registrado antes deste middleware).
 */
function maintenance(req, res, next) {
  if (!config.maintenance) return next();
  if (isApi(req)) return res.status(503).json({ message: 'O Gerenciador de Macros está em manutenção.' });
  return res.status(503).sendFile(path.join(VIEWS, 'maintenance.html'));
}

/**
 * Autenticação/autorização.
 * O ingress da plataforma (auth-url do values.yml) autentica o usuário e injeta o e-mail em
 * X-Auth-Request-Email. Só e-mails da aba "Base de Gestores de Macros" têm acesso.
 */
async function requireManager(req, res, next) {
  const email = String(req.get('x-auth-request-email') || config.devUserEmail || '')
    .trim()
    .toLowerCase();

  if (!email || !(await isManager(email))) {
    if (isApi(req)) return res.status(403).json({ message: 'Você não possui permissão para acessar esta aplicação.' });
    return res.status(403).sendFile(path.join(VIEWS, '403.html'));
  }

  req.user = { email };
  return next();
}

module.exports = { maintenance, requireManager };
