const SheetsDB = require('../utils/SheetsDB');
const { spreadsheetId, sheets } = require('../config/macros');

/**
 * Registra uma ação na aba "Log de Macros".
 * @param {{ macro_id, action, author, updates, reason? }} log
 */
async function addLog(log) {
  await SheetsDB.postRows(spreadsheetId, sheets.logs, {
    ...log,
    log_id: `MCR${Date.now()}`,
    datetime: new Date().toISOString(),
  });
}

module.exports = { addLog };
