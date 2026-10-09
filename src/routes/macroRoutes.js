const express = require('express');
const router = express.Router();
const MacroController = require('../controllers/macroController');

// Rotas estáticas antes de "/:id"
router.get('/options', MacroController.getFormOptions);
router.get('/actions', MacroController.getSupportedActions);
router.get('/tags', MacroController.searchTags);

// Busca (filtros via query string: id, title, tag, status, keyword)
router.get('/', MacroController.searchMacros);

router.post('/', MacroController.createMacro);
router.get('/:id/preview', MacroController.getMacroPreview);
router.get('/:id', MacroController.getMacro);
router.put('/:id', MacroController.updateMacro);

module.exports = router;
