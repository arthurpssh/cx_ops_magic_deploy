// Controle de acesso: apenas e-mails da aba "Base de Gestores de Macros" podem usar o app.
const SheetsDB = require('../utils/SheetsDB');
const { memo } = require('../utils/memo');
const { spreadsheetId, sheets } = require('../config/macros');

const loadManagerEmails = memo(async () => {
  const rows = await SheetsDB.getRows(spreadsheetId, sheets.managers, {});
  return new Set(
    rows
      .map((row) => String(row.email || '').trim().toLowerCase())
      .filter(Boolean)
  );
}, 60 * 1000);

async function isManager(email) {
  if (!email) return false;
  const emails = await loadManagerEmails();
  return emails.has(String(email).trim().toLowerCase());
}

module.exports = { isManager };
