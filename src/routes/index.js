const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const authController = require('../controllers/authController');
const projectController = require('../controllers/projectController');
const taskController = require('../controllers/taskController');
const commentController = require('../controllers/commentController');
const notificationController = require('../controllers/notificationController');
const analyticsController = require('../controllers/analyticsController');
const db = require('../config/database');

const router = express.Router();

// Health check
router.get('/health', async (req, res) => {
    try {
        const result = await db.query('SELECT 1'); 
        res.json({ success: true, db: 'connected', message: 'API and DB are healthy' });
    } catch (err) {
        res.status(500).json({ success: false, db: 'disconnected', error: err.message });
    }
});

// ===== AUTH ROUTES =====
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/me', authenticateToken, authController.getProfile);
router.patch('/auth/profile', authenticateToken, authController.updateProfile);
router.post('/auth/forgot-password', authController.forgotPassword);
router.post('/auth/reset-password', authController.resetPassword);
router.post('/auth/change-password', authenticateToken, authController.changePassword);

// ===== PROJECT ROUTES =====
router.post('/projects', authenticateToken, projectController.createProject);
router.get('/projects', authenticateToken, projectController.listProjects);
router.get('/projects/:id', authenticateToken, projectController.getProject);
router.patch('/projects/:id', authenticateToken, projectController.updateProject);
router.post('/projects/:id/generate-qr', authenticateToken, projectController.generateQRCode);
router.post('/projects/join-qr', authenticateToken, projectController.joinProjectViaQR);
router.get('/projects/:id/members', authenticateToken, projectController.listProjectMembers);
router.post('/projects/:id/invite', authenticateToken, projectController.inviteMember);
router.get('/projects/:id/tasks', authenticateToken, projectController.listProjectTasks);

// ===== TASK ROUTES =====
router.post('/tasks', authenticateToken, taskController.createTask);
router.get('/tasks', authenticateToken, taskController.listTasks);
router.get('/tasks/my-tasks', authenticateToken, taskController.listMyTasks);
router.get('/tasks/:id', authenticateToken, taskController.getTask);
router.patch('/tasks/:id', authenticateToken, taskController.updateTask);
router.patch('/tasks/:id/status', authenticateToken, taskController.changeTaskStatus);
router.patch('/tasks/:id/assign', authenticateToken, taskController.assignTask);
router.get('/projects/:id/kanban', authenticateToken, taskController.getKanbanBoard);
router.delete('/tasks/:id', authenticateToken, taskController.deleteTask);


// ===== COMMENT ROUTES =====
router.post('/tasks/:id/comments', authenticateToken, commentController.addComment);
router.get('/tasks/:id/comments', authenticateToken, commentController.getComments);
router.patch('/comments/:id', authenticateToken, commentController.updateComment);
router.delete('/comments/:id', authenticateToken, commentController.deleteComment);

// ===== NOTIFICATION ROUTES =====
router.get('/notifications', authenticateToken, notificationController.listNotifications);
router.patch('/notifications/:id', authenticateToken, notificationController.markAsRead);
router.patch('/notifications/mark-all-read', authenticateToken, notificationController.markAllAsRead);
router.delete('/notifications/:id', authenticateToken, notificationController.deleteNotification);

// ===== ANALYTICS ROUTES =====
router.get('/projects/:id/dashboard', authenticateToken, analyticsController.getProjectDashboard);
router.get('/projects/:id/burndown', authenticateToken, analyticsController.getBurndownChart);
router.post('/projects/:id/export', authenticateToken, analyticsController.exportReport);

module.exports = router;