const db = require('../config/database');

class NotificationController {
    // GET /api/v1/notifications
    async listNotifications(req, res) {
        try {
            const { is_read, limit = 20 } = req.query;

            let query = `
        SELECT n.*, t.title as task_title, p.name as project_name
        FROM notifications n
        LEFT JOIN tasks t ON n.related_task_id = t.id
        LEFT JOIN projects p ON n.related_project_id = p.id
        WHERE n.user_id = $1
      `;

            const values = [req.user.userId];

            if (is_read !== undefined) {
                query += ` AND n.is_read = $2`;
                values.push(is_read === 'true');
            }

            query += ` ORDER BY n.created_at DESC LIMIT $${values.length + 1}`;
            values.push(parseInt(limit));

            const result = await db.query(query, values);

            // Get unread count
            const unreadResult = await db.query(
                'SELECT COUNT(*) as unread FROM notifications WHERE user_id = $1 AND is_read = false',
                [req.user.userId]
            );

            res.json({
                success: true,
                data: {
                    total: result.rows.length,
                    unread: parseInt(unreadResult.rows[0].unread),
                    notifications: result.rows
                }
            });
        } catch (error) {
            console.error('List notifications error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to list notifications'
            });
        }
    }

    // PATCH /api/v1/notifications/:id
    async markAsRead(req, res) {
        try {
            const { id } = req.params;

            const result = await db.query(
                `UPDATE notifications 
         SET is_read = true, read_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
                [id, req.user.userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Notification not found'
                });
            }

            res.json({
                success: true,
                data: result.rows[0]
            });
        } catch (error) {
            console.error('Mark notification as read error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to mark notification as read'
            });
        }
    }

    // PATCH /api/v1/notifications/mark-all-read
    async markAllAsRead(req, res) {
        try {
            await db.query(
                `UPDATE notifications 
         SET is_read = true, read_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND is_read = false`,
                [req.user.userId]
            );

            res.json({
                success: true,
                message: 'All notifications marked as read'
            });
        } catch (error) {
            console.error('Mark all as read error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to mark all notifications as read'
            });
        }
    }

    // DELETE /api/v1/notifications/:id
    async deleteNotification(req, res) {
        try {
            const { id } = req.params;

            const result = await db.query(
                'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
                [id, req.user.userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Notification not found'
                });
            }

            res.json({
                success: true,
                message: 'Notification deleted successfully'
            });
        } catch (error) {
            console.error('Delete notification error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete notification'
            });
        }
    }
}

module.exports = new NotificationController();