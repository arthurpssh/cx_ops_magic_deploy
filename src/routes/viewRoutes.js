const express = require('express');
const path = require('path');
const router = express.Router();

const page = (...segments) => path.join(__dirname, '../../public', ...segments, 'index.html');

router.get('/', (req, res) => res.redirect('/macros/create'));
router.get('/macros/create', (req, res) => res.sendFile(page('macros', 'create')));
router.get('/macros/search', (req, res) => res.sendFile(page('macros', 'search')));
router.get('/macros/edit/:id', (req, res) => res.sendFile(page('macros', 'edit')));

module.exports = router;
