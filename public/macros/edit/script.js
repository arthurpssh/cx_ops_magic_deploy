// =========================================
// Tag input (campos de tags da macro, com autocomplete do Zendesk)
// =========================================
class TagInput {
  constructor(actionId, onChange) {
    this.onChange = onChange;
    this.tags = [];
    this.suggestions = [];
    this.activeIndex = -1;
    this.typingTimer = null;
    this.requestToken = 0;

    this.element = document.createElement('div');
    this.element.className = 'tag-input-wrapper';
    this.element.id = `action-value-selector-${actionId}`;
    this.element.innerHTML = `
      <div class="tag-input-container">
        <div class="tags-wrapper"></div>
        <input type="text" placeholder="Digite para adicionar tags..." autocomplete="off">
      </div>
      <ul class="suggestions" hidden></ul>`;

    this.container = this.element.querySelector('.tag-input-container');
    this.tagsWrapper = this.element.querySelector('.tags-wrapper');
    this.input = this.element.querySelector('input');
    this.list = this.element.querySelector('.suggestions');

    this.bindEvents();
  }

  setTags(tagsString) {
    this.tags = String(tagsString || '').split(' ').filter((t) => t.trim() !== '');
    this.renderTags();
  }

  bindEvents() {
    this.container.addEventListener('click', () => this.input.focus());

    this.input.addEventListener('input', () => {
      clearTimeout(this.typingTimer);
      const query = this.input.value.trim();
      if (query.length === 0) return this.hideSuggestions();

      this.typingTimer = setTimeout(async () => {
        const token = ++this.requestToken;
        try {
          const found = await App.api(`/api/macros/tags?name=${encodeURIComponent(query)}`);
          if (token !== this.requestToken) return;
          this.suggestions = found;
        } catch {
          this.suggestions = [];
        }
        if (this.suggestions.length > 0) this.renderSuggestions();
        else this.hideSuggestions();
      }, 600);
    });

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.activeIndex >= 0 && this.suggestions.length > 0) {
          this.addTag(this.suggestions[this.activeIndex]);
        } else if (this.input.value.trim()) {
          this.addTag(this.input.value.trim());
        }
      } else if (e.key === 'ArrowDown' && this.suggestions.length > 0) {
        e.preventDefault();
        this.activeIndex = (this.activeIndex + 1) % this.suggestions.length;
        this.highlight();
      } else if (e.key === 'ArrowUp' && this.suggestions.length > 0) {
        e.preventDefault();
        this.activeIndex = (this.activeIndex - 1 + this.suggestions.length) % this.suggestions.length;
        this.highlight();
      } else if (e.key === 'Backspace' && this.input.value === '' && this.tags.length > 0) {
        this.removeTag(this.tags.length - 1);
      }
    });

    this.list.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'LI') this.addTag(e.target.dataset.value);
    });

    // Fecha as sugestões ao clicar fora (e remove o listener quando o componente sai da tela)
    this.outsideClick = (e) => {
      if (!document.body.contains(this.element)) return document.removeEventListener('click', this.outsideClick);
      if (!this.element.contains(e.target)) this.hideSuggestions();
    };
    document.addEventListener('click', this.outsideClick);
  }

  addTag(text) {
    if (!text || this.tags.includes(text)) return;
    this.tags.push(text);
    this.renderTags();
    this.input.value = '';
    this.hideSuggestions();
    this.triggerChange();
  }

  removeTag(index) {
    this.tags.splice(index, 1);
    this.renderTags();
    this.triggerChange();
  }

  renderTags() {
    this.tagsWrapper.replaceChildren();
    this.tags.forEach((tag, index) => {
      const el = document.createElement('span');
      el.className = 'tag';
      el.append(document.createTextNode(`${tag} `));

      const close = document.createElement('span');
      close.className = 'close-tag';
      close.textContent = '×';
      close.addEventListener('click', () => this.removeTag(index));

      el.append(close);
      this.tagsWrapper.append(el);
    });
  }

  renderSuggestions() {
    this.list.replaceChildren();
    this.activeIndex = -1;
    this.suggestions.forEach((suggestion) => {
      const li = document.createElement('li');
      li.textContent = suggestion;
      li.dataset.value = suggestion;
      this.list.append(li);
    });
    this.list.hidden = false;
  }

  highlight() {
    this.list.querySelectorAll('li').forEach((li, index) => {
      li.classList.toggle('active', index === this.activeIndex);
      if (index === this.activeIndex) li.scrollIntoView({ block: 'nearest' });
    });
  }

  hideSuggestions() {
    this.requestToken++;
    this.list.hidden = true;
    this.suggestions = [];
    this.activeIndex = -1;
  }

  triggerChange() {
    this.onChange(this.tags.join(' '));
  }

  destroy() {
    clearTimeout(this.typingTimer);
    document.removeEventListener('click', this.outsideClick);
    this.element.innerHTML = '';
  }
}

