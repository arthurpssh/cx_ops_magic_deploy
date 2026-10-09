# Preparacao — Especifico: Node.js 24 + Express + Google Sheets API

## Stack deste template
- Framework: Express 5
- Runtime: Node.js 24
- Storage: Google Sheets via googleapis (sem uso do Drive)
- Integracao externa: API do Zendesk (fetch nativo)
- Sem banco de dados relacional

## Regras especificas

- NAO adicionar Next.js, Vite ou outro framework de frontend
- NAO adicionar Prisma, Liquibase ou qualquer ORM/migrations
- Health check: `GET /api/health` retorna `{ status: 'ok' }` (Express handler, nao checar Google Sheets)
- Dockerfile copia `src/` e `public/`, roda `npm ci --omit=dev`, CMD `node src/server.js`
- Script start: `node src/server.js`
- Env `PORT=3001` obrigatorio

## Secrets

Quatro secrets sao obrigatorios (injetados via AWS Secrets Manager):

- `GOOGLE_CLIENT_EMAIL` — e-mail da service account
- `GOOGLE_PRIVATE_KEY` — chave privada PEM da service account
- `MACROS_SPREADSHEET_ID` — ID da planilha-base do Gerenciador de Macros
- `ZENDESK_CLIENT_ID` e `ZENDESK_CLIENT_SECRET` — client OAuth (client credentials) do Zendesk
- `ZENDESK_BASIC_TOKEN` — fallback legado: base64 de `email/token:api_token` (Authorization: Basic)

As seguintes variaveis sao configuracao (nao secret), definir diretamente no `env:` do values.yml:

- `ZENDESK_BASE_URL` — URL base da API do Zendesk
- `ZENDESK_OAUTH_SCOPE` — escopos OAuth solicitados (padrao `read write`)
- `MAINTENANCE_MODE` — `true` exibe a pagina de manutencao

No values.yml cada secret deve ser um `secretKeyRef` com nome no formato `{app-name}-{env-name-lowercase}`.

## values.yml — Estrutura

```yaml
name: {nome-da-aplicacao}

containerPort: 3001
cpu: 0.25
memory: 256Mi
replicaCount: 1

healthCheckPath: /api/health
periodSeconds: 30
timeoutSeconds: 5
successThreshold: 2
failureThreshold: 5

env:
  PROFILE: staging
  PORT: "3001"
  NEW_RELIC_ENABLED: "false"
  GOOGLE_CLIENT_EMAIL:
    secretKeyRef:
      name: {nome-da-aplicacao}-google-client-email
      key: GOOGLE_CLIENT_EMAIL
  GOOGLE_PRIVATE_KEY:
    secretKeyRef:
      name: {nome-da-aplicacao}-google-private-key
      key: GOOGLE_PRIVATE_KEY
  MACROS_SPREADSHEET_ID:
    secretKeyRef:
      name: {nome-da-aplicacao}-macros-spreadsheet-id
      key: MACROS_SPREADSHEET_ID
  ZENDESK_CLIENT_ID:
    secretKeyRef:
      name: {nome-da-aplicacao}-zendesk-client-id
      key: ZENDESK_CLIENT_ID
  ZENDESK_CLIENT_SECRET:
    secretKeyRef:
      name: {nome-da-aplicacao}-zendesk-client-secret
      key: ZENDESK_CLIENT_SECRET
  ZENDESK_BASIC_TOKEN:
    secretKeyRef:
      name: {nome-da-aplicacao}-zendesk-basic-token
      key: ZENDESK_BASIC_TOKEN
  ZENDESK_BASE_URL: "https://suportehotmart.zendesk.com/api/v2"
  ZENDESK_OAUTH_SCOPE: "read write"
  MAINTENANCE_MODE: "false"

lb:
  type: internal
  hosts:
  - host: {nome-da-aplicacao}.hotmart.run
    paths: ["/"]

imports:
- to: module.base-module.aws_ecr_repository.application-default-ecr[0]
  id: "{nome-da-aplicacao}"
```

## deploy.yaml — Jobs

Jobs obrigatorios: `resolve`, `build`, `infra` (needs: [build]), `deploy` (needs: [build, infra, resolve]).
NAO ha job `liquibase` — nao ha banco de dados.
NAO ha step `npm run build` — Express nao precisa de build step.
