// Helpers compartilhados pelas páginas (exposto em window.App)
(function () {
  const GENERAL_TEAM = 'General Team';

  /** fetch + JSON; erros viram Error(message) com a mensagem devolvida pelo servidor */
  async function api(path, { method = 'GET', body } = {}) {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const error = new Error((data && data.message) || `Erro ${response.status} ao comunicar com o servidor.`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut .3s forwards';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  function setLoading(button, loading) {
    button.classList.toggle('is-loading', loading);
    button.disabled = loading;
  }

  function setOverlay(visible, message) {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    if (message) overlay.querySelector('p').textContent = message;
    overlay.hidden = !visible;
  }

  /** Cria um <option> */
  function option(value, label, title) {
    const el = document.createElement('option');
    el.value = value;
    el.textContent = label === undefined ? value : label;
    if (title) el.title = title;
    return el;
  }

  /** Garante que o <select> tenha a opção (valores legados que não estão mais na lista) */
  function ensureOption(select, value, label) {
    if (!value) return;
    const exists = Array.from(select.options).some((o) => o.value === value);
    if (!exists) select.append(option(value, label));
  }

  /** "Equipe: A, B | Função: X | Idioma: Y" -> { teams: string[], func, lang } */
  function parseDescription(description) {
    const result = { teams: [], func: '', lang: '' };
    if (!description || !description.startsWith('Equipe: ')) return result;

    const parts = {};
    description.split('|').forEach((part) => {
      const idx = part.indexOf(':');
      if (idx !== -1) parts[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    });

    result.teams = (parts['Equipe'] || '').split(',').map((t) => t.trim()).filter(Boolean);
    result.func = parts['Função'] || '';
    result.lang = parts['Idioma'] || '';
    return result;
  }

  /** Todas as equipes selecionadas viram "General Team" na descrição (mesma regra do servidor) */
  function teamsLabel(selected, allTeams) {
    const allSelected = allTeams.length > 0 && allTeams.every((t) => selected.includes(t.name));
    return allSelected ? [GENERAL_TEAM] : selected;
  }

  /** Cria o seletor múltiplo de equipes (Choices.js) dentro de um <select multiple> */
  function createTeamPicker(selectEl, teams, onChange) {
    const picker = new Choices(selectEl, {
      removeItemButton: true,
      noResultsText: 'Nenhuma equipe encontrada',
      noChoicesText: 'Nenhuma equipe disponível',
      itemSelectText: '',
      placeholder: true,
      placeholderValue: 'Selecione as equipes',
    });
    picker.setChoices(
      teams.map((t) => ({ value: t.name, label: t.name })),
      'value',
      'label',
      true
    );
    selectEl.addEventListener('change', () => onChange(picker.getValue(true)));
    return picker;
  }

  window.App = {
    GENERAL_TEAM,
    api,
    showToast,
    setLoading,
    setOverlay,
    option,
    ensureOption,
    parseDescription,
    teamsLabel,
    createTeamPicker,
  };
})();
