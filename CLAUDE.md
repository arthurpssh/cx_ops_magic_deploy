# Guia para Assistente de Programacao

Este projeto chama-se `gerenciador-de-macros` e e a versao Node.js + Express do Gerenciador de Macros do Zendesk (migrado de um web app Google Apps Script). Usa o Google Sheets como storage (via Service Account) e a API do Zendesk para criar/editar macros.

## Stack Tecnologica

| Camada | Tecnologia | Versao |
|--------|-----------|--------|
| Runtime | Node.js | 24 |
| Framework | Express | 5 |
| Google API | googleapis (somente Sheets) | 181+ |
| Front-end | HTML/CSS/JS puro + Quill 2 + Choices.js (servidos de `node_modules`) | — |
| Container | Docker (Alpine) | — |
| CI/CD | GitHub Actions | — |

## Estrutura do Projeto

```
gerenciador-de-macros/
├── src/
│   ├── app.js                       # Express app (health, manutencao, auth, rotas)
│   ├── server.js                    # Entry point (escuta na porta PORT)
│   ├── config/
│   │   ├── serviceCatalog.js        # Servicos listados como cards na home
│   │   ├── macros.js                # Abas da planilha, Zendesk, flags (le as env vars)
│   │   └── googleClient.js          # Autenticacao Google Sheets (Service Account)
│   ├── middlewares/
│   │   ├── auth.js                  # Manutencao + acesso restrito a gestores de macros
│   │   └── errorHandler.js          # Erros -> JSON { message }
│   ├── controllers/macroController.js
│   ├── routes/
│   │   ├── macroRoutes.js           # /api/macros/*
│   │   └── viewRoutes.js            # Paginas
│   ├── services/
│   │   ├── macroService.js          # Criar / editar / buscar macros
│   │   ├── formOptionsService.js    # Equipes, funcoes, idiomas e specs (cache de 60s)
│   │   ├── managerService.js        # Lista de gestores autorizados (cache de 60s)
│   │   └── logService.js            # Aba "Log de Macros"
│   ├── utils/
│   │   ├── SheetsDB.js              # Abstracao de acesso ao Sheets (RAW + UNFORMATTED_VALUE)
│   │   ├── zendeskClient.js         # API do Zendesk (fetch + retry em 429/5xx)
│   │   ├── macroFormatter.js        # Macro do Zendesk -> linha da "Base de Macros"
│   │   ├── memo.js                  # Cache com TTL
│   │   └── errors.js                # HttpError
│   └── views/                       # 403.html e maintenance.html
├── public/
│   ├── css/globals.css
│   ├── js/common.js                 # window.App: api(), toast, helpers
│   ├── js/macro-editor.js           # Editor Quill reutilizavel
│   ├── home/                        # Home com os cards de servicos
│   └── macros/{create,search,edit}/ # index.html + script.js de cada pagina
├── .github/workflows/deploy.yaml
├── Dockerfile
├── package.json
└── values.yml
```

## Arquitetura

- Express serve a REST API (`/api/macros/*`) e os arquivos estaticos.
- Todas as rotas, exceto `GET /api/health`, passam por `maintenance` e `requireManager`.
- Identidade: o ingress (`auth-url` do `values.yml`) injeta o e-mail em `X-Auth-Request-Email`. So e-mails da aba **Base de Gestores de Macros** (coluna `email`) acessam o app; os demais recebem 403.
- Zendesk e a fonte da macro. A aba **Base de Macros** e o espelho (busca, logs, relatorios) e e atualizada a cada criacao/edicao.
- Servidor e a autoridade: restricao de equipes, placeholder e tag sao calculados no backend a partir da planilha (o front so envia as selecoes).
- Health check: `GET /api/health` retorna `{ status: 'ok' }`.

### Secrets de Producao

Injetadas pelo Secrets Manager (ver `values.yml`):

