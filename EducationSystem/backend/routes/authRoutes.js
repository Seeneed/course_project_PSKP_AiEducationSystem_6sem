const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.put('/update-profile', verifyToken, authController.updateProfile);
router.get('/profile', verifyToken, authController.getProfile);


module.exports = router;