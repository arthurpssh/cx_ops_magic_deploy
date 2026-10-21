// src/app.js
const express = require('express');
const path = require('path');

const { maintenance, requireManager } = require('./middlewares/auth');
const errorHandler = require('./middlewares/errorHandler');
const macroRoutes = require('./routes/macroRoutes');
const viewRoutes = require('./routes/viewRoutes');
const serviceCatalog = require('./config/serviceCatalog');

const app = express();
app.disable('x-powered-by');

// Middlewares globais
app.use(express.json({ limit: '2mb' })); // o HTML do comentário da macro pode ser grande

// Health check: instantâneo, sem autenticação e sem tocar no Sheets (NUNCA remover)
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));

// A partir daqui: manutenção + acesso restrito a gestores de macros
app.use(maintenance);
app.use(requireManager);

// Bibliotecas de front servidas localmente (versões fixadas pelo package-lock.json)
const modules = path.join(__dirname, '../node_modules');
app.use('/vendor/quill', express.static(path.join(modules, 'quill/dist')));
app.use('/vendor/choices', express.static(path.join(modules, 'choices.js/public/assets')));

// Arquivos estáticos (CSS, JS). index/redirect desligados: as páginas são servidas por viewRoutes,
// e sem isso "/macros/create" (que é também uma pasta) seria redirecionado para "/macros/create/".
app.use(express.static(path.join(__dirname, '../public'), { index: false, redirect: false }));

app.get('/api/me', (req, res) => res.json({ email: req.user.email }));
app.get('/api/services', (req, res) => res.json(serviceCatalog));
app.use('/api/macros', macroRoutes);
app.use('/', viewRoutes);

app.use('/api', (req, res) => res.status(404).json({ message: 'Rota não encontrada.' }));
app.use(errorHandler);

module.exports = app;