- `GOOGLE_CLIENT_EMAIL` — e-mail da service account (precisa ser **Editora** da planilha)
- `GOOGLE_PRIVATE_KEY` — chave privada da service account
- `MACROS_SPREADSHEET_ID` — ID da planilha-base
- `ZENDESK_CLIENT_ID` e `ZENDESK_CLIENT_SECRET` — client OAuth confidencial do Zendesk (modo preferencial, ver abaixo)
- `ZENDESK_BASIC_TOKEN` — fallback legado: base64 de `email/token:api_token`. Usado so se o OAuth nao estiver configurado

Configuracao (nao secret): `ZENDESK_BASE_URL`, `ZENDESK_OAUTH_SCOPE` (padrao `read write tickets:read macros:read macros:write`, validado contra o Zendesk real; o client OAuth no Admin Center precisa ter todos esses escopos permitidos, e o escopo pedido deve estar dentro dessa lista, senao o token falha com 400 "requested scope is invalid"), `ZENDESK_OAUTH_EXPIRES_IN` (segundos, opcional; vazio = padrao do Zendesk), `MAINTENANCE_MODE` (`true` exibe a pagina de manutencao).
Somente dev local: `DEV_USER_EMAIL` simula o e-mail do usuario logado (NUNCA definir em producao).

## Home e servicos

A raiz `/` e uma home com cards (`public/home/`), um por servico. Os cards vem de `src/config/serviceCatalog.js` via `GET /api/services`. O Gerenciador de Macros e o primeiro servico: tem suas paginas em `public/macros/*`, rotas de pagina `/macros/*` e API `/api/macros/*`. As paginas de cada servico tem um botao "Inicio" no cabecalho que volta para `/`.

Para incluir um novo servico:
1. API sob `/api/<servico>` (router proprio registrado em `src/app.js`) e paginas sob `/<servico>/...` (`public/<servico>/...` + rotas em `src/routes/viewRoutes.js`).
2. Uma entrada em `src/config/serviceCatalog.js` (`id`, `title`, `description`, `href`).
3. Opcional: um icone em `ICONS` de `public/home/script.js` (sem icone, o card mostra a inicial do titulo).

Atencao: o controle de acesso (`requireManager`) e global e usa a lista "Base de Gestores de Macros". Um servico para outro publico exigira autorizacao por servico (hoje nao existe).

## Autenticacao no Zendesk

Implementada em `src/utils/zendeskClient.js` (config em `src/config/macros.js`):

- **OAuth client credentials** (quando `ZENDESK_CLIENT_ID` + `ZENDESK_CLIENT_SECRET` existem): `POST {origem}/oauth/tokens` com `grant_type=client_credentials`, `client_id`, `client_secret` e `scope`; as chamadas usam `Authorization: Bearer`.
- O token fica **somente em memoria** do processo (nunca em disco, planilha ou log). Nao ha refresh token: renovar = pedir outro token com as mesmas credenciais.
- Renovacao: antecipada (60s antes de `expires_in`; sem `expires_in` assume 1h), uma unica busca por vez (requisicoes concorrentes compartilham a mesma), e em 401 descarta o token, renova e repete a chamada uma unica vez.
- Se o pedido de token falhar, o erro e propagado como 502 com mensagem clara (o `client_secret` nunca entra na mensagem).
- **Fallback Basic**: sem as variaveis OAuth, usa `ZENDESK_BASIC_TOKEN`. Com as duas configuradas, o OAuth tem prioridade. Definir so um dos dois (`CLIENT_ID` sem `CLIENT_SECRET`, ou vice-versa) ou nenhum dos modos impede a aplicacao de subir.
- Rotacao do secret: gerar o novo secret no Admin Center (ou `PUT /api/v2/oauth/clients/{id}/generate_secret`), atualizar `ZENDESK_CLIENT_SECRET` nos secrets e fazer redeploy (o app le o secret ao subir).
- O client OAuth deve ser criado por uma conta de servico dedicada: as alteracoes aparecem no audit log do Zendesk como o usuario associado ao client.

## Planilha-base (abas e colunas usadas)