// =========================================
// Editor Quill de uma ação (adapta createMacroEditor à interface destroy/setContent)
// =========================================
class QuillEditor {
  constructor(container, onChange) {
    this.editor = createMacroEditor(container, onChange);
  }

  setContent(html) {
    this.editor.setHtml(html);
  }

  destroy() {
    this.editor.destroy();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);

  const $active = $('select-active');
  const $title = $('base-title');
  const $teamSelect = $('sel-equipe');
  const $function = $('sel-funcao');
  const $language = $('sel-idioma');
  const $description = $('textarea-description');
  const $actionsList = $('actions-list');
  const $btnAddAction = $('btn-add-action');
  const $btnUpdate = $('btn-update');

  // ---------- Identificação da macro ----------
  const macroId = window.location.pathname.split('/').filter(Boolean).pop();
  if (!/^\d+$/.test(macroId) || Number(macroId) === 0) {
    window.location.href = '/macros/search';
    return;
  }

  // ---------- Estado ----------
  const headerState = { title: '', active: true, teams: [], func: '', lang: '', macro_description: '' };
  const AppState = {
    actionFields: [], // { action_id, field, value }
    components: {}, // action_id -> TagInput | QuillEditor
  };
  let actionCounter = 0;
  let supportedActions = [];
  let options = { teams: [], functions: [], languages: [] };
  let teamPicker = null;
  const preservedActions = []; // ações do Zendesk que este editor não sabe editar: são reenviadas sem alteração

  // ---------- Carga inicial ----------
  let macro;
  try {
    const [macroData, optionsData, actionsData] = await Promise.all([
      App.api(`/api/macros/${macroId}`),
      App.api('/api/macros/options'),
      App.api('/api/macros/actions'),
    ]);
    options = optionsData;
    supportedActions = actionsData.actions;
    macro = macroData.macro;
    headerState.macro_description = macroData.macro_description || '';
  } catch (error) {
    App.setOverlay(false);
    App.showToast(`Erro ao carregar a macro: ${error.message}`, 'error');
    if (error.status === 404) setTimeout(() => (window.location.href = '/macros/search'), 2500);
    return;
  }

  // init() é chamado no final deste handler, depois de todas as declarações (const) abaixo
  function init() {
    $('edit-heading').textContent = `Editar macro ${macro.id}`;

    // Opções dos selects
    options.functions.forEach((f) => $function.append(App.option(f.name, f.name, f.description)));
    options.languages.forEach((l) => $language.append(App.option(l.name)));
    teamPicker = App.createTeamPicker($teamSelect, options.teams, (values) => (headerState.teams = values));

    // Valores atuais (descrição padrão: "Equipe: ... | Função: ... | Idioma: ...")
    const parsed = App.parseDescription(macro.description);
    const allNames = options.teams.map((t) => t.name);
    const teams = parsed.teams.length === 1 && parsed.teams[0] === App.GENERAL_TEAM ? allNames : parsed.teams;

    // Equipe que não está mais na lista continua selecionável (e preservada)
    const unknown = teams.filter((t) => !allNames.includes(t));
    if (unknown.length > 0) teamPicker.setChoices(unknown.map((t) => ({ value: t, label: t })), 'value', 'label', false);
    teamPicker.setChoiceByValue(teams);

    App.ensureOption($function, parsed.func);
    App.ensureOption($language, parsed.lang);

    headerState.title = macro.raw_title || '';
    headerState.active = macro.active;
    headerState.teams = teams;
    headerState.func = parsed.func;
    headerState.lang = parsed.lang;

    $active.value = String(headerState.active);
    $title.value = headerState.title;
    $function.value = headerState.func;
    $language.value = headerState.lang;
    $description.value = headerState.macro_description;

    // Ações
    (macro.actions || []).forEach(loadAction);

    // Listeners
    $active.addEventListener('change', () => (headerState.active = $active.value === 'true'));
    $title.addEventListener('input', () => (headerState.title = $title.value));
    $function.addEventListener('change', () => (headerState.func = $function.value));
    $language.addEventListener('change', () => (headerState.lang = $language.value));
    $description.addEventListener('input', () => (headerState.macro_description = $description.value));
    $btnAddAction.addEventListener('click', () => addAction(true));
    $btnUpdate.addEventListener('click', updateMacro);
  }

