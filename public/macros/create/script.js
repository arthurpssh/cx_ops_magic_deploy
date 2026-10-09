document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);

  const $status = $('select-status');
  const $title = $('input-title');
  const $macroDescription = $('input-macro-description');
  const $teamSelect = $('select-team');
  const $function = $('select-function');
  const $language = $('select-language');
  const $specs = [1, 2, 3, 4].map((n) => $(`select-spec${n}`));
  const $previewTitle = $('preview-title');
  const $previewDescription = $('preview-description');
  const $previewTag = $('preview-tag');
  const $visibility = $('select-comment-visibility');
  const $btnCreate = $('btn-create');
  const $hint = $('create-hint');

  // ---------- Estado ----------
  let options = { teams: [], functions: [], languages: [], specs: [] };
  let selectedTeams = [];
  let selectedSpecs = ['', '', '', '']; // níveis escolhidos ('' = não escolhido)
  let resolvedSpec = null; // { placeholder, tag } quando o caminho de specs chega ao fim
  let editor = null;

  // ---------- Carga inicial ----------
  try {
    options = await App.api('/api/macros/options');
  } catch (error) {
    App.setOverlay(false);
    App.showToast(`Erro ao carregar listas: ${error.message}`, 'error');
    return;
  }

  editor = createMacroEditor($('quill-editor'));
  App.createTeamPicker($teamSelect, options.teams, (values) => {
    selectedTeams = values;
    updateForm();
  });

  $function.append(App.option('', '-'));
  options.functions.forEach((f) => $function.append(App.option(f.name, f.name, f.description)));
  options.languages.forEach((l) => $language.append(App.option(l.abbr, l.name)));

  fillSpecLevel(0);
  bindEvents();
  updateForm();
  App.setOverlay(false);

  // ---------- Specs (cascata) ----------
  // Opções do nível `level` (0-3) entre as linhas que casam com os níveis anteriores já escolhidos
  function specOptions(level) {
    const rows = options.specs.filter((row) => selectedSpecs.slice(0, level).every((sel, i) => row.levels[i] === sel));
    return [...new Set(rows.map((row) => row.levels[level]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  function fillSpecLevel(level) {
    const select = $specs[level];
    select.innerHTML = '';
    select.append(App.option('', '-'));
    specOptions(level).forEach((value) => select.append(App.option(value)));
    select.disabled = false;
  }

  function resetSpecLevel(level) {
    const select = $specs[level];
    select.innerHTML = '';
    select.append(App.option('', '-'));
    select.disabled = true;
    selectedSpecs[level] = '';
  }

  // Primeira linha que casa com todos os níveis escolhidos (mesmo critério do servidor)
  function resolveSpec() {
    const row = options.specs.find((r) => selectedSpecs.every((sel, i) => sel === '' || r.levels[i] === sel));
    resolvedSpec = row ? { placeholder: row.placeholder, tag: row.tag } : null;
  }

  function onSpecChange(level) {
    selectedSpecs[level] = $specs[level].value;
    for (let i = level + 1; i < 4; i++) resetSpecLevel(i);
    resolvedSpec = null;

    if (selectedSpecs[level] !== '') {
      const next = level < 3 ? specOptions(level + 1) : [];
      const isLeaf = next.length === 0 || (next.length === 1 && next[0].toLowerCase() === 'inactivated');
      if (isLeaf) resolveSpec();
      else fillSpecLevel(level + 1);
    }
    updateForm();
  }

  // ---------- Formulário ----------
  function selectedLanguage() {
    return options.languages.find((l) => l.abbr === $language.value) || options.languages[0];
  }

  function descriptionText() {
    const lang = selectedLanguage();
    const teams = App.teamsLabel(selectedTeams, options.teams);
    return `Equipe: ${teams.join(', ')} | Função: ${$function.value} | Idioma: ${lang ? lang.name : ''}`;
  }

  function finalTitle() {
    const lang = selectedLanguage();
    const placeholder = resolvedSpec ? resolvedSpec.placeholder : '[Aguardando Specs...]::';
    return `${placeholder}[${lang ? lang.abbr : '??'}] ${$title.value.trim()}`;
  }

  function validationError() {
    if ($title.value.trim().length < 2) return 'Informe o título da macro.';
    if ($macroDescription.value.trim().length < 6) return 'Informe a descrição da macro.';
    if (selectedTeams.length === 0) return 'Selecione pelo menos uma equipe.';
    if (!$function.value) return 'Selecione a função.';
    if (!resolvedSpec) return 'Complete a seleção de specs.';
    if (!resolvedSpec.tag.startsWith('macro_cr')) return 'A tag desta combinação de specs é inválida.';
    return '';
  }

  function updateForm() {
    $previewTitle.textContent = finalTitle();
    $previewDescription.textContent = descriptionText();
    $previewTag.textContent = resolvedSpec && resolvedSpec.tag ? resolvedSpec.tag : '-';

    const error = validationError();
    $btnCreate.disabled = error !== '';
    $hint.textContent = error;
  }

  function bindEvents() {
    $title.addEventListener('input', updateForm);
    $macroDescription.addEventListener('input', updateForm);
    $function.addEventListener('change', updateForm);
    $language.addEventListener('change', updateForm);
    $specs.forEach((select, level) => select.addEventListener('change', () => onSpecChange(level)));
    $btnCreate.addEventListener('click', createMacro);
  }

  // ---------- Criação ----------
  async function createMacro() {
    if (validationError()) return;
    App.setLoading($btnCreate, true);

    try {
      const macro = await App.api('/api/macros', {
        method: 'POST',
        body: {
          title: $title.value.trim(),
          status: $status.value,
          teams: selectedTeams,
          func: $function.value,
          lang: $language.value,
          specs: selectedSpecs,
          macro_description: $macroDescription.value.trim(),
          comment_html: editor.getHtml(),
          comment_public: $visibility.value === 'public',
        },
      });
      showSuccessModal(macro);
    } catch (error) {
      App.showToast(`Erro ao criar a macro: ${error.message}`, 'error');
    } finally {
      App.setLoading($btnCreate, false);
      updateForm();
    }
  }

  function showSuccessModal(macro) {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';
    dialog.innerHTML = `
      <div class="modal-meta">
        <h2>Macro criada com sucesso</h2>
        <p data-field="title"></p>
        <p data-field="id"></p>
        <p data-field="description"></p>
      </div>
      <div class="modal-actions">
        <button class="btn" data-action="new">Criar outra</button>
        <button class="btn btn-accent" data-action="edit">Editar</button>
      </div>`;
    dialog.querySelector('[data-field="title"]').textContent = macro.title;
    dialog.querySelector('[data-field="id"]').textContent = `ID ${macro.id}`;
    dialog.querySelector('[data-field="description"]').textContent = macro.description;

    // Não fecha com Esc: o usuário precisa escolher o próximo passo
    dialog.addEventListener('cancel', (e) => e.preventDefault());
    dialog.querySelector('[data-action="new"]').addEventListener('click', () => window.location.reload());
    dialog.querySelector('[data-action="edit"]').addEventListener('click', () => {
      window.location.href = `/macros/edit/${macro.id}`;
    });

    document.body.append(dialog);
    dialog.showModal();
  }
});
