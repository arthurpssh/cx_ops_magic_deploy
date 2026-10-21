document.addEventListener('DOMContentLoaded', async () => {
  const $services = document.getElementById('services');

  // Ícones por id de serviço (SVG de 256x256, traço). Serviço sem ícone aqui usa a inicial do título.
  const ICONS = {
    macros:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"><path d="M92.69,216H48a8,8,0,0,1-8-8V163.31a8,8,0,0,1,2.34-5.65L165.66,34.34a8,8,0,0,1,11.31,0L221.66,79a8,8,0,0,1,0,11.31L98.34,213.66A8,8,0,0,1,92.69,216Z"/><line x1="136" y1="64" x2="192" y2="120"/></svg>',
  };

  function card(service) {
    const link = document.createElement('a');
    link.className = 'service-card';
    link.href = service.href;

    const icon = document.createElement('span');
    icon.className = 'service-icon';
    if (ICONS[service.id]) icon.innerHTML = ICONS[service.id];
    else icon.textContent = (service.title || '?').trim().charAt(0).toUpperCase();

    const body = document.createElement('span');
    body.className = 'service-body';

    const title = document.createElement('strong');
    title.textContent = service.title;

    const description = document.createElement('span');
    description.className = 'service-description';
    description.textContent = service.description || '';

    body.append(title, description);

    const arrow = document.createElement('span');
    arrow.className = 'service-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';

    link.append(icon, body, arrow);
    return link;
  }

  try {
    const services = await App.api('/api/services');
    $services.replaceChildren();

    if (services.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Nenhum serviço disponível.';
      $services.append(empty);
      return;
    }

    services.forEach((service) => $services.append(card(service)));
  } catch (error) {
    $services.replaceChildren();
    const message = document.createElement('p');
    message.className = 'empty-state';
    message.textContent = `Erro ao carregar os serviços: ${error.message}`;
    $services.append(message);
  }
});
