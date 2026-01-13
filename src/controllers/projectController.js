const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('../config/database');

class ProjectController {
  // POST /api/v1/projects
  async createProject(req, res) {
    try {
      const { name, description } = req.body;

      if (!name || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Project name is required'
        });
      }

      if (name.length > 200) {
        return res.status(400).json({
          success: false,
          error: 'Project name is too long (max 200 characters)'
        });
      }

      const projectId = uuidv4();

      // Create project
      const projectResult = await db.query(
        `INSERT INTO projects (id, name, description, owner_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, description, owner_id, is_active, created_at`,
        [projectId, name, description || null, req.user.userId]
      );

      // Add owner as project member
      await db.query(
        `INSERT INTO project_members (id, project_id, user_id, role, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), projectId, req.user.userId, 'owner', 'accepted']
      );

      const project = projectResult.rows[0];

      res.status(201).json({
        success: true,
        data: {
          id: project.id,
          name: project.name,
          description: project.description,
          owner_id: project.owner_id,
          qr_code_token: null,
          is_active: project.is_active,
          created_at: project.created_at
        }
      });
    } catch (error) {
      console.error('Create project error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create project'
      });
    }
  }

  // GET /api/v1/projects
  async listProjects(req, res) {
    try {
      const result = await db.query(
        `SELECT DISTINCT p.id, p.name, p.description, p.owner_id, p.is_active,
                p.created_at, pm.role, u.name as owner_name
         FROM projects p
         INNER JOIN project_members pm ON p.id = pm.project_id
         LEFT JOIN users u ON p.owner_id = u.id
         WHERE pm.user_id = $1 AND pm.status = 'accepted'
         ORDER BY p.created_at DESC`,
        [req.user.userId]
      );

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('List projects error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list projects'
      });
    }
  }

  // GET /api/v1/projects/:id
  async getProject(req, res) {
    try {
      const { id } = req.params;

      // Check if user is project member
      const memberCheck = await db.query(
        `SELECT role FROM project_members 
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
        `SELECT p.*, u.name as owner_name, u.email as owner_email
         FROM projects p
         LEFT JOIN users u ON p.owner_id = u.id
         WHERE p.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        });
      }

      // Get member count
      const memberCountResult = await db.query(
        `SELECT COUNT(*) as member_count FROM project_members 
         WHERE project_id = $1 AND status = 'accepted'`,
        [id]
      );

      const project = {
        ...result.rows[0],
        member_count: parseInt(memberCountResult.rows[0].member_count),
        user_role: memberCheck.rows[0].role
      };

      res.json({
        success: true,
        data: project
      });
    } catch (error) {
      console.error('Get project error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get project'
      });
    }
  }

  // PATCH /api/v1/projects/:id
  async updateProject(req, res) {
    try {
      const { id } = req.params;
      const { name, description } = req.body;

      // Check if user is owner
      const ownerCheck = await db.query(
        'SELECT owner_id FROM projects WHERE id = $1',
        [id]
      );

      if (ownerCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        });
      }

      if (ownerCheck.rows[0].owner_id !== req.user.userId) {
        return res.status(403).json({
          success: false,
          error: 'Only project owner can update project'
        });
      }

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount++}`);
        values.push(name);
      }

      if (description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        values.push(description);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No fields to update'
        });
      }

      values.push(id);

      const result = await db.query(
        `UPDATE projects SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramCount}
         RETURNING *`,
        values
      );

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Update project error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update project'
      });
    }
  }

  // POST /api/v1/projects/:id/generate-qr
  async generateQRCode(req, res) {
    try {
      const { id } = req.params;

      // Check if user is owner
      const ownerCheck = await db.query(
        'SELECT owner_id FROM projects WHERE id = $1',
        [id]
      );

      if (ownerCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        });
      }

      if (ownerCheck.rows[0].owner_id !== req.user.userId) {
        return res.status(403).json({
          success: false,
          error: 'Only project owner can generate QR code'
        });
      }

      // Generate unique QR token
      const qrToken = `proj_qr_${crypto.randomBytes(16).toString('hex')}`;

      // Calculate expiry date (30 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(process.env.QR_CODE_EXPIRY_DAYS || 30));

      // Update project with QR token
      await db.query(
        'UPDATE projects SET qr_code_token = $1 WHERE id = $2',
        [qrToken, id]
      );

      // Generate QR code image (base64)
      const qrCodeDataURL = await QRCode.toDataURL(qrToken, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });

      res.json({
        success: true,
        data: {
          project_id: id,
          qr_code_token: qrToken,
          qr_code_url: qrCodeDataURL,
          expires_at: expiresAt.toISOString()
        }
      });
    } catch (error) {
      console.error('Generate QR code error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate QR code'
      });
    }
  }

  // POST /api/v1/projects/join-qr
  async joinProjectViaQR(req, res) {
    try {
      const { qr_code_token } = req.body;

      if (!qr_code_token) {
        return res.status(400).json({
          success: false,
          error: 'QR code token is required'
        });
      }

      // Find project by QR token
      const projectResult = await db.query(
        'SELECT id, name, owner_id FROM projects WHERE qr_code_token = $1 AND is_active = true',
        [qr_code_token]
      );

      if (projectResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Invalid or expired QR code'
        });
      }

      const project = projectResult.rows[0];

      // Check if user is already a member
      const existingMember = await db.query(
        'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
        [project.id, req.user.userId]
      );

      if (existingMember.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'You are already a member of this project'
        });
      }

      // Add user as participant
      const result = await db.query(
        `INSERT INTO project_members (id, project_id, user_id, role, status, invited_by_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING joined_at`,
        [uuidv4(), project.id, req.user.userId, 'participant', 'accepted', project.owner_id]
      );

      res.status(201).json({
        success: true,
        data: {
          project_id: project.id,
          project_name: project.name,
          user_id: req.user.userId,
          role: 'participant',
          joined_at: result.rows[0].joined_at
        }
      });
    } catch (error) {
      console.error('Join project via QR error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to join project'
      });
    }
  }

  // GET /api/v1/projects/:id/members
  async listProjectMembers(req, res) {
    try {
      const { id } = req.params;

      // Check if user is project member
      const memberCheck = await db.query(
        'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2 AND status = $3',
        [id, req.user.userId, 'accepted']
      );

      if (memberCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'You are not a member of this project'
        });
      }

      const result = await db.query(
        `SELECT pm.id, pm.role, pm.joined_at, pm.status,
                u.id as user_id, u.name, u.email, u.avatar_url
         FROM project_members pm
         INNER JOIN users u ON pm.user_id = u.id
         WHERE pm.project_id = $1
         ORDER BY pm.joined_at ASC`,
        [id]
      );

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('List project members error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list project members'
      });
    }
  }

  // POST /api/v1/projects/:id/invite
  async inviteMember(req, res) {
    try {
      const { id } = req.params;
      const { email, role = 'participant' } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'Email is required'
        });
      }

      // Check if current user is manager or owner
      const roleCheck = await db.query(
        `SELECT role FROM project_members 
         WHERE project_id = $1 AND user_id = $2 AND status = 'accepted'`,
        [id, req.user.userId]
      );

      if (roleCheck.rows.length === 0 || 
          !['owner', 'manager'].includes(roleCheck.rows[0].role)) {
        return res.status(403).json({
          success: false,
          error: 'Only project owner or manager can invite members'
        });
      }

      // Find user by email
      const userResult = await db.query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const invitedUserId = userResult.rows[0].id;

      // Check if already a member
      const existingMember = await db.query(
        'SELECT id, status FROM project_members WHERE project_id = $1 AND user_id = $2',
        [id, invitedUserId]
      );

      if (existingMember.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'User is already invited or a member'
        });
      }

      // Create invitation
      await db.query(
        `INSERT INTO project_members (id, project_id, user_id, role, status, invited_by_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), id, invitedUserId, role, 'invited', req.user.userId]
      );

      res.status(201).json({
        success: true,
        message: 'Invitation sent successfully'
      });
    } catch (error) {
      console.error('Invite member error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to invite member'
      });
    }
  }

  // GET /api/v1/projects/:id/tasks
  async listProjectTasks(req, res) {
    try {
      const { id } = req.params;

      // Проверка, что пользователь участник проекта
      const memberCheck = await db.query(
        'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2 AND status = $3',
        [id, req.user.userId, 'accepted']
      );

      if (memberCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'You are not a member of this project'
        });
      }

      // Получаем задачи проекта
      const result = await db.query(
        `SELECT t.*, 
                u1.name as assignee_name,
                u2.name as created_by_name
        FROM tasks t
        LEFT JOIN users u1 ON t.assignee_id = u1.id
        LEFT JOIN users u2 ON t.created_by_id = u2.id
        WHERE t.project_id = $1
        ORDER BY t.created_at DESC`,
        [id]
      );

      res.json({
        success: true,
        data: {
          tasks: result.rows
        }
      });
    } catch (error) {
      console.error('List project tasks error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list project tasks'
      });
    }
  }
}

module.exports = new ProjectController();