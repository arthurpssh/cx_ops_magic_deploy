const MacroService = require('../services/macroService');
const { getFormOptions } = require('../services/formOptionsService');

// Express 5 já encaminha rejeições de handlers async para o errorHandler.
class MacroController {
  static async getFormOptions(req, res) {
    res.json(await getFormOptions());
  }

  static async getSupportedActions(req, res) {
    res.json(await MacroService.getSupportedActions());
  }

  static async searchTags(req, res) {
    res.json(await MacroService.searchTags(req.query.name));
  }

  static async searchMacros(req, res) {
    res.json(await MacroService.searchMacros(req.query));
  }

  static async getMacroPreview(req, res) {
    res.json(await MacroService.getMacroPreview(req.params.id));
  }

  static async getMacro(req, res) {
    res.json(await MacroService.getMacroForEdit(req.params.id));
  }

  static async createMacro(req, res) {
    res.status(201).json(await MacroService.createMacro(req.user, req.body));
  }

  static async updateMacro(req, res) {
    res.json(await MacroService.updateMacro(req.user, req.params.id, req.body));
  }
}

module.exports = MacroController;