  // =========================================
  // Ações
  // =========================================
  function updateActionState(actionId, valueOrUpdater) {
    const actionField = AppState.actionFields.find((f) => f.action_id == actionId);
    if (!actionField) return;
    actionField.value = typeof valueOrUpdater === 'function' ? valueOrUpdater(actionField.value) : valueOrUpdater;
  }

  const objectOrEmpty = (value) => (value !== null && typeof value === 'object' ? value : {});

  const FieldFactory = {
    text(actionId, actionDef) {
      if (['current_tags', 'remove_tags', 'set_tags'].includes(actionDef.field)) {
        const tagInput = new TagInput(actionId, (tagsString) => updateActionState(actionId, tagsString));
        return { element: tagInput.element, instance: tagInput };
      }

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'action-input';
      input.id = `action-value-selector-${actionId}`;
      input.addEventListener('input', (e) => updateActionState(actionId, e.target.value));
      return { element: input };
    },

    list(actionId, actionDef) {
      const selector = buildSelector({
        className: 'action-input',
        id: `action-value-selector-${actionId}`,
        options: actionDef.values.list,
      });
      selector.addEventListener('change', (e) => updateActionState(actionId, e.target.value));
      return { element: selector };
    },

    list_with_textarea(actionId, actionDef) {
      const wrapper = document.createElement('div');
      wrapper.className = 'macro-action-multivalue';

      const selector = buildSelector({
        className: 'action-input',
        id: `action-value-selector-${actionId}`,
        options: actionDef.values.list,
      });
      selector.addEventListener('change', (e) => {
        updateActionState(actionId, (current) => ({ ...objectOrEmpty(current), lwta_channel: e.target.value }));
      });

      const quillContainer = document.createElement('div');
      wrapper.append(selector, quillContainer);

      const instance = new QuillEditor(quillContainer, (html) => {
        updateActionState(actionId, (current) => ({ ...objectOrEmpty(current), quillValue: html }));
      });
      return { element: wrapper, instance };
    },

    textarea(actionId) {
      const wrapper = document.createElement('div');
      wrapper.className = 'macro-action-multivalue';

      const quillContainer = document.createElement('div');
      quillContainer.id = `action-value-selector-${actionId}`;
      wrapper.append(quillContainer); // o container precisa estar no DOM antes de iniciar o Quill

      const instance = new QuillEditor(quillContainer, (html) => updateActionState(actionId, html));
      return { element: wrapper, instance };
    },
  };

  function buildSelector({ className, id, options: items, emptyLabel }) {
    const select = document.createElement('select');
    select.className = className;
    select.id = id;
    if (emptyLabel !== undefined) select.append(App.option('', emptyLabel));
    items.forEach((item) => select.append(App.option(item.value, item.title)));
    return select;
  }

  function addAction(scroll = false) {
    // Só uma ação "em branco" por vez
    if (AppState.actionFields.some((a) => a.field === '')) return null;

    const actionId = ++actionCounter;

    const container = document.createElement('div');
    container.className = 'action-container';
    container.id = `action-container-${actionId}`;

    const fieldBox = document.createElement('div');
    fieldBox.className = 'action-field';
    const valueBox = document.createElement('div');
    valueBox.className = 'action-value';

    const fieldSelector = buildSelector({
      className: 'action-input',
      id: `action-field-selector-${actionId}`,
      emptyLabel: 'Selecione uma ação',
      options: supportedActions.filter((a) => !AppState.actionFields.some((f) => f.field === a.field)),
    });

    fieldSelector.addEventListener('change', () => {
      const selectedField = fieldSelector.value;
      const stored = AppState.actionFields.find((f) => f.action_id === actionId);
      stored.field = selectedField;

      if (selectedField !== '') {
        const def = supportedActions.find((a) => a.field === selectedField);
        const list = def && def.values && def.values.list;
        stored.value = list && list.length > 0 ? list[0].value : null;
      } else {
        stored.value = null;
      }

      renderValueField(actionId, selectedField, container, valueBox);
    });

    const btnDelete = document.createElement('button');
    btnDelete.type = 'button';
    btnDelete.className = 'btn-delete-action';
    btnDelete.textContent = 'X';
    btnDelete.title = 'Remover ação';
    btnDelete.addEventListener('click', () => deleteAction(actionId));

    fieldBox.append(fieldSelector);
    container.append(fieldBox, valueBox, btnDelete);
    $actionsList.append(container);

    AppState.actionFields.push({ action_id: actionId, field: fieldSelector.value, value: null });

    if (scroll) container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return actionId;
  }

