const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

router.use(verifyToken, requireRole(['Admin']));

router.get('/users', adminController.getAllUsers);
router.put('/users/role', adminController.updateUserRole);
router.put('/users/block', adminController.toggleBlock);
router.delete('/users/:id', adminController.deleteUser);
router.get('/configs', adminController.getAIConfigs);
router.put('/configs', adminController.updateAIConfig);
router.get('/ai-models', adminController.getGroqModels);
router.get('/categories', adminController.getCategories);
router.post('/categories', adminController.addCategory);
router.put('/categories/:id', adminController.updateCategory);
router.delete('/categories/:id', adminController.deleteCategory);

module.exports = router;