| Aba | Colunas |
|-----|---------|
| Base de Macros | id, status, tag_id, raw_title, title, description, d_team, d_func, d_lang, created_at, updated_at, content, tag_cr, restriction, handbook, macro_description |
| Base de Group Restrictions | name, id, ids (ids separados por virgula) |
| Base de Funções | Função, Descrição |
| Base de Idiomas | Idioma, Abreviatura (opções de idioma dos formulários) |
| Base de Specs | Nível 1..4, Concat Placeholder, Tag CR 3 e 4 (macro CR) |
| Base de Gestores de Macros | email |
| Artigos Handbook + Macro_ids | ID, Macros |
| Log de Macros | macro_id, action, author, updates, reason, log_id, datetime |

## Desenvolvimento Local

```bash
cp .env.example .env
# Preencha GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, MACROS_SPREADSHEET_ID, ZENDESK_BASIC_TOKEN e DEV_USER_EMAIL
npm install
npm run dev   # igual a "npm start", mas com --use-system-ca (usa os certificados raiz do sistema operacional)
```

Em rede corporativa com inspecao TLS, o `fetch` do Node falha com `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` / `SELF_SIGNED_CERT_IN_CHAIN`. Use `npm run dev` ou aponte `NODE_EXTRA_CA_CERTS` para o certificado raiz da empresa. Essas opcoes sao lidas na inicializacao do Node, entao NAO funcionam via `.env`. NUNCA usar `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Deploy

- `npm ci` instala dependencias de producao
- Docker copia `src/` e `public/`
- Container roda `node src/server.js` na porta 3001

## Regras

1. API route `GET /api/health` NUNCA remover — deve retornar `{ status: 'ok' }` (200) sempre
2. `HOSTNAME=0.0.0.0` para o servidor escutar em todas as interfaces no container
3. NAO adicionar banco de dados relacional — Google Sheets e o storage desta aplicacao
4. Secrets NUNCA hardcodar (nem credenciais do Zendesk, nem IDs de planilha) e NUNCA persistir o access token do Zendesk (so em memoria)
5. Health check deve ser instantaneo — NAO checar Google Sheets nem Zendesk no health
6. Escrita no Sheets sempre via `SheetsDB` (modo RAW: nunca deixar o Sheets reinterpretar HTML/texto)
7. Conteudo HTML de macros nunca e injetado via `innerHTML` no front: textos usam `textContent`, HTML vai para iframe com `sandbox`

## Rotas

| Metodo | Caminho | Descricao |
|--------|---------|-----------|
| GET | /api/health | Health check (sem autenticacao) |
| GET | /api/me | E-mail do usuario autenticado |
| GET | /api/macros/options | Equipes, funcoes, idiomas e specs para os formularios |
| GET | /api/macros/actions | Acoes suportadas pelo Zendesk (sem `comment_value`) |
| GET | /api/macros/tags?name= | Autocomplete de tags do Zendesk |
| GET | /api/macros | Busca na Base de Macros (`id`, `title`, `tag`, `status`, `keyword`) |
| GET | /api/macros/:id/preview | Linha completa da Base de Macros (com conteudo) |
| GET | /api/macros/:id | Macro atual no Zendesk + descricao interna |
| POST | /api/macros | Cria macro (Zendesk + base + log) |
| PUT | /api/macros/:id | Atualiza macro (Zendesk + base + log) |
| GET | /api/services | Catalogo de servicos exibidos na home |
| GET | / | Home: cards dos servicos |
| GET | /macros | Redireciona para /macros/create |
| GET | /macros/create | Criar macro |
| GET | /macros/search | Buscar macros |
| GET | /macros/edit/:id | Editar macro |

## SheetsDB — Operadores de Query

`$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$contains` (case-insensitive). Valor simples = igualdade (`==`).
`getRows(spreadsheetId, aba, query, colunasRetornadas?)`, `postRows`, `patchRows` (atualiza so as colunas informadas) e `deleteRows`.
