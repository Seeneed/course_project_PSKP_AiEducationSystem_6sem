const express = require('express');
const router = express.Router();
const contentController = require('../controllers/contentController');
const upload = require('../middlewares/uploadMiddleware');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

router.get('/public', contentController.getAllMaterials);
router.get('/public/:id', contentController.getPublicMaterialById);

router.get('/categories', contentController.getCategories); 

router.get('/', verifyToken, contentController.getAllMaterials);
router.get('/generation/status', verifyToken, requireRole(['Teacher', 'Admin']), contentController.getGenerationStatus);
router.get('/progress', verifyToken, requireRole(['Student']), contentController.getStudentProgress);
router.get('/:id', verifyToken, contentController.getMaterialById);

router.post('/regenerate-quiz', verifyToken, contentController.regenerateQuiz);

router.post('/generate', verifyToken, requireRole(['Teacher', 'Admin']), upload.single('document'), contentController.uploadAndGenerate);
router.put('/:id', verifyToken, requireRole(['Teacher', 'Admin']), contentController.updateMaterial);
router.put('/:id/progress', verifyToken, requireRole(['Student']), contentController.updateStudentProgress);
router.put('/:id/publish', verifyToken, requireRole(['Teacher', 'Admin']), contentController.publishMaterial);
router.put('/:id/unpublish', verifyToken, requireRole(['Teacher', 'Admin']), contentController.unpublishMaterial);
router.delete('/:id', verifyToken, requireRole(['Teacher', 'Admin']), contentController.deleteMaterial);

module.exports = router;