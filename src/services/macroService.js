// Regras de negócio do Gerenciador de Macros (criar, buscar, editar).
// Zendesk é a fonte da macro; a aba "Base de Macros" é o espelho usado em buscas, logs e relatórios.
const SheetsDB = require('../utils/SheetsDB');
const zendesk = require('../utils/zendeskClient');
const { memo } = require('../utils/memo');
const { HttpError } = require('../utils/errors');
const { spreadsheetId, sheets } = require('../config/macros');
const { addLog } = require('./logService');
const { LANGUAGES, loadTeams, resolveSpec } = require('./formOptionsService');
const { GENERAL_TEAM, buildDescription, formatMacro, compareMacros } = require('../utils/macroFormatter');

const SEARCH_COLUMNS = ['id', 'status', 'title', 'description', 'tag_cr'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Aba "Artigos Handbook + Macro_ids": ID | Macros ("macro_id_1, macro_id_2")
const loadHandbookRelations = memo(async () => {
  const rows = await SheetsDB.getRows(spreadsheetId, sheets.handbookMacros, {});
  return rows.map((hb) => ({
    id: hb['ID'],
    macros: hb['Macros'] ? String(hb['Macros']).replaceAll('[]', '').split(', ') : undefined,
  }));
}, 5 * 60 * 1000);

const loadSupportedActions = memo(async () => {
  const { actions } = await zendesk.getSupportedActions();
  return { actions: actions.filter((action) => action.value !== 'comment_value') };
}, 10 * 60 * 1000);

function parseMacroId(id) {
  if (!/^\d+$/.test(String(id)) || Number(id) === 0) throw new HttpError(400, 'ID de macro inválido.');
  return Number(id);
}

const asString = (value) => (typeof value === 'string' ? value.trim() : '');

/** Valida/normaliza as equipes escolhidas e devolve rótulo para a descrição + restrição do Zendesk. */
async function resolveTeams(teamsInput) {
  const selected = [...new Set((Array.isArray(teamsInput) ? teamsInput : []).map(asString).filter(Boolean))];
  if (selected.length === 0) throw new HttpError(400, 'Selecione pelo menos uma equipe.');

  const allTeams = await loadTeams();
  const known = allTeams.filter((team) => selected.includes(team.name));

  const allSelected = allTeams.length > 0 && known.length === allTeams.length;
  const teamLabels = allSelected ? [GENERAL_TEAM] : selected;

  const ids = [...new Set(known.flatMap((team) => team.ids))].sort((a, b) => a - b);
  // Sem nenhuma equipe conhecida não há como montar a restrição: ela é omitida (Zendesk mantém a atual)
  const restriction = ids.length > 0 ? { type: 'Group', id: ids[0], ids } : null;

  return { teamLabels, restriction };
}

function validateActions(actions) {
  if (!Array.isArray(actions) || actions.length === 0) throw new HttpError(400, 'Adicione pelo menos uma ação na macro.');
  return actions.map((action) => {
    const field = asString(action && action.field);
    if (!field) throw new HttpError(400, 'Existem ações sem campo (field) selecionado.');
    return { field, value: action.value };
  });
}

async function findSheetRow(macroId) {
  const rows = await SheetsDB.getRows(spreadsheetId, sheets.macros, { id: macroId });
  return rows.length > 0 ? rows[0] : null;
}

const summary = (macro) => ({ id: macro.id, title: macro.title, description: macro.description });

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

/** Busca na aba "Base de Macros" (filtros: id, title, tag, status, keyword) */
async function searchMacros(filters = {}) {
  const query = {};

  if (filters.id) {
    query.id = String(filters.id).trim();
  } else {
    if (filters.title) query.title = { $contains: String(filters.title) };
    if (filters.tag) query.tag_cr = String(filters.tag).trim();
    if (filters.keyword) query.content = { $contains: String(filters.keyword) };

    const statuses = String(filters.status || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // Com os dois status selecionados ("Todos") não há filtro
    if (statuses.length === 1) query.status = { $in: statuses };
  }

  const macros = await SheetsDB.getRows(spreadsheetId, sheets.macros, query, SEARCH_COLUMNS);
  return { total: macros.length, macros };
}

/** Linha completa (com conteúdo) de uma macro da base, usada na visualização da busca */
async function getMacroPreview(id) {
  const row = await findSheetRow(parseMacroId(id));
  if (!row) throw new HttpError(404, 'Macro não encontrada na base.');
  return row;
}

/** Macro atual no Zendesk + descrição interna guardada na base */
async function getMacroForEdit(id) {
  const macroId = parseMacroId(id);
  const [{ macro }, row] = await Promise.all([zendesk.getMacro(macroId), findSheetRow(macroId)]);
  return { macro, macro_description: row ? row.macro_description || '' : '' };
}

async function getSupportedActions() {
  return loadSupportedActions();
}

async function searchTags(name) {
  const term = asString(name);
  if (term.length < 2) return [];
  return zendesk.autocompleteTags(term);
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

/**
 * @param {{ email: string }} user
 * @param {object} input
 *   { title, status: 'active'|'inactive', teams: string[], func, lang (abreviatura), specs: string[4],
 *     macro_description, comment_html, comment_public }
 */
async function createMacro(user, input = {}) {
  const baseTitle = asString(input.title);
  if (baseTitle.length < 2) throw new HttpError(400, 'Informe o título da macro.');

  const macroDescription = asString(input.macro_description);
  if (macroDescription.length < 6) throw new HttpError(400, 'Informe a descrição da macro.');

  const func = asString(input.func);
  if (!func) throw new HttpError(400, 'Selecione a função da macro.');

  const language = LANGUAGES.find((l) => l.abbr === input.lang);
  if (!language) throw new HttpError(400, 'Idioma inválido.');

  const spec = await resolveSpec(input.specs);
  if (!spec) throw new HttpError(400, 'Combinação de specs não encontrada.');
  if (!spec.tag.startsWith('macro_cr')) throw new HttpError(400, 'A tag da combinação de specs é inválida (esperado macro_cr...).');

  const { teamLabels, restriction } = await resolveTeams(input.teams);

  const comment = typeof input.comment_html === 'string' ? input.comment_html.replaceAll('{ticket.assignee.name}', '{current_user.name}') : '';

  const payload = {
    title: `${spec.placeholder}[${language.abbr}] ${baseTitle}`,
    active: input.status !== 'inactive',
    description: buildDescription({ teams: teamLabels, func, lang: language.name }),
    actions: [
      { field: 'current_tags', value: spec.tag },
      { field: 'comment_value_html', value: comment },
      { field: 'comment_mode_is_public', value: input.comment_public !== false },
    ],
  };
  if (restriction) payload.restriction = restriction;

  // 1) cria a macro
  const { macro: created } = await zendesk.createMacro(payload);

  // 2) adiciona a tag macro_id_<id> (só existe depois que o Zendesk gera o ID)
  const idTag = `macro_id_${created.id}`;
  const actions = created.actions.map(({ field, value }) => ({ field, value }));
  const tagsAction = actions.find((a) => a.field === 'current_tags');
  if (tagsAction) {
    const tags = String(tagsAction.value).split(' ').filter(Boolean);
    if (!tags.includes(idTag)) tags.push(idTag);
    tagsAction.value = tags.join(' ');
  } else {
    actions.push({ field: 'current_tags', value: idTag });
  }

  let finalMacro;
  try {
    ({ macro: finalMacro } = await zendesk.updateMacro(created.id, { title: created.raw_title, actions }));
  } catch (error) {
    throw new HttpError(502, `A macro foi criada no Zendesk (ID ${created.id}), mas falhou ao adicionar a tag ${idTag}: ${error.message}`);
  }

  // 3) espelha na base e registra no log
  try {
    const handbook = await loadHandbookRelations();
    await SheetsDB.postRows(spreadsheetId, sheets.macros, formatMacro(finalMacro, handbook, macroDescription));
    await addLog({
      macro_id: finalMacro.id,
      action: 'Criação',
      author: user.email,
      updates: 'Tudo',
      reason: macroDescription,
    });
  } catch (error) {
    console.error('[macroService] Falha ao registrar macro criada na base:', error);
    throw new HttpError(500, `A macro foi criada no Zendesk (ID ${finalMacro.id}), mas falhou ao registrar na base: ${error.message}`);
  }

  return summary(finalMacro);
}

// ---------------------------------------------------------------------------
// Edição
// ---------------------------------------------------------------------------

/**
 * @param {{ email: string }} user
 * @param {number|string} id
 * @param {object} input
 *   { title, active: boolean, teams: string[], func, lang (nome do idioma), macro_description?, actions }
 */
async function updateMacro(user, id, input = {}) {
  const macroId = parseMacroId(id);

  const title = asString(input.title);
  if (!title) throw new HttpError(400, 'O título da macro não pode ficar vazio.');

  const func = asString(input.func);
  const lang = asString(input.lang);
  if (!func || !lang) throw new HttpError(400, 'Preencha a Função e o Idioma.');

  const actions = validateActions(input.actions);
  const { teamLabels, restriction } = await resolveTeams(input.teams);

  const handbook = await loadHandbookRelations();

  // Estado "antes", para o log. Se a macro ainda não está na base, usa o que está no Zendesk.
  const row = await findSheetRow(macroId);
  const before = row || formatMacro((await zendesk.getMacro(macroId)).macro, handbook);

  const payload = {
    title,
    active: input.active === true || input.active === 'true',
    description: buildDescription({ teams: teamLabels, func, lang }),
    actions,
  };
  if (restriction) payload.restriction = restriction;

  const { macro: updated } = await zendesk.updateMacro(macroId, payload);

  const macroDescription = typeof input.macro_description === 'string' ? input.macro_description.trim() : before.macro_description;
  const after = formatMacro(updated, handbook, macroDescription);

  try {
    if (row) {
      const { id: _ignored, ...changes } = after; // o ID nunca é regravado
      await SheetsDB.patchRows(spreadsheetId, sheets.macros, { id: macroId }, changes);
    } else {
      await SheetsDB.postRows(spreadsheetId, sheets.macros, after);
    }
    await addLog({
      macro_id: macroId,
      action: 'Atualização',
      author: user.email,
      updates: compareMacros(before, after),
    });
  } catch (error) {
    console.error('[macroService] Falha ao registrar atualização na base:', error);
    throw new HttpError(500, `A macro foi atualizada no Zendesk, mas falhou ao registrar na base: ${error.message}`);
  }

  return summary(updated);
}

module.exports = {
  searchMacros,
  getMacroPreview,
  getMacroForEdit,
  getSupportedActions,
  searchTags,
  createMacro,
  updateMacro,
};
