// Listas de apoio dos formulários (equipes, funções, idiomas, specs), lidas da planilha-base.
const SheetsDB = require('../utils/SheetsDB');
const { memo } = require('../utils/memo');
const { spreadsheetId, sheets } = require('../config/macros');

const CACHE_TTL_MS = 60 * 1000;
const SPEC_LEVELS = 4;

const text = (value) => String(value === null || value === undefined ? '' : value).trim();

// Aba "Base de Idiomas": Idioma | Abreviatura (mantém a ordem da planilha)
const loadLanguages = memo(async () => {
  const rows = await SheetsDB.getRows(spreadsheetId, sheets.languages, {});
  const byAbbr = new Map();

  rows.forEach((row) => {
    const name = text(row['Idioma']);
    const abbr = text(row['Abreviatura']);
    if (!name || !abbr || byAbbr.has(abbr)) return;
    byAbbr.set(abbr, { name, abbr });
  });

  return [...byAbbr.values()];
}, CACHE_TTL_MS);

// Aba "Base de Group Restrictions": name | id | ids ("1, 2, 3")
const loadTeams = memo(async () => {
  const rows = await SheetsDB.getRows(spreadsheetId, sheets.restrictionGroups, {});
  const byName = new Map();

  rows.forEach((row) => {
    const name = text(row.name);
    if (!name || byName.has(name)) return;
    const ids = text(row.ids)
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => Number.isFinite(id));
    const id = parseInt(row.id, 10);
    if (Number.isFinite(id) && !ids.includes(id)) ids.push(id);
    byName.set(name, { name, ids });
  });

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}, CACHE_TTL_MS);

// Aba "Base de Funções": Função | Descrição
const loadFunctions = memo(async () => {
  const rows = await SheetsDB.getRows(spreadsheetId, sheets.functions, {});
  const byName = new Map();

  rows.forEach((row) => {
    const name = text(row['Função']);
    if (!name || byName.has(name)) return;
    byName.set(name, { name, description: text(row['Descrição']) });
  });

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}, CACHE_TTL_MS);

// Aba "Base de Specs": Nível 1..4 | Concat Placeholder | Tag CR 3 e 4 (macro CR)
const loadSpecs = memo(async () => {
  const rows = await SheetsDB.getRows(spreadsheetId, sheets.specs, {});

  return rows
    .map((row) => ({
      levels: Array.from({ length: SPEC_LEVELS }, (_, i) => text(row[`Nível ${i + 1}`])),
      placeholder: text(row['Concat Placeholder']),
      tag: text(row['Tag CR 3 e 4 (macro CR)']),
    }))
    .filter((spec) => spec.levels[0] !== '');
}, CACHE_TTL_MS);

async function getFormOptions() {
  const [teams, functions, languages, specs] = await Promise.all([
    loadTeams(),
    loadFunctions(),
    loadLanguages(),
    loadSpecs(),
  ]);
  return { teams, functions, languages, specs };
}

/**
 * Resolve placeholder + tag a partir do caminho de specs escolhido (níveis não escolhidos = "").
 * Mesmo critério do GAS obterDadosFinaisSpec: primeira linha que casa com os níveis informados.
 */
async function resolveSpec(levels) {
  const selected = Array.from({ length: SPEC_LEVELS }, (_, i) => text(levels && levels[i]));
  if (selected[0] === '') return null;

  const specs = await loadSpecs();
  const match = specs.find((spec) => selected.every((level, i) => level === '' || spec.levels[i] === level));
  return match ? { placeholder: match.placeholder, tag: match.tag } : null;
}

module.exports = { loadLanguages, loadTeams, getFormOptions, resolveSpec };
