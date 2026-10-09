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

Configuracao (nao secret): `ZENDESK_BASE_URL`, `ZENDESK_OAUTH_SCOPE` (padrao `read write`; pode ser restringido, ex. `macros:read macros:write`), `ZENDESK_OAUTH_EXPIRES_IN` (segundos, opcional; vazio = padrao do Zendesk), `MAINTENANCE_MODE` (`true` exibe a pagina de manutencao).
Somente dev local: `DEV_USER_EMAIL` simula o e-mail do usuario logado (NUNCA definir em producao).

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
| Base de Specs | Nível 1..4, Concat Placeholder, Tag CR 3 e 4 (macro CR) |
| Base de Gestores de Macros | email |
| Artigos Handbook + Macro_ids | ID, Macros |
| Log de Macros | macro_id, action, author, updates, reason, log_id, datetime |

## Desenvolvimento Local

```bash
cp .env.example .env
# Preencha GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, MACROS_SPREADSHEET_ID, ZENDESK_BASIC_TOKEN e DEV_USER_EMAIL
npm install
npm start
```

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
| GET | / | Redireciona para /macros/create |
| GET | /macros/create | Criar macro |
| GET | /macros/search | Buscar macros |
| GET | /macros/edit/:id | Editar macro |

## SheetsDB — Operadores de Query

`$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$contains` (case-insensitive). Valor simples = igualdade (`==`).
`getRows(spreadsheetId, aba, query, colunasRetornadas?)`, `postRows`, `patchRows` (atualiza so as colunas informadas) e `deleteRows`.
