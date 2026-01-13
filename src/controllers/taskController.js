const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

class TaskController {
  // POST /api/v1/tasks
  async createTask(req, res) {
    try {
      const {
        project_id,
        title,
        description,
        status = 'new',
        priority = 'medium',
        task_type = 'task',
        assignee_id,
        due_date,
        estimated_hours
      } = req.body;


      // If no assignee specified, assign to creator
      const finalAssigneeId = assignee_id || req.user.userId;

      if (!project_id || !title) {
        return res.status(400).json({
          success: false,
          error: 'Project ID and title are required'
        });
      }

      // Check if user is project member
      const memberCheck = await db.query(
        `SELECT role FROM project_members
         WHERE project_id = $1 AND user_id = $2 AND status = 'accepted'`,
        [project_id, req.user.userId]
      );

      if (memberCheck.rows.length === 0) {
        console.log('User is not a member of this project');
        return res.status(403).json({
          success: false,
          error: 'You are not a member of this project'
        });
      }

      // Create task
      const result = await db.query(
        `INSERT INTO tasks
         (id, project_id, title, description, status, priority, task_type,
          assignee_id, created_by_id, due_date, estimated_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          uuidv4(),
          project_id,
          title,
          description || null,
          status,
          priority,
          task_type,
          finalAssigneeId,
          req.user.userId,
          due_date || null,
          estimated_hours || null
        ]
      );

      // Create notification if task is assigned
      if (assignee_id && assignee_id !== req.user.userId) {
        await db.query(
          `INSERT INTO notifications 
           (id, user_id, type, title, message, related_task_id, related_project_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            uuidv4(),
            assignee_id,
            'task_assigned',
            'New task assigned',
            `Task "${title}" has been assigned to you`,
            result.rows[0].id,
            project_id
          ]
        );
      }

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Create task error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create task'
      });
    }
  }

  // GET /api/v1/tasks
  async listTasks(req, res) {
    try {
      const {
        project_id,
        status,
        priority,
        type,
        assignee_id,
        due_date_from,
        due_date_to,
        page = 1,
        limit = 20
      } = req.query;

      const conditions = [];
      const values = [];
      let paramCount = 1;

      // Build WHERE clause
      if (project_id) {
        conditions.push(`t.project_id = $${paramCount++}`);
        values.push(project_id);
      }

      if (status) {
        conditions.push(`t.status = $${paramCount++}`);
        values.push(status);
      }

      if (priority) {
        conditions.push(`t.priority = $${paramCount++}`);
        values.push(priority);
      }

      if (type) {
        conditions.push(`t.task_type = $${paramCount++}`);
        values.push(type);
      }

      if (assignee_id) {
        conditions.push(`t.assignee_id = $${paramCount++}`);
        values.push(assignee_id);
      }

      if (due_date_from) {
        conditions.push(`t.due_date >= $${paramCount++}`);
        values.push(due_date_from);
      }

      if (due_date_to) {
        conditions.push(`t.due_date <= $${paramCount++}`);
        values.push(due_date_to);
      }

      // Check user has access to projects
      conditions.push(`EXISTS (
        SELECT 1 FROM project_members pm 
        WHERE pm.project_id = t.project_id 
        AND pm.user_id = $${paramCount++} 
        AND pm.status = 'accepted'
      )`);
      values.push(req.user.userId);

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Count total
      const countResult = await db.query(
        `SELECT COUNT(*) as total FROM tasks t ${whereClause}`,
        values
      );

      const total = parseInt(countResult.rows[0].total);

      // Get tasks with pagination
      const offset = (page - 1) * limit;
      values.push(limit, offset);

      const result = await db.query(
        `SELECT t.*, 
                u1.name as assignee_name,
                u2.name as created_by_name,
                p.name as project_name
         FROM tasks t
         LEFT JOIN users u1 ON t.assignee_id = u1.id
         LEFT JOIN users u2 ON t.created_by_id = u2.id
         LEFT JOIN projects p ON t.project_id = p.id
         ${whereClause}
         ORDER BY t.created_at DESC
         LIMIT $${paramCount++} OFFSET $${paramCount++}`,
        values
      );

      res.json({
        success: true,
        data: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          tasks: result.rows
        }
      });
    } catch (error) {
      console.error('List tasks error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list tasks'
      });
    }
  }

  // GET /api/v1/tasks/:id
  async getTask(req, res) {
    try {
      const { id } = req.params;

      const result = await db.query(
        `SELECT t.*, 
                u1.name as assignee_name, u1.email as assignee_email,
                u2.name as created_by_name, u2.email as created_by_email,
                p.name as project_name
         FROM tasks t
         LEFT JOIN users u1 ON t.assignee_id = u1.id
         LEFT JOIN users u2 ON t.created_by_id = u2.id
         LEFT JOIN projects p ON t.project_id = p.id
         WHERE t.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Task not found'
        });
      }

      const task = result.rows[0];

      // Check if user is project member
      const memberCheck = await db.query(
        `SELECT role FROM project_members 
         WHERE project_id = $1 AND user_id = $2 AND status = 'accepted'`,
        [task.project_id, req.user.userId]
      );

      if (memberCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'You do not have access to this task'
        });
      }

      res.json({
        success: true,
        data: task
      });
    } catch (error) {
      console.error('Get task error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get task'
      });
    }
  }

  // PATCH /api/v1/tasks/:id
  async updateTask(req, res) {
    try {
      const { id } = req.params;
      const {
        title,
        description,
        priority,
        task_type,
        due_date,
        estimated_hours
      } = req.body;

      // Get task and check permissions
      const taskResult = await db.query(
        `SELECT t.*, pm.role 
         FROM tasks t
         INNER JOIN project_members pm ON t.project_id = pm.project_id
         WHERE t.id = $1 AND pm.user_id = $2 AND pm.status = 'accepted'`,
        [id, req.user.userId]
      );

      if (taskResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Task not found or access denied'
        });
      }

      const task = taskResult.rows[0];
      const isCreator = task.created_by_id === req.user.userId;
      const isManager = ['owner', 'manager'].includes(task.role);

      if (!isCreator && !isManager) {
        return res.status(403).json({
          success: false,
          error: 'Only task creator or project manager can update task'
        });
      }

      // Build update query
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (title !== undefined) {
        updates.push(`title = $${paramCount++}`);
        values.push(title);
      }

      if (description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        values.push(description);
      }

      if (priority !== undefined) {
        updates.push(`priority = $${paramCount++}`);
        values.push(priority);
      }

      if (task_type !== undefined) {
        updates.push(`task_type = $${paramCount++}`);
        values.push(task_type);
      }

      if (due_date !== undefined) {
        updates.push(`due_date = $${paramCount++}`);
        values.push(due_date);
      }

      if (estimated_hours !== undefined) {
        updates.push(`estimated_hours = $${paramCount++}`);
        values.push(estimated_hours);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No fields to update'
        });
      }

      values.push(id);

      const result = await db.query(
        `UPDATE tasks SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramCount}
         RETURNING *`,
        values
      );

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Update task error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update task'
      });
    }
  }

  // PATCH /api/v1/tasks/:id/status
  async changeTaskStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['new', 'in_progress', 'review', 'done'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status'
        });
      }

      // Get task and check permissions
      const taskResult = await db.query(
        `SELECT t.*, pm.role 
         FROM tasks t
         INNER JOIN project_members pm ON t.project_id = pm.project_id
         WHERE t.id = $1 AND pm.user_id = $2 AND pm.status = 'accepted'`,
        [id, req.user.userId]
      );

      if (taskResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Task not found or access denied'
        });
      }

      const task = taskResult.rows[0];
      const isAssignee = task.assignee_id === req.user.userId;
      const isCreator = task.created_by_id === req.user.userId;
      const isManager = ['owner', 'manager'].includes(task.role);

      if (!isAssignee && !isCreator && !isManager) {
        return res.status(403).json({
          success: false,
          error: 'Only assignee, creator or manager can change task status'
        });
      }

      // Update status
      const completedAt = status === 'done' ? 'CURRENT_TIMESTAMP' : 'NULL';

      const result = await db.query(
        `UPDATE tasks 
         SET status = $1, completed_at = ${completedAt}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [status, id]
      );

      res.json({
        success: true,
        data: {
          id: result.rows[0].id,
          status: result.rows[0].status,
          updated_at: result.rows[0].updated_at
        }
      });
    } catch (error) {
      console.error('Change task status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to change task status'
      });
    }
  }

  // PATCH /api/v1/tasks/:id/assign
  async assignTask(req, res) {
    try {
      const { id } = req.params;
      const { assignee_id } = req.body;

      // Check if current user is manager or owner
      const taskResult = await db.query(
        `SELECT t.project_id, pm.role 
         FROM tasks t
         INNER JOIN project_members pm ON t.project_id = pm.project_id
         WHERE t.id = $1 AND pm.user_id = $2 AND pm.status = 'accepted'`,
        [id, req.user.userId]
      );

      if (taskResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Task not found or access denied'
        });
      }

      const isManager = ['owner', 'manager'].includes(taskResult.rows[0].role);

      if (!isManager) {
        return res.status(403).json({
          success: false,
          error: 'Only project manager or owner can assign tasks'
        });
      }

      // Check if assignee is project member
      if (assignee_id) {
        const assigneeCheck = await db.query(
          `SELECT id FROM project_members 
           WHERE project_id = $1 AND user_id = $2 AND status = 'accepted'`,
          [taskResult.rows[0].project_id, assignee_id]
        );

        if (assigneeCheck.rows.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'Assignee is not a member of this project'
          });
        }
      }

      // Update assignee
      const result = await db.query(
        `UPDATE tasks SET assignee_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [assignee_id || null, id]
      );

      // Create notification
      if (assignee_id) {
        await db.query(
          `INSERT INTO notifications 
           (id, user_id, type, title, message, related_task_id, related_project_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            uuidv4(),
            assignee_id,
            'task_assigned',
            'Task assigned to you',
            `Task "${result.rows[0].title}" has been assigned to you`,
            id,
            taskResult.rows[0].project_id
          ]
        );
      }

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Assign task error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to assign task'
      });
    }
  }

  // GET /api/v1/tasks/my-tasks
  async listMyTasks(req, res) {
    try {
      const { status, priority } = req.query;

      const conditions = ['t.assignee_id = $1'];
      const values = [req.user.userId];
      let paramCount = 2;

      if (status) {
        conditions.push(`t.status = $${paramCount++}`);
        values.push(status);
      }

      if (priority) {
        conditions.push(`t.priority = $${paramCount++}`);
        values.push(priority);
      }

      const result = await db.query(
        `SELECT t.*, p.name as project_name, u.name as created_by_name
         FROM tasks t
         LEFT JOIN projects p ON t.project_id = p.id
         LEFT JOIN users u ON t.created_by_id = u.id
         WHERE ${conditions.join(' AND ')}
         ORDER BY
           CASE t.priority
             WHEN 'critical' THEN 1
             WHEN 'high' THEN 2
             WHEN 'medium' THEN 3
             WHEN 'low' THEN 4
           END,
           t.due_date ASC NULLS LAST,
           t.created_at DESC`,
        values
      );


      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('List my tasks error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list your tasks'
      });
    }
  }

  // GET /api/v1/projects/:id/kanban
  async getKanbanBoard(req, res) {
    try {
      const { id } = req.params;

      // Check if user is project member
      const memberCheck = await db.query(
        `SELECT id FROM project_members 
         WHERE project_id = $1 AND user_id = $2 AND status = 'accepted'`,
        [id, req.user.userId]
      );

      if (memberCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'You are not a member of this project'
        });
      }

      const result = await db.query(
        `SELECT t.*, u.name as assignee_name, u.avatar_url as assignee_avatar
         FROM tasks t
         LEFT JOIN users u ON t.assignee_id = u.id
         WHERE t.project_id = $1
         ORDER BY t.created_at ASC`,
        [id]
      );

      // Group by status
      const columns = [
        { status: 'new', title: 'Новые', tasks: [] },
        { status: 'in_progress', title: 'В работе', tasks: [] },
        { status: 'review', title: 'На проверке', tasks: [] },
        { status: 'done', title: 'Готово', tasks: [] }
      ];

      result.rows.forEach(task => {
        const column = columns.find(c => c.status === task.status);
        if (column) {
          column.tasks.push({
            id: task.id,
            title: task.title,
            priority: task.priority,
            task_type: task.task_type,
            due_date: task.due_date,
            assignee: task.assignee_id ? {
              id: task.assignee_id,
              name: task.assignee_name,
              avatar_url: task.assignee_avatar
            } : null
          });
        }
      });

      columns.forEach(column => {
        column.count = column.tasks.length;
      });

      res.json({
        success: true,
        data: {
          project_id: id,
          columns
        }
      });
    } catch (error) {
      console.error('Get kanban board error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get kanban board'
      });
    }
  }

  // DELETE /api/v1/tasks/:id
  async deleteTask(req, res) {
    try {
      const { id } = req.params;

      // Получаем задачу и роль пользователя в проекте
      const taskResult = await db.query(
        `SELECT t.created_by_id, pm.role, t.project_id
        FROM tasks t
        INNER JOIN project_members pm ON t.project_id = pm.project_id
        WHERE t.id = $1 AND pm.user_id = $2 AND pm.status = 'accepted'`,
        [id, req.user.userId]
      );

      if (taskResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Task not found or access denied'
        });
      }

      const task = taskResult.rows[0];
      const isCreator = task.created_by_id === req.user.userId;
      const isManager = ['owner', 'manager'].includes(task.role);

      if (!isCreator && !isManager) {
        return res.status(403).json({
          success: false,
          error: 'Only task creator or project manager can delete this task'
        });
      }

      // Удаляем задачу
      const deleteResult = await db.query(
        `DELETE FROM tasks
        WHERE id = $1
        RETURNING id`,
        [id]
      );

      if (deleteResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Task not found'
        });
      }

      res.json({
        success: true,
        message: 'Task deleted successfully'
      });
    } catch (error) {
      console.error('Delete task error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete task'
      });
    }
  }
}

module.exports = new TaskController();