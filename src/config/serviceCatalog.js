// Catálogo de serviços exibidos como cards na home ("/").
//
// Para incluir um novo serviço:
//   1. rotas de API sob /api/<servico> e páginas sob /<servico> (ex.: public/<servico>/...)
//   2. uma entrada neste array
//
// Campos:
//   id          identificador único (também escolhe o ícone em public/home/script.js; sem ícone usa a inicial)
//   title       nome exibido no card
//   description frase curta sobre o serviço
//   href        rota de entrada do serviço (caminho relativo ao app)
module.exports = [
  {
    id: 'macros',
    title: 'Gerenciador de Macros',
    description: 'Crie, busque e edite as macros do Zendesk.',
    href: '/macros',
  },
];
