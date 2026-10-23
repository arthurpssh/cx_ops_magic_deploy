// Editor de texto rico (Quill) usado no comentário da macro. Exposto em window.createMacroEditor.
(function () {
  // Bloco "linha horizontal" (<hr>)
  const BlockEmbed = Quill.import('blots/block/embed');
  class DividerBlot extends BlockEmbed {}
  DividerBlot.blotName = 'divider';
  DividerBlot.tagName = 'hr';
  Quill.register(DividerBlot);

  // Paleta do editor do Zendesk, sem preto/branco (cores fixas assim quebram o modo claro/escuro).
  const TEXT_COLORS = [
    '#c72809', '#bc5a10', '#018747', '#096ecc', '#960fd4', '#d11db5',
    '#7d1905', '#723609', '#01512a', '#054580', '#640a8e', '#8b1379',
  ];

  // "rgb(199, 40, 9)" ou "#C72809" -> "#c72809"
  function toHex(value) {
    const v = String(value || '').trim().toLowerCase();
    const m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    return v;
  }

  const TOOLS = [
    [{ header: [false, 1, 2, 3, 4] }],
    ['bold', 'italic', 'underline'],
    [{ color: TEXT_COLORS }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }, { indent: '+1' }, { indent: '-1' }],
    ['link', 'blockquote', 'code', 'code-block', 'divider'],
  ];

  const CODE_BLOCK_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="none"/><polyline points="64 32 32 64 64 96" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><polyline points="104 32 136 64 104 96" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><path d="M176,48h24a8,8,0,0,1,8,8V200a8,8,0,0,1-8,8H56a8,8,0,0,1-8-8V136" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/></svg>';

  const TITLES = [
    ['.ql-header', 'Formatação de Título'],
    ['.ql-bold', 'Negrito'],
    ['.ql-italic', 'Itálico'],
    ['.ql-underline', 'Sublinhado'],
    ['.ql-color', 'Cor do Texto'],
    ['.ql-background', 'Cor do Fundo'],
    ['.ql-list[value="ordered"]', 'Lista Numerada'],
    ['.ql-list[value="bullet"]', 'Lista com Marcadores'],
    ['.ql-indent[value="+1"]', 'Aumentar Recuo'],
    ['.ql-indent[value="-1"]', 'Diminuir Recuo'],
    ['.ql-link', 'Inserir Link'],
    ['.ql-blockquote', 'Citação em Bloco'],
    ['.ql-code', 'Código Em Linha'],
    ['.ql-code-block', 'Bloco de Código'],
    ['.ql-divider', 'Inserir Linha Horizontal'],
  ];

  /**
   * @param {HTMLElement} container - elemento vazio que receberá o editor (a toolbar vira irmã anterior)
   * @param {(html: string) => void} [onChange]
   * @returns {{ quill: Quill, getHtml(): string, setHtml(html: string): void, destroy(): void }}
   */
  window.createMacroEditor = function createMacroEditor(container, onChange) {
    const quill = new Quill(container, {
      theme: 'snow',
      placeholder: 'Cole ou digite o conteúdo da macro aqui.',
      modules: {
        toolbar: {
          container: TOOLS,
          handlers: {
            divider() {
              const range = this.quill.getSelection(true);
              this.quill.insertEmbed(range.index, 'divider', true);
              this.quill.setSelection(range.index + 1);
            },
          },
        },
      },
    });

    // Descarta cores de texto fora da paleta (coladas ou já salvas), como preto e branco:
    // cor fixa quebra o modo claro/escuro do Zendesk.
    quill.clipboard.addMatcher(Node.ELEMENT_NODE, (node, delta) => {
      delta.ops.forEach((op) => {
        if (op.attributes && op.attributes.color && !TEXT_COLORS.includes(toHex(op.attributes.color))) {
          delete op.attributes.color;
        }
      });
      return delta;
    });

    const toolbar = container.parentElement.querySelector('.ql-toolbar');
    if (toolbar) {
      const codeBlock = toolbar.querySelector('.ql-code-block');
      if (codeBlock) codeBlock.innerHTML = CODE_BLOCK_ICON;
      TITLES.forEach(([selector, text]) => {
        const button = toolbar.querySelector(selector);
        if (button) button.setAttribute('title', text);
      });
    }

    const handler = () => onChange && onChange(quill.root.innerHTML);
    quill.on('text-change', handler);

    return {
      quill,
      getHtml: () => quill.root.innerHTML,
      setHtml(html) {
        if (html) quill.clipboard.dangerouslyPasteHTML(html);
      },
      destroy() {
        quill.off('text-change', handler);
        if (toolbar) toolbar.remove();
        container.innerHTML = '';
        container.className = '';
      },
    };
  };
})();
