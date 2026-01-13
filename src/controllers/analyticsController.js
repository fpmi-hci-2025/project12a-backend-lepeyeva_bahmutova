const db = require('../config/database');

class AnalyticsController {
    // GET /api/v1/projects/:id/dashboard
    async getProjectDashboard(req, res) {
        try {
            const { id: projectId } = req.params;

            // Check if user is owner or manager
            const roleCheck = await db.query(
                `SELECT role FROM project_members 
         WHERE project_id = $1 AND user_id = $2 AND status = 'accepted'`,
                [projectId, req.user.userId]
            );

            if (roleCheck.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }

            const role = roleCheck.rows[0].role;
            if (!['owner', 'manager'].includes(role)) {
                return res.status(403).json({
                    success: false,
                    error: 'Only project owner or manager can view dashboard'
                });
            }

            // Get total tasks
            const totalTasksResult = await db.query(
                'SELECT COUNT(*) as total FROM tasks WHERE project_id = $1',
                [projectId]
            );

            // Get completed tasks
            const completedTasksResult = await db.query(
                `SELECT COUNT(*) as completed FROM tasks 
         WHERE project_id = $1 AND status = 'done'`,
                [projectId]
            );

            const totalTasks = parseInt(totalTasksResult.rows[0].total);
            const completedTasks = parseInt(completedTasksResult.rows[0].completed);
            const completionRate = totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : 0;

            // Tasks by status
            const tasksByStatusResult = await db.query(
                `SELECT status, COUNT(*) as count 
         FROM tasks WHERE project_id = $1 
         GROUP BY status`,
                [projectId]
            );

            const tasksByStatus = {};
            tasksByStatusResult.rows.forEach(row => {
                tasksByStatus[row.status] = parseInt(row.count);
            });

            // Tasks by priority
            const tasksByPriorityResult = await db.query(
                `SELECT priority, COUNT(*) as count 
         FROM tasks WHERE project_id = $1 
         GROUP BY priority`,
                [projectId]
            );

            const tasksByPriority = {};
            tasksByPriorityResult.rows.forEach(row => {
                tasksByPriority[row.priority] = parseInt(row.count);
            });

            // Tasks by type
            const tasksByTypeResult = await db.query(
                `SELECT task_type, COUNT(*) as count 
         FROM tasks WHERE project_id = $1 
         GROUP BY task_type`,
                [projectId]
            );

            const tasksByType = {};
            tasksByTypeResult.rows.forEach(row => {
                tasksByType[row.task_type] = parseInt(row.count);
            });

            // Team productivity
            const teamProductivityResult = await db.query(
                `SELECT u.id as user_id, u.name, 
                COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_tasks,
                AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at))/3600) as avg_time_hours
         FROM users u
         INNER JOIN project_members pm ON u.id = pm.user_id
         LEFT JOIN tasks t ON u.id = t.assignee_id AND t.project_id = $1
         WHERE pm.project_id = $1 AND pm.status = 'accepted'
         GROUP BY u.id, u.name
         ORDER BY completed_tasks DESC`,
                [projectId]
            );

            // Average completion time
            const avgCompletionResult = await db.query(
                `SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600) as avg_hours
         FROM tasks 
         WHERE project_id = $1 AND status = 'done' AND completed_at IS NOT NULL`,
                [projectId]
            );

            const averageCompletionTime = avgCompletionResult.rows[0].avg_hours
                ? parseFloat(avgCompletionResult.rows[0].avg_hours).toFixed(1)
                : 0;

            // Velocity (tasks completed per week)
            const velocityResult = await db.query(
                `SELECT COUNT(*) as count
         FROM tasks 
         WHERE project_id = $1 
         AND status = 'done' 
         AND completed_at >= NOW() - INTERVAL '7 days'`,
                [projectId]
            );

            res.json({
                success: true,
                data: {
                    project_id: projectId,
                    total_tasks: totalTasks,
                    completed_tasks: completedTasks,
                    completion_rate: parseFloat(completionRate),
                    tasks_by_status: tasksByStatus,
                    tasks_by_priority: tasksByPriority,
                    tasks_by_type: tasksByType,
                    team_productivity: teamProductivityResult.rows.map(row => ({
                        user_id: row.user_id,
                        name: row.name,
                        completed_tasks: parseInt(row.completed_tasks),
                        average_time_to_complete: row.avg_time_hours ? parseFloat(row.avg_time_hours).toFixed(1) : 0
                    })),
                    average_completion_time: parseFloat(averageCompletionTime),
                    velocity: parseFloat(velocityResult.rows[0].count)
                }
            });
        } catch (error) {
            console.error('Get project dashboard error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get project dashboard'
            });
        }
    }

    // GET /api/v1/projects/:id/burndown
    async getBurndownChart(req, res) {
        try {
            const { id: projectId } = req.params;

            // Check access
            const roleCheck = await db.query(
                `SELECT role FROM project_members 
         WHERE project_id = $1 AND user_id = $2 AND status = 'accepted'`,
                [projectId, req.user.userId]
            );

            if (roleCheck.rows.length === 0 || !['owner', 'manager'].includes(roleCheck.rows[0].role)) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }

            // Get burndown data for last 30 days
            const burndownResult = await db.query(
                `SELECT 
           DATE(created_at) as date,
           COUNT(*) as tasks_created,
           COUNT(CASE WHEN status = 'done' THEN 1 END) as tasks_completed
         FROM tasks
         WHERE project_id = $1 
         AND created_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
                [projectId]
            );

            res.json({
                success: true,
                data: burndownResult.rows
            });
        } catch (error) {
            console.error('Get burndown chart error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get burndown chart'
            });
        }
    }

    // POST /api/v1/projects/:id/export
    async exportReport(req, res) {
        try {
            const { id: projectId } = req.params;
            const { format = 'json' } = req.body;

            // Check access
            const roleCheck = await db.query(
                `SELECT role FROM project_members 
         WHERE project_id = $1 AND user_id = $2 AND status = 'accepted'`,
                [projectId, req.user.userId]
            );

            if (roleCheck.rows.length === 0 || !['owner', 'manager'].includes(roleCheck.rows[0].role)) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }

            // Get all tasks
            const tasksResult = await db.query(
                `SELECT t.*, 
                u1.name as assignee_name,
                u2.name as created_by_name
         FROM tasks t
         LEFT JOIN users u1 ON t.assignee_id = u1.id
         LEFT JOIN users u2 ON t.created_by_id = u2.id
         WHERE t.project_id = $1
         ORDER BY t.created_at DESC`,
                [projectId]
            );

            if (format === 'json') {
                res.json({
                    success: true,
                    data: {
                        exported_at: new Date().toISOString(),
                        project_id: projectId,
                        tasks: tasksResult.rows
                    }
                });
            } else if (format === 'csv') {
                // Generate CSV
                const headers = ['ID', 'Title', 'Status', 'Priority', 'Type', 'Assignee', 'Created By', 'Created At', 'Due Date'];
                const rows = tasksResult.rows.map(task => [
                    task.id,
                    task.title,
                    task.status,
                    task.priority,
                    task.task_type,
                    task.assignee_name || 'Unassigned',
                    task.created_by_name,
                    task.created_at,
                    task.due_date || 'No deadline'
                ]);

                const csv = [headers, ...rows].map(row => row.join(',')).join('\n');

                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="project_${projectId}_export.csv"`);
                res.send(csv);
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'Unsupported format. Use json or csv'
                });
            }
        } catch (error) {
            console.error('Export report error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to export report'
            });
        }
    }
}

module.exports = new AnalyticsController();