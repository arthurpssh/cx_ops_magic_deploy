document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  const $id = $('filter-id');
  const $title = $('filter-title');
  const $tag = $('filter-tag');
  const $status = $('filter-status');
  const $keyword = $('filter-keyword');
  const $btnSearch = $('btn-search');
  const $results = $('results');
  const $items = $('results-items');
  const $counter = $('results-counter');
  const $suggestions = $('tag-suggestions');

  const ICON_VIEW =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><circle cx="112" cy="112" r="80" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><line x1="168.57" y1="168.57" x2="224" y2="224" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/></svg>';
  const ICON_EDIT =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M92.69,216H48a8,8,0,0,1-8-8V163.31a8,8,0,0,1,2.34-5.65L165.66,34.34a8,8,0,0,1,11.31,0L221.66,79a8,8,0,0,1,0,11.31L98.34,213.66A8,8,0,0,1,92.69,216Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><line x1="136" y1="64" x2="192" y2="120" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/></svg>';

  const statusClass = (status) => (status === 'Ativa' ? 'ativa' : 'inativa');

  // ---------- Busca ----------
  async function search() {
    const params = new URLSearchParams();
    if ($id.value.trim()) params.set('id', $id.value.trim());
    if ($title.value.trim()) params.set('title', $title.value.trim());
    if ($tag.value.trim()) params.set('tag', $tag.value.trim());
    if ($keyword.value.trim()) params.set('keyword', $keyword.value.trim());
    params.set('status', $status.value);

    App.setLoading($btnSearch, true);
    $results.classList.add('results-loading');
    try {
      const { macros } = await App.api(`/api/macros?${params}`);
      render(macros);
    } catch (error) {
      App.showToast(`Falha na busca: ${error.message}`, 'error');
    } finally {
      App.setLoading($btnSearch, false);
      $results.classList.remove('results-loading');
    }
  }

  function render(macros) {
    $items.replaceChildren();
    $counter.textContent = `${macros.length} ${macros.length === 1 ? 'resultado' : 'resultados'}`;

    if (macros.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Nenhuma macro encontrada com esses filtros.';
      $items.append(empty);
      return;
    }

    macros.forEach((macro) => $items.append(resultItem(macro)));
  }

  function resultItem(macro) {
    const item = document.createElement('div');
    item.className = 'result-item';

    const status = document.createElement('span');
    status.className = `status-tag ${statusClass(macro.status)}`;
    status.textContent = macro.status || 'Inativa';

    const title = document.createElement('span');
    title.className = 'result-title';
    title.textContent = macro.title || 'Sem título';

    const actions = document.createElement('div');
    actions.className = 'result-actions';

    const view = document.createElement('button');
    view.className = 'btn btn-icon';
    view.title = 'Visualizar';
    view.innerHTML = ICON_VIEW;
    view.addEventListener('click', () => showMacro(macro, view));

    const edit = document.createElement('a');
    edit.className = 'btn btn-icon';
    edit.title = 'Editar';
    edit.href = `/macros/edit/${encodeURIComponent(macro.id)}`;
    edit.innerHTML = ICON_EDIT;

    actions.append(view, edit);
    item.append(status, title, actions);
    return item;
  }

  // ---------- Visualização ----------
  async function showMacro(macro, trigger) {
    App.setLoading(trigger, true);
    let full;
    try {
      full = await App.api(`/api/macros/${encodeURIComponent(macro.id)}/preview`);
    } catch (error) {
      App.showToast(`Erro ao carregar a macro: ${error.message}`, 'error');
      return;
    } finally {
      App.setLoading(trigger, false);
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'modal';
    dialog.innerHTML = `
      <div class="modal-head">
        <span class="status-tag"></span>
        <h2></h2>
      </div>
      <div class="modal-meta">
        <span><strong>ID:</strong> <span data-field="id"></span></span>
        <span><strong>Descrição:</strong> <span data-field="description"></span></span>
        <span><strong>Tag:</strong> <span data-field="tag"></span></span>
      </div>
      <iframe class="content-frame" sandbox="allow-popups allow-popups-to-escape-sandbox" title="Conteúdo da macro"></iframe>
      <div class="modal-actions">
        <button class="btn" data-action="close">Fechar</button>
        <a class="btn btn-accent" data-action="edit">Editar</a>
      </div>`;

    const status = dialog.querySelector('.status-tag');
    status.classList.add(statusClass(full.status));
    status.textContent = full.status || 'Inativa';
    dialog.querySelector('h2').textContent = full.title || 'Sem título';
    dialog.querySelector('[data-field="id"]').textContent = full.id;
    dialog.querySelector('[data-field="description"]').textContent = full.description || 'Sem descrição';
    dialog.querySelector('[data-field="tag"]').textContent = full.tag_cr || '';

    // O conteúdo da macro é HTML: fica isolado num iframe sem permissões (sem scripts)
    dialog.querySelector('iframe').srcdoc =
      `<base target="_blank"><body style="font-family: sans-serif; font-size: 14px;">${full.content || 'Nenhum conteúdo disponível.'}</body>`;

    dialog.querySelector('[data-action="edit"]').href = `/macros/edit/${encodeURIComponent(full.id)}`;
    dialog.querySelector('[data-action="close"]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());

    document.body.append(dialog);
    dialog.showModal();
  }

  // ---------- Autocomplete de tags ----------
  let debounceTimer = null;
  let suggestionToken = 0;

  $tag.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const value = $tag.value.trim();
    if (value.length < 2) return hideSuggestions();
    debounceTimer = setTimeout(() => loadSuggestions(value), 500);
  });

  async function loadSuggestions(value) {
    const token = ++suggestionToken;
    try {
      const tags = await App.api(`/api/macros/tags?name=${encodeURIComponent(value)}`);
      if (token !== suggestionToken) return; // resposta de uma digitação antiga
      $suggestions.replaceChildren();

      if (tags.length === 0) {
        const none = document.createElement('li');
        none.textContent = 'Nenhum resultado';
        $suggestions.append(none);
      }
      tags.forEach((tag) => {
        const li = document.createElement('li');
        li.textContent = tag;
        li.addEventListener('click', () => {
          $tag.value = tag;
          hideSuggestions();
        });
        $suggestions.append(li);
      });
      $suggestions.hidden = false;
    } catch (error) {
      console.error('Erro na busca de tags:', error);
    }
  }

  function hideSuggestions() {
    suggestionToken++;
    $suggestions.hidden = true;
    $suggestions.replaceChildren();
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete')) hideSuggestions();
  });

  // ---------- Eventos ----------
  $btnSearch.addEventListener('click', search);
  [$id, $title, $keyword].forEach((input) =>
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') search();
    })
  );
});