  function destroyComponent(actionId) {
    const component = AppState.components[actionId];
    if (!component) return;
    component.destroy();
    delete AppState.components[actionId];
  }

  function renderValueField(actionId, field, container, valueBox) {
    destroyComponent(actionId);
    valueBox.replaceChildren();
    container.classList.remove('has-editor');
    if (field === '') return;

    const def = supportedActions.find((a) => a.field === field);
    const type = def && def.values && def.values.type;
    const factory = type && FieldFactory[type];
    if (!factory) {
      App.showToast(`Tipo de valor "${type || 'desconhecido'}" não pode ser identificado.`, 'error');
      return;
    }

    const { element, instance } = factory(actionId, def);
    valueBox.append(element);

    if (instance) {
      AppState.components[actionId] = instance;
      if (instance instanceof QuillEditor) container.classList.add('has-editor');
    }
  }

  function deleteAction(actionId) {
    const container = document.getElementById(`action-container-${actionId}`);
    if (!container) return;
    destroyComponent(actionId);
    AppState.actionFields = AppState.actionFields.filter((f) => f.action_id !== actionId);
    container.remove();
  }

  // Cria a linha da ação já preenchida com o valor vindo do Zendesk
  function loadAction({ field, value }) {
    const def = supportedActions.find((a) => a.field === field);
    if (!def) {
      // Ação que o editor não conhece: mantida como está para não ser apagada no PUT
      preservedActions.push({ field, value });
      return;
    }

    const actionId = addAction();
    if (!actionId) return;

    const selector = document.getElementById(`action-field-selector-${actionId}`);
    App.ensureOption(selector, field, def.title); // o mesmo campo pode aparecer mais de uma vez na macro
    selector.value = field;
    selector.dispatchEvent(new Event('change'));

    populateActionValue(actionId, def, value);
  }

  function populateActionValue(actionId, def, value) {
    if (value === null || value === undefined) return;

    updateActionState(actionId, value);
    const type = def.values && def.values.type;
    const component = AppState.components[actionId];
    const input = document.getElementById(`action-value-selector-${actionId}`);

    if (type === 'text') {
      if (component && component.setTags) component.setTags(value);
      else if (input) input.value = value;
    } else if (type === 'list') {
      if (input) {
        App.ensureOption(input, String(value));
        input.value = value;
      }
    } else if (type === 'list_with_textarea') {
      if (input && value.lwta_channel) input.value = value.lwta_channel;
      if (component && value.quillValue) component.setContent(value.quillValue);
    } else if (type === 'textarea') {
      if (component) component.setContent(value);
    }
  }

  // =========================================
  // Atualização
  // =========================================
  function buildPayload() {
    return {
      title: headerState.title.trim().replaceAll('  ', ' ').replaceAll('\t', '').replaceAll(':: ', '::'),
      active: headerState.active,
      teams: headerState.teams,
      func: headerState.func,
      lang: headerState.lang,
      macro_description: headerState.macro_description,
      actions: [
        ...AppState.actionFields.map(({ field, value }) => ({ field, value })),
        ...preservedActions,
      ],
    };
  }

  function validatePayload(payload) {
    if (!payload.title) return 'O título da macro não pode ficar vazio.';
    if (payload.teams.length === 0 || !payload.func || !payload.lang) return 'Preencha a Equipe, Função e Idioma.';
    if (payload.actions.length === 0) return 'Adicione pelo menos uma ação na macro.';
    if (payload.actions.some((a) => !a.field)) return 'Existem ações sem campo selecionado. Selecione ou remova a ação.';
    return null;
  }

  async function updateMacro() {
    const payload = buildPayload();
    const error = validatePayload(payload);
    if (error) return App.showToast(error, 'error');

    App.setLoading($btnUpdate, true);
    try {
      await App.api(`/api/macros/${macroId}`, { method: 'PUT', body: payload });
      App.showToast('Macro atualizada com sucesso!', 'success');
    } catch (err) {
      console.error(err);
      App.showToast(`Erro ao atualizar a macro: ${err.message}`, 'error');
    } finally {
      App.setLoading($btnUpdate, false);
    }
  }

  init();
  App.setOverlay(false);
});
