// Portado de macros_utils.gs: converte uma macro do Zendesk na linha da aba "Base de Macros".

const GENERAL_TEAM = 'General Team';

// Rótulos usados no log de alterações (somente campos comparados)
const FIELD_LABELS = {
  id: 'ID',
  status: 'Status',
  tag_id: 'Tag ID',
  raw_title: 'Título Placeholder',
  title: 'Título',
  description: 'Descrição',
  d_team: 'Equipe',
  d_func: 'Função',
  d_lang: 'Idioma',
  created_at: 'Data de criação',
  content: 'Conteúdo',
  tag_cr: 'Tag CR',
  restriction: 'Restrição',
  handbook: 'Handbook',
  macro_description: 'Descrição da macro',
};

/** "Equipe: A, B | Função: X | Idioma: Y" -> { team, func, lang } */
function splitDescription(description) {
  const empty = { team: '', func: '', lang: '' };
  if (!description || !String(description).startsWith('Equipe: ')) return empty;

  const parts = {};
  String(description)
    .split('|')
    .forEach((part) => {
      const idx = part.indexOf(':');
      if (idx === -1) return;
      parts[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    });

  return { team: parts['Equipe'] || '', func: parts['Função'] || '', lang: parts['Idioma'] || '' };
}

/** Monta a descrição padrão da macro. `teams` = nomes selecionados; todos selecionados vira "General Team". */
function buildDescription({ teams, func, lang }) {
  return `Equipe: ${teams.join(', ')} | Função: ${func} | Idioma: ${lang}`;
}

function getContent(macro) {
  const actions = macro.actions || [];
  const html = actions.find((a) => a.field === 'comment_value_html');
  const plain = actions.find((a) => a.field === 'comment_value');
  if (html) return html.value;
  if (plain) return plain.value;
  return '';
}

function getCR(macro) {
  const currentTags = (macro.actions || []).find((a) => a.field === 'current_tags');
  if (!currentTags) return '';
  const tagCr = String(currentTags.value).split(' ').find((tag) => tag.startsWith('macro_cr-'));
  return tagCr || '';
}

/** IDs dos artigos do Handbook que referenciam a macro (via tag macro_id_<id>) */
function findHandbook(relationList, macro) {
  const articles = (relationList || []).filter(
    (hb) => hb.macros && hb.macros.some((m) => m === `macro_id_${macro.id}`)
  );
  return articles.map((a) => a.id).join(', ');
}

function formatRestriction(restriction) {
  if (!restriction) return null;
  const ids = [...new Set([...(restriction.ids || []), restriction.id].filter((id) => id !== undefined && id !== null))];
  return `Type: ${restriction.type} | IDs: ${ids.join(', ')}`;
}

function formatMacro(macro, handbookMacrosList, macroDescription) {
  const parsed = splitDescription(macro.description);
  return {
    id: macro.id,
    status: macro.active ? 'Ativa' : 'Inativa',
    tag_id: `macro_id_${macro.id}`,
    raw_title: macro.raw_title,
    title: macro.title,
    description: macro.description,
    d_team: parsed.team,
    d_func: parsed.func,
    d_lang: parsed.lang,
    created_at: macro.created_at,
    updated_at: macro.updated_at,
    content: getContent(macro),
    tag_cr: getCR(macro),
    restriction: formatRestriction(macro.restriction),
    handbook: findHandbook(handbookMacrosList, macro),
    macro_description: macroDescription === undefined ? macro.macro_description : macroDescription,
  };
}

/** Resumo textual das diferenças entre duas macros já formatadas ("Nenhum", "Tudo" ou lista de campos). */
function compareMacros(before, after) {
  const norm = (v) => String(v === null || v === undefined ? '' : v);
  const keys = Object.keys(FIELD_LABELS);
  const changed = keys.filter((key) => norm(before[key]) !== norm(after[key]));

  if (changed.length === 0) return 'Nenhum';
  if (changed.length === keys.length) return 'Tudo';
  return changed.map((key) => FIELD_LABELS[key]).join(', ');
}

module.exports = {
  GENERAL_TEAM,
  splitDescription,
  buildDescription,
  formatMacro,
  formatRestriction,
  compareMacros,
};
