const { Router } = require('express');
const c = require('../controllers/recipes.controller');
const { requireRole } = require('../middleware/requireRole');

const r = Router();

r.get('/:itemId',            requireRole('admin','manager'), c.getRecipe);
r.get('/:itemId/cost',       requireRole('admin','manager'), c.getRecipeCost);
r.post('/:itemId',           requireRole('admin','manager'), c.upsertRecipeItem);
r.delete('/entry/:recipeId', requireRole('admin','manager'), c.removeRecipeItem);

module.exports = r;
