const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

class CommentController {
    // POST /api/v1/tasks/:id/comments
    async addComment(req, res) {
        try {
            const { id: taskId } = req.params;
            const { text } = req.body;

            if (!text || text.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Comment text is required'
                });
            }

            // Check if user has access to task
            const taskCheck = await db.query(
                `SELECT t.project_id FROM tasks t
         INNER JOIN project_members pm ON t.project_id = pm.project_id
         WHERE t.id = $1 AND pm.user_id = $2 AND pm.status = 'accepted'`,
                [taskId, req.user.userId]
            );

            if (taskCheck.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    error: 'You do not have access to this task'
                });
            }

            // Extract mentions (@username)
            const mentionRegex = /@(\w+)/g;
            const mentions = [];
            let match;

            while ((match = mentionRegex.exec(text)) !== null) {
                const username = match[1];
                const userResult = await db.query(
                    'SELECT id, name FROM users WHERE name ILIKE $1',
                    [username]
                );

                if (userResult.rows.length > 0) {
                    mentions.push({
                        user_id: userResult.rows[0].id,
                        username: userResult.rows[0].name
                    });
                }
            }

            // Create comment
            const result = await db.query(
                `INSERT INTO comments (id, task_id, user_id, text, mentions)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
                [uuidv4(), taskId, req.user.userId, text, JSON.stringify(mentions)]
            );

            // Create notifications for mentioned users
            for (const mention of mentions) {
                await db.query(
                    `INSERT INTO notifications (id, user_id, type, title, message, related_task_id, related_project_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        uuidv4(),
                        mention.user_id,
                        'comment_mention',
                        'You were mentioned in a comment',
                        `${req.user.userId} mentioned you in a comment`,
                        taskId,
                        taskCheck.rows[0].project_id
                    ]
                );
            }

            res.status(201).json({
                success: true,
                data: result.rows[0]
            });
        } catch (error) {
            console.error('Add comment error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to add comment'
            });
        }
    }

    // GET /api/v1/tasks/:id/comments
    async getComments(req, res) {
        try {
            const { id: taskId } = req.params;

            // Check access
            const accessCheck = await db.query(
                `SELECT t.id FROM tasks t
         INNER JOIN project_members pm ON t.project_id = pm.project_id
         WHERE t.id = $1 AND pm.user_id = $2 AND pm.status = 'accepted'`,
                [taskId, req.user.userId]
            );

            if (accessCheck.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    error: 'You do not have access to this task'
                });
            }

            const result = await db.query(
                `SELECT c.*, u.name as user_name, u.avatar_url
         FROM comments c
         INNER JOIN users u ON c.user_id = u.id
         WHERE c.task_id = $1
         ORDER BY c.created_at DESC`,
                [taskId]
            );

            res.json({
                success: true,
                data: result.rows
            });
        } catch (error) {
            console.error('Get comments error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get comments'
            });
        }
    }

    // PATCH /api/v1/comments/:id
    async updateComment(req, res) {
        try {
            const { id } = req.params;
            const { text } = req.body;

            if (!text || text.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Comment text is required'
                });
            }

            // Check if user is author
            const commentCheck = await db.query(
                'SELECT user_id FROM comments WHERE id = $1',
                [id]
            );

            if (commentCheck.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Comment not found'
                });
            }

            if (commentCheck.rows[0].user_id !== req.user.userId) {
                return res.status(403).json({
                    success: false,
                    error: 'Only comment author can update it'
                });
            }

            const result = await db.query(
                `UPDATE comments SET text = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
                [text, id]
            );

            res.json({
                success: true,
                data: result.rows[0]
            });
        } catch (error) {
            console.error('Update comment error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update comment'
            });
        }
    }

    // DELETE /api/v1/comments/:id
    async deleteComment(req, res) {
        try {
            const { id } = req.params;

            // Get comment details
            const commentResult = await db.query(
                `SELECT c.user_id, c.task_id, t.project_id, pm.role
         FROM comments c
         INNER JOIN tasks t ON c.task_id = t.id
         INNER JOIN project_members pm ON t.project_id = pm.project_id
         WHERE c.id = $1 AND pm.user_id = $2 AND pm.status = 'accepted'`,
                [id, req.user.userId]
            );

            if (commentResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Comment not found or access denied'
                });
            }

            const comment = commentResult.rows[0];
            const isAuthor = comment.user_id === req.user.userId;
            const isManager = ['owner', 'manager'].includes(comment.role);

            if (!isAuthor && !isManager) {
                return res.status(403).json({
                    success: false,
                    error: 'Only comment author or project manager can delete it'
                });
            }

            await db.query('DELETE FROM comments WHERE id = $1', [id]);

            res.json({
                success: true,
                message: 'Comment deleted successfully'
            });
        } catch (error) {
            console.error('Delete comment error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete comment'
            });
        }
    }
}

module.exports = new CommentController();