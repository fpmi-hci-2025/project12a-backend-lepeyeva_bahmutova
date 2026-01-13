const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

class AuthController {
    // POST /api/v1/auth/register
    async register(req, res) {
        try {
            const { email, password, name } = req.body;

            // Validate input
            if (!email || !password || !name) {
                return res.status(400).json({
                    success: false,
                    error: 'Email, password and name are required'
                });
            }

            // Check if user already exists
            const existingUser = await db.query(
                'SELECT id FROM users WHERE email = $1',
                [email.toLowerCase()]
            );

            if (existingUser.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Email is already registered'
                });
            }

            // Validate password strength
            if (password.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'Password must be at least 8 characters long'
                });
            }

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);

            // Create user
            const result = await db.query(
                `INSERT INTO users (id, email, password_hash, name)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, created_at`,
                [uuidv4(), email.toLowerCase(), passwordHash, name]
            );

            const user = result.rows[0];

            res.status(201).json({
                success: true,
                data: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    created_at: user.created_at
                }
            });
        } catch (error) {
            console.error('Register error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to register user'
            });
        }
    }

    // POST /api/v1/auth/login
    async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Email and password are required'
                });
            }

            // Find user
            const result = await db.query(
                'SELECT id, email, name, password_hash, is_active FROM users WHERE email = $1',
                [email.toLowerCase()]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid email or password'
                });
            }

            const user = result.rows[0];

            // Check if user is active
            if (!user.is_active) {
                return res.status(403).json({
                    success: false,
                    error: 'Account is deactivated'
                });
            }

            // Verify password
            const isValidPassword = await bcrypt.compare(password, user.password_hash);

            if (!isValidPassword) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid email or password'
                });
            }

            // Update last login
            await db.query(
                'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
                [user.id]
            );

            // Check if JWT_SECRET is set
            if (!process.env.JWT_SECRET) {
                console.error('JWT_SECRET is not set in environment variables');
                return res.status(500).json({
                    success: false,
                    error: 'Server configuration error'
                });
            }

            // Generate JWT token
            const token = jwt.sign(
                { userId: user.id, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
            );

            res.json({
                success: true,
                data: {
                    access_token: token,
                    token_type: 'Bearer',
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name
                    }
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            console.error('Error stack:', error.stack);
            res.status(500).json({
                success: false,
                error: 'Failed to login',
                ...(process.env.NODE_ENV === 'development' && { details: error.message })
            });
        }
    }

    // GET /api/v1/auth/me
    async getProfile(req, res) {
        try {
            const result = await db.query(
                `SELECT id, email, name, avatar_url, created_at, last_login_at
         FROM users WHERE id = $1`,
                [req.user.userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            res.json({
                success: true,
                data: result.rows[0]
            });
        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get profile'
            });
        }
    }

    // POST /api/v1/auth/forgot-password
    async forgotPassword(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({
                    success: false,
                    error: 'Email is required'
                });
            }

            // Find user
            const result = await db.query(
                'SELECT id, email, name FROM users WHERE email = $1',
                [email.toLowerCase()]
            );

            // Always return success to prevent email enumeration
            // In production, you would send an email with reset token here
            if (result.rows.length === 0) {
                return res.json({
                    success: true,
                    message: 'If the email exists, a password reset link has been sent'
                });
            }

            const user = result.rows[0];

            // Generate reset token (simple version for development)
            // In production, use crypto.randomBytes and store in DB with expiration
            const resetToken = jwt.sign(
                { userId: user.id, email: user.email, type: 'password_reset' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            // Store reset token in database (you might want to add a password_reset_tokens table)
            // For simplicity, we'll just return the token in development
            // In production, send it via email

            console.log(`Password reset token for ${user.email}: ${resetToken}`);
            console.log('⚠️  In production, send this token via email!');

            res.json({
                success: true,
                message: 'If the email exists, a password reset link has been sent',
                // Only in development - remove in production!
                ...(process.env.NODE_ENV === 'development' && {
                    resetToken: resetToken,
                    note: 'This token is only shown in development mode'
                })
            });
        } catch (error) {
            console.error('Forgot password error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to process password reset request'
            });
        }
    }

    // POST /api/v1/auth/reset-password
    async resetPassword(req, res) {
        try {
            const { token, newPassword } = req.body;

            if (!token || !newPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'Token and new password are required'
                });
            }

            if (newPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'Password must be at least 8 characters long'
                });
            }

            // Verify token
            let decoded;
            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET);
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid or expired reset token'
                });
            }

            // Check token type
            if (decoded.type !== 'password_reset') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid token type'
                });
            }

            // Find user
            const result = await db.query(
                'SELECT id FROM users WHERE id = $1 AND email = $2',
                [decoded.userId, decoded.email]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Hash new password
            const salt = await bcrypt.genSalt(10);
            const newPasswordHash = await bcrypt.hash(newPassword, salt);

            // Update password
            await db.query(
                'UPDATE users SET password_hash = $1 WHERE id = $2',
                [newPasswordHash, decoded.userId]
            );

            res.json({
                success: true,
                message: 'Password has been reset successfully'
            });
        } catch (error) {
            console.error('Reset password error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to reset password'
            });
        }
    }

    // POST /api/v1/auth/change-password
    async updateProfile(req, res) {
        try {
            const { name, email } = req.body;

            if (!name || name.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Name is required'
                });
            }

            if (email) {
                // Check if email is already taken by another user
                const existingUser = await db.query(
                    'SELECT id FROM users WHERE email = $1 AND id != $2',
                    [email.toLowerCase(), req.user.userId]
                );

                if (existingUser.rows.length > 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Email is already taken'
                    });
                }
            }

            // Update user profile
            const result = await db.query(
                'UPDATE users SET name = $1, email = COALESCE($2, email) WHERE id = $3 RETURNING id, email, name, updated_at',
                [name.trim(), email ? email.toLowerCase() : null, req.user.userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            res.json({
                success: true,
                data: result.rows[0],
                message: 'Profile updated successfully'
            });
        } catch (error) {
            console.error('Update profile error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update profile'
            });
        }
    }

    async changePassword(req, res) {
        try {
            const { current_password, new_password } = req.body;

            if (!current_password || !new_password) {
                return res.status(400).json({
                    success: false,
                    error: 'Current password and new password are required'
                });
            }

            if (new_password.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'New password must be at least 8 characters long'
                });
            }

            // Get current password hash
            const result = await db.query(
                'SELECT password_hash FROM users WHERE id = $1',
                [req.user.userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Verify current password
            const isValid = await bcrypt.compare(current_password, result.rows[0].password_hash);

            if (!isValid) {
                return res.status(401).json({
                    success: false,
                    error: 'Old password is incorrect'
                });
            }

            // Hash new password
            const salt = await bcrypt.genSalt(10);
            const newPasswordHash = await bcrypt.hash(new_password, salt);

            // Update password
            await db.query(
                'UPDATE users SET password_hash = $1 WHERE id = $2',
                [newPasswordHash, req.user.userId]
            );

            res.json({
                success: true,
                message: 'Password changed successfully'
            });
        } catch (error) {
            console.error('Change password error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to change password'
            });
        }
    }
}

module.exports = new AuthController();