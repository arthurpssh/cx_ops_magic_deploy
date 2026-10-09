// src/config/macros.js
// Configuração central da aplicação (abas da planilha, Zendesk, flags).

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

/**
 * Autenticação no Zendesk. Dois modos (o OAuth tem prioridade quando configurado):
 *  - OAuth "client credentials": ZENDESK_CLIENT_ID + ZENDESK_CLIENT_SECRET -> Bearer com validade curta,
 *    renovado automaticamente (ver utils/zendeskClient.js).
 *  - Fallback Basic: ZENDESK_BASIC_TOKEN (base64 de "email/token:api_token").
 */
function zendeskConfig() {
  const baseUrl = (process.env.ZENDESK_BASE_URL || 'https://suportehotmart.zendesk.com/api/v2').replace(/\/+$/, '');
  const clientId = (process.env.ZENDESK_CLIENT_ID || '').trim();
  const clientSecret = (process.env.ZENDESK_CLIENT_SECRET || '').trim();
  const basicToken = (process.env.ZENDESK_BASIC_TOKEN || '').trim();

  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error('ZENDESK_CLIENT_ID e ZENDESK_CLIENT_SECRET devem ser definidos juntos');
  }
  if (!clientId && !basicToken) {
    throw new Error('Configure ZENDESK_CLIENT_ID + ZENDESK_CLIENT_SECRET (OAuth) ou ZENDESK_BASIC_TOKEN (fallback)');
  }

  const expiresIn = parseInt(process.env.ZENDESK_OAUTH_EXPIRES_IN, 10);

  return {
    baseUrl,
    // /oauth/tokens fica na raiz do subdomínio, fora de /api/v2
    oauthUrl: new URL(baseUrl).origin,
    oauth: clientId
      ? {
          clientId,
          clientSecret,
          scope: (process.env.ZENDESK_OAUTH_SCOPE || 'read write tickets:read macros:read macros:write').trim(),
          expiresIn: Number.isFinite(expiresIn) ? expiresIn : null, // segundos; vazio = padrão do Zendesk
        }
      : null,
    basicToken: basicToken || null,
  };
}

module.exports = {
  spreadsheetId: required('MACROS_SPREADSHEET_ID'),

  // Nomes exatos das abas da planilha-base
  sheets: {
    macros: 'Base de Macros',
    restrictionGroups: 'Base de Group Restrictions',
    functions: 'Base de Funções',
    specs: 'Base de Specs',
    managers: 'Base de Gestores de Macros',
    handbookMacros: 'Artigos Handbook + Macro_ids',
    logs: 'Log de Macros',
  },

  zendesk: zendeskConfig(),

  // Quando "true", todas as rotas (exceto /api/health) exibem a página de manutenção
  maintenance: String(process.env.MAINTENANCE_MODE || '').toLowerCase() === 'true',

  // Apenas desenvolvimento local: simula o e-mail que o proxy de autenticação injetaria.
  // NÃO definir em produção (o header X-Auth-Request-Email é a fonte da identidade).
  devUserEmail: (process.env.DEV_USER_EMAIL || '').trim().toLowerCase(),
};
