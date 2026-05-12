const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { logActivity, calculateRiskScore } = require('../utils/logger');
const { loginLimiter } = require('../middleware/rateLimiter');
const { sendPasswordReset } = require('../utils/mailer');

// Register
router.post('/register', [
    body('full_name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('phone').optional({ checkFalsy: true }).trim(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .withMessage('Password must contain uppercase, lowercase, number and special character (@$!%*?&)'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // Return the first error message so the frontend can display it
        return res.status(400).json({
            success: false,
            message: errors.array()[0].msg,
            errors: errors.array()
        });
    }

    const { full_name, email, phone, password } = req.body;

    try {
        const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: 'Email already registered' });
        }

        const salt = await bcrypt.genSalt(12);
        const password_hash = await bcrypt.hash(password, salt);
        const uuid = uuidv4();

        const [result] = await db.execute(
            'INSERT INTO users (uuid, full_name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)',
            [uuid, full_name, email, phone || null, password_hash]
        );

        await logActivity(result.insertId, 'USER_REGISTERED', `New user registered: ${email}`, req, 'low');

        res.status(201).json({ success: true, message: 'Account created successfully. Please log in.' });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
    }
});

// Login
router.post('/login', loginLimiter, [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Invalid credentials format' });
    }

    const { email, password } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    try {
        // Check for brute force
        const [recentFails] = await db.execute(
            `SELECT COUNT(*) as count FROM login_attempts 
             WHERE email = ? AND success = 0 AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
            [email]
        );

        if (recentFails[0].count >= 5) {
            await db.execute(
                'INSERT INTO login_attempts (email, ip_address, success, user_agent) VALUES (?, ?, 0, ?)',
                [email, ip, userAgent]
            );
            return res.status(429).json({ success: false, message: 'Account temporarily locked. Try again in 15 minutes.' });
        }

        const [users] = await db.execute(
            'SELECT * FROM users WHERE email = ? AND is_active = 1 AND is_blocked = 0',
            [email]
        );

        if (users.length === 0) {
            await db.execute(
                'INSERT INTO login_attempts (email, ip_address, success, user_agent) VALUES (?, ?, 0, ?)',
                [email, ip, userAgent]
            );
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            await db.execute(
                'INSERT INTO login_attempts (email, ip_address, success, user_agent) VALUES (?, ?, 0, ?)',
                [email, ip, userAgent]
            );
            await logActivity(user.id, 'LOGIN_FAILED', `Failed login attempt from IP: ${ip}`, req, 'medium');
            await calculateRiskScore(user.id);
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // Successful login
        await db.execute(
            'INSERT INTO login_attempts (email, ip_address, success, user_agent) VALUES (?, ?, 1, ?)',
            [email, ip, userAgent]
        );

        await db.execute('UPDATE users SET last_login = NOW(), last_activity_timestamp = NOW() WHERE id = ?', [user.id]);

        // Token expiry: admins get 8h, regular users get 24h
        const tokenExpiry = user.role === 'admin' ? '8h' : '24h';
        const token = jwt.sign(
            { userId: user.id, email: user.email, uuid: user.uuid, role: user.role || 'user' },
            process.env.JWT_SECRET,
            { expiresIn: tokenExpiry }
        );

        await logActivity(user.id, 'LOGIN_SUCCESS', `Successful login from IP: ${ip}`, req, 'low');

        // Determine redirect path based on role
        const redirectTo = user.role === 'admin' ? '/admin/dashboard' : '/dashboard';

        res.json({
            success: true,
            message: 'Login successful',
            token,
            redirectTo,
            user: {
                id: user.id,
                uuid: user.uuid,
                full_name: user.full_name,
                email: user.email,
                phone: user.phone,
                role: user.role || 'user',
                risk_score: user.risk_score
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
    }
});

// Logout
router.post('/logout', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            await logActivity(decoded.userId, 'LOGOUT', 'User logged out', req, 'low');
        } catch (e) {}
    }
    res.json({ success: true, message: 'Logged out successfully' });
});

// Get current user profile
router.get('/me', require('../middleware/auth').authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT id, uuid, full_name, email, phone, profile_picture, two_factor_enabled, last_login, last_activity_timestamp, risk_score, created_at FROM users WHERE id = ?',
            [req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, user: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch profile' });
    }
});

// Update profile
router.put('/profile', require('../middleware/auth').authenticateToken, [
    body('full_name').optional().trim().isLength({ min: 2, max: 100 }),
    body('phone').optional({ checkFalsy: true }).isMobilePhone(),
], async (req, res) => {
    const { full_name, phone } = req.body;
    try {
        await db.execute(
            'UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone) WHERE id = ?',
            [full_name || null, phone || null, req.user.id]
        );
        await logActivity(req.user.id, 'PROFILE_UPDATED', 'User updated profile', req, 'low');
        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Update failed' });
    }
});

// Change password
router.put('/change-password', require('../middleware/auth').authenticateToken, [
    body('current_password').notEmpty(),
    body('new_password').isLength({ min: 8 })
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .withMessage('Password must contain uppercase, lowercase, number and special character'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { current_password, new_password } = req.body;
    try {
        const [rows] = await db.execute('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
        const valid = await bcrypt.compare(current_password, rows[0].password_hash);
        if (!valid) return res.status(401).json({ success: false, message: 'Current password is incorrect' });

        const salt = await bcrypt.genSalt(12);
        const newHash = await bcrypt.hash(new_password, salt);
        await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);
        await logActivity(req.user.id, 'PASSWORD_CHANGED', 'User changed password', req, 'medium');
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Password change failed' });
    }
});

// Forgot Password — sends reset email
router.post('/forgot-password', [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
    }

    const { email } = req.body;

    try {
        // Always return success to prevent email enumeration attacks
        const [users] = await db.execute(
            'SELECT id, full_name, email FROM users WHERE email = ? AND is_active = 1',
            [email]
        );

        if (users.length === 0) {
            // Don't reveal whether email exists
            return res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
        }

        const user = users[0];

        // Generate secure token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Delete any existing reset tokens for this user
        await db.execute(
            'DELETE FROM password_reset_tokens WHERE user_id = ?',
            [user.id]
        );

        // Store the token
        await db.execute(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
            [user.id, token, expiresAt]
        );

        const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
        const resetUrl = `${BASE_URL}/reset-password?token=${token}`;

        await sendPasswordReset({
            userEmail: user.email,
            userName: user.full_name,
            resetUrl,
            expiresAt
        });

        await logActivity(user.id, 'PASSWORD_RESET_REQUESTED', `Password reset requested`, req, 'medium');

        res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ success: false, message: 'Failed to process request. Please try again.' });
    }
});

// Reset Password — verifies token and sets new password
router.post('/reset-password', [
    body('token').notEmpty().withMessage('Reset token required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .withMessage('Password must contain uppercase, lowercase, number and special character (@$!%*?&)'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { token, password } = req.body;

    try {
        // Find valid token
        const [tokens] = await db.execute(
            `SELECT prt.*, u.id as user_id, u.full_name, u.email
             FROM password_reset_tokens prt
             JOIN users u ON prt.user_id = u.id
             WHERE prt.token = ? AND prt.expires_at > NOW() AND prt.used = 0`,
            [token]
        );

        if (tokens.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'This reset link is invalid or has expired. Please request a new one.'
            });
        }

        const resetRecord = tokens[0];

        // Hash new password
        const salt = await bcrypt.genSalt(12);
        const password_hash = await bcrypt.hash(password, salt);

        // Update password
        await db.execute(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [password_hash, resetRecord.user_id]
        );

        // Mark token as used
        await db.execute(
            'UPDATE password_reset_tokens SET used = 1 WHERE token = ?',
            [token]
        );

        await logActivity(resetRecord.user_id, 'PASSWORD_RESET_COMPLETED', 'Password reset via email link', req, 'medium');

        res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ success: false, message: 'Failed to reset password. Please try again.' });
    }
});

// Verify reset token (GET — checks if token is still valid before showing form)
router.get('/verify-reset-token', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });

    try {
        const [tokens] = await db.execute(
            'SELECT id FROM password_reset_tokens WHERE token = ? AND expires_at > NOW() AND used = 0',
            [token]
        );
        if (tokens.length === 0) {
            return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired.' });
        }
        res.json({ success: true, message: 'Token is valid' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
});

module.exports = router;
