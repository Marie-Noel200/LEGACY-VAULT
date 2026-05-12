const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { logActivity } = require('../utils/logger');

// ── ADMIN AUTH MIDDLEWARE ──────────────────────────────────────
const adminAuth = async (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Admin token required' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Role must be admin in the JWT payload (set at login time)
        if (decoded.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin access required' });
        const [rows] = await db.execute(
            'SELECT id, uuid, full_name, email, role FROM users WHERE id = ? AND role = "admin" AND is_active = 1 AND is_blocked = 0',
            [decoded.userId]
        );
        if (!rows.length) return res.status(403).json({ success: false, message: 'Admin access required' });
        req.admin = rows[0];
        next();
    } catch (e) {
        return res.status(401).json({ success: false, message: 'Invalid admin token' });
    }
};

// Log admin action
const logAdmin = async (adminId, action, targetType, targetId, details, req) => {
    const ip = req ? (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown') : 'system';
    await db.execute(
        'INSERT INTO admin_logs (admin_id, action, target_type, target_id, details, ip_address) VALUES (?,?,?,?,?,?)',
        [adminId, action, targetType || 'system', targetId || null, details || null, ip]
    );
};

// ── DASHBOARD STATS ────────────────────────────────────────────
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const [[users]] = await db.execute(`SELECT COUNT(*) as total, 
            SUM(CASE WHEN is_blocked = 1 THEN 1 ELSE 0 END) as blocked,
            SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as regular 
            FROM users WHERE role != 'admin'`);
        const [[docs]] = await db.execute('SELECT COUNT(*) as total FROM documents WHERE is_deleted = 0');
        const [[requests]] = await db.execute(`SELECT COUNT(*) as total, 
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending 
            FROM access_requests`);
        const [[flags]] = await db.execute("SELECT COUNT(*) as total FROM flagged_activities WHERE status = 'open'");
        const [[logins]] = await db.execute(`SELECT 
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success 
            FROM login_attempts WHERE attempted_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`);
        const [[activeUsers]] = await db.execute("SELECT COUNT(*) as cnt FROM users WHERE role='user' AND last_activity_timestamp > DATE_SUB(NOW(), INTERVAL 30 DAY)");
        const [[inactiveUsers]] = await db.execute("SELECT COUNT(*) as cnt FROM users WHERE role='user' AND (last_activity_timestamp IS NULL OR last_activity_timestamp < DATE_SUB(NOW(), INTERVAL 30 DAY))");

        res.json({
            success: true,
            stats: {
                total_users: users.total || 0,
                blocked_users: users.blocked || 0,
                regular_users: users.regular || 0,
                total_documents: docs.total || 0,
                total_requests: requests.total || 0,
                pending_requests: requests.pending || 0,
                open_flags: flags.total || 0,
                failed_logins_24h: logins.failed || 0,
                success_logins_24h: logins.success || 0,
                active_users: activeUsers.cnt || 0,
                inactive_users: inactiveUsers.cnt || 0
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
});

// ── DASHBOARD (combined stats + suspicious users + recent logs) ─
router.get('/dashboard', adminAuth, async (req, res) => {
    try {
        const [[users]] = await db.execute(`SELECT COUNT(*) as total,
            SUM(CASE WHEN is_blocked = 1 THEN 1 ELSE 0 END) as blocked,
            SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as regular_users
            FROM users WHERE role != 'admin'`);
        const [[docs]] = await db.execute('SELECT COUNT(*) as total FROM documents WHERE is_deleted = 0');
        const [[flags]] = await db.execute("SELECT COUNT(*) as total FROM flagged_activities WHERE status = 'open'");
        const [[requests]] = await db.execute("SELECT SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending FROM access_requests");
        const [[logins]] = await db.execute(`SELECT
            SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as success
            FROM login_attempts WHERE attempted_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`);
        const [[activeU]] = await db.execute("SELECT COUNT(*) as cnt FROM users WHERE role='user' AND last_activity_timestamp > DATE_SUB(NOW(), INTERVAL 30 DAY)");
        const [[inactiveU]] = await db.execute("SELECT COUNT(*) as cnt FROM users WHERE role='user' AND (last_activity_timestamp IS NULL OR last_activity_timestamp < DATE_SUB(NOW(), INTERVAL 30 DAY))");
        const [[totalLogs]] = await db.execute('SELECT COUNT(*) as cnt FROM activity_logs');
        const [[highRisk]] = await db.execute("SELECT COUNT(*) as cnt FROM activity_logs WHERE risk_level IN ('high','critical')");

        // Suspicious users (risk_score > 30)
        const [suspiciousUsers] = await db.execute(`
            SELECT id, full_name, email, risk_score, is_blocked,
                CASE WHEN last_activity_timestamp > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 'active' ELSE 'inactive' END as activity_status
            FROM users WHERE role='user' AND risk_score > 30
            ORDER BY risk_score DESC LIMIT 5`);

        // Recent logs
        const [recentLogs] = await db.execute(`
            SELECT al.action, al.risk_level, al.timestamp, u.full_name, u.email
            FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.timestamp DESC LIMIT 10`);

        res.json({
            success: true,
            stats: {
                regular_users: users.regular_users || 0,
                blocked_users: users.blocked || 0,
                inactive_users: inactiveU.cnt || 0,
                open_flags: flags.total || 0,
                total_docs: docs.total || 0,
                high_risk: highRisk.cnt || 0,
                pending_requests: requests.pending || 0,
                total_logs: totalLogs.cnt || 0,
                failed_logins_24h: logins.failed || 0,
                active_users: activeU.cnt || 0
            },
            suspicious_users: suspiciousUsers,
            recent_logs: recentLogs
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch dashboard data' });
    }
});

// ── ALL USERS ──────────────────────────────────────────────────
router.get('/users', adminAuth, async (req, res) => {
    try {
        const [users] = await db.execute(`
            SELECT u.id, u.uuid, u.full_name, u.email, u.phone, u.is_active, u.is_blocked,
                   u.blocked_reason, u.last_login, u.last_activity_timestamp, u.risk_score,
                   u.created_at, u.inactivity_status,
                   (SELECT COUNT(*) FROM documents WHERE user_id = u.id AND is_deleted = 0) as doc_count,
                   (SELECT COUNT(*) FROM trusted_contacts WHERE user_id = u.id) as contact_count,
                   CASE WHEN u.last_activity_timestamp > DATE_SUB(NOW(), INTERVAL 30 DAY)
                        THEN 'active' ELSE 'inactive' END as activity_status
            FROM users u WHERE u.role = 'user' ORDER BY u.created_at DESC
        `);
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
});

// ── BLOCK / UNBLOCK USER ───────────────────────────────────────
router.put('/users/:id/block', adminAuth, async (req, res) => {
    const { reason } = req.body;
    try {
        const [user] = await db.execute('SELECT id, full_name, email, role FROM users WHERE id = ?', [req.params.id]);
        if (!user.length) return res.status(404).json({ success: false, message: 'User not found' });
        if (user[0].role === 'admin') return res.status(403).json({ success: false, message: 'Cannot block admin' });

        await db.execute('UPDATE users SET is_blocked = 1, blocked_reason = ?, blocked_at = NOW() WHERE id = ?', [reason || 'Blocked by admin', req.params.id]);
        await logAdmin(req.admin.id, 'USER_BLOCKED', 'user', req.params.id, `Blocked: ${user[0].email}. Reason: ${reason}`, req);
        res.json({ success: true, message: 'User blocked successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to block user' });
    }
});

router.put('/users/:id/unblock', adminAuth, async (req, res) => {
    try {
        const [user] = await db.execute('SELECT id, email FROM users WHERE id = ?', [req.params.id]);
        if (!user.length) return res.status(404).json({ success: false, message: 'User not found' });
        await db.execute('UPDATE users SET is_blocked = 0, blocked_reason = NULL, blocked_at = NULL WHERE id = ?', [req.params.id]);
        await logAdmin(req.admin.id, 'USER_UNBLOCKED', 'user', req.params.id, `Unblocked: ${user[0].email}`, req);
        res.json({ success: true, message: 'User unblocked successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to unblock user' });
    }
});

// ── ALL DOCUMENTS (metadata only, no content) ─────────────────
router.get('/documents', adminAuth, async (req, res) => {
    try {
        const [docs] = await db.execute(`
            SELECT d.id, d.uuid, d.title, d.file_name, d.file_size, d.file_type,
                   d.category, d.is_encrypted, d.created_at, d.is_deleted,
                   u.full_name as owner_name, u.email as owner_email
            FROM documents d
            JOIN users u ON d.user_id = u.id
            ORDER BY d.created_at DESC
        `);
        await logAdmin(req.admin.id, 'VIEWED_ALL_DOCUMENTS', 'document', null, 'Admin viewed document list', req);
        res.json({ success: true, documents: docs });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch documents' });
    }
});

// ── ALL ACTIVITY LOGS ──────────────────────────────────────────
router.get('/logs', adminAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const risk = req.query.risk || null;
        const userId = req.query.user_id || null;

        let query = `SELECT al.*, u.full_name, u.email FROM activity_logs al 
                     LEFT JOIN users u ON al.user_id = u.id WHERE 1=1`;
        const params = [];
        if (risk) { query += ' AND al.risk_level = ?'; params.push(risk); }
        if (userId) { query += ' AND al.user_id = ?'; params.push(userId); }
        query += ' ORDER BY al.timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [logs] = await db.execute(query, params);
        const [[count]] = await db.execute('SELECT COUNT(*) as total FROM activity_logs');
        res.json({ success: true, logs, total: count.total });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch logs' });
    }
});

// ── LOGIN ATTEMPTS ─────────────────────────────────────────────
router.get('/login-attempts', adminAuth, async (req, res) => {
    try {
        const [attempts] = await db.execute(`
            SELECT la.*, u.full_name 
            FROM login_attempts la
            LEFT JOIN users u ON la.email = u.email
            ORDER BY la.attempted_at DESC LIMIT 200
        `);
        res.json({ success: true, attempts });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch login attempts' });
    }
});

// ── FLAG SUSPICIOUS ACTIVITY ───────────────────────────────────
router.post('/flag', adminAuth, [
    body('user_id').optional().isInt(),
    body('reason').notEmpty().withMessage('Reason required'),
    body('severity').isIn(['low','medium','high','critical'])
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { user_id, log_id, reason, severity } = req.body;
    try {
        const [result] = await db.execute(
            'INSERT INTO flagged_activities (log_id, user_id, flagged_by, reason, severity) VALUES (?,?,?,?,?)',
            [log_id || null, user_id || null, req.admin.id, reason, severity]
        );
        await logAdmin(req.admin.id, 'ACTIVITY_FLAGGED', 'user', user_id, `Flagged: ${reason} (${severity})`, req);

        // Also update user risk score if user flagged
        if (user_id) {
            const scoreMap = { low: 10, medium: 20, high: 35, critical: 50 };
            await db.execute('UPDATE users SET risk_score = LEAST(risk_score + ?, 100) WHERE id = ?', [scoreMap[severity] || 20, user_id]);
        }
        res.json({ success: true, message: 'Activity flagged successfully', id: result.insertId });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to flag activity' });
    }
});

// ── GET FLAGS ──────────────────────────────────────────────────
router.get('/flags', adminAuth, async (req, res) => {
    try {
        const [flags] = await db.execute(`
            SELECT f.*, u.full_name as user_name, u.email as user_email,
                   a.full_name as flagged_by_name
            FROM flagged_activities f
            LEFT JOIN users u ON f.user_id = u.id
            LEFT JOIN users a ON f.flagged_by = a.id
            ORDER BY f.created_at DESC
        `);
        res.json({ success: true, flags });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch flags' });
    }
});

// ── RESOLVE FLAG ───────────────────────────────────────────────
router.put('/flags/:id/resolve', adminAuth, async (req, res) => {
    try {
        await db.execute('UPDATE flagged_activities SET status = "resolved", resolved_at = NOW() WHERE id = ?', [req.params.id]);
        await logAdmin(req.admin.id, 'FLAG_RESOLVED', 'system', req.params.id, 'Flag resolved', req);
        res.json({ success: true, message: 'Flag resolved' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to resolve flag' });
    }
});

// ── ALL ACCESS REQUESTS ────────────────────────────────────────
router.get('/access-requests', adminAuth, async (req, res) => {
    try {
        const [requests] = await db.execute(`
            SELECT ar.*, u.full_name as user_name, u.email as user_email,
                   (SELECT COUNT(*) FROM access_approvals WHERE request_id = ar.id AND decision='approved') as approved_count,
                   (SELECT COUNT(*) FROM access_approvals WHERE request_id = ar.id AND decision='denied') as denied_count
            FROM access_requests ar
            JOIN users u ON ar.user_id = u.id
            ORDER BY ar.created_at DESC
        `);
        res.json({ success: true, requests });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch requests' });
    }
});

// ── TRUSTED CONTACT APPROVALS ──────────────────────────────────
router.get('/approvals', adminAuth, async (req, res) => {
    try {
        const [approvals] = await db.execute(`
            SELECT aa.*, tc.name as contact_name, tc.email as contact_email,
                   ar.request_type, ar.status as request_status,
                   u.full_name as vault_owner
            FROM access_approvals aa
            JOIN trusted_contacts tc ON aa.contact_id = tc.id
            JOIN access_requests ar ON aa.request_id = ar.id
            JOIN users u ON ar.user_id = u.id
            ORDER BY aa.decided_at DESC
        `);
        res.json({ success: true, approvals });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch approvals' });
    }
});

// ── ADMIN LOGS ─────────────────────────────────────────────────
router.get('/admin-logs', adminAuth, async (req, res) => {
    try {
        const [logs] = await db.execute(`
            SELECT al.*, u.full_name as admin_name
            FROM admin_logs al
            JOIN users u ON al.admin_id = u.id
            ORDER BY al.created_at DESC LIMIT 500
        `);
        res.json({ success: true, logs });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch admin logs' });
    }
});

// ── INACTIVITY CHECK ───────────────────────────────────────────
router.get('/inactive-users', adminAuth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const [users] = await db.execute(`
            SELECT id, full_name, email, last_activity_timestamp, risk_score,
                   DATEDIFF(NOW(), last_activity_timestamp) as days_inactive
            FROM users 
            WHERE role = 'user' AND is_blocked = 0
            AND (last_activity_timestamp IS NULL OR last_activity_timestamp < DATE_SUB(NOW(), INTERVAL ? DAY))
            ORDER BY last_activity_timestamp ASC
        `, [days]);
        res.json({ success: true, users, threshold_days: days });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch inactive users' });
    }
});

// ── RUN INACTIVITY CHECK (POST) ────────────────────────────────
router.post('/check-inactivity', adminAuth, async (req, res) => {
    try {
        const { checkInactiveUsers } = require('../utils/adminLogger');
        const days = parseInt(req.body.threshold_days) || 30;
        const affected = await checkInactiveUsers(days);
        await logAdmin(req.admin.id, 'INACTIVITY_CHECK_RUN', 'system', null, `Checked inactivity with ${days}-day threshold. ${affected} users marked inactive.`, req);
        res.json({ success: true, message: `Inactivity check complete. ${affected} users marked inactive.`, affected });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Inactivity check failed' });
    }
});

// ── USER DETAIL ────────────────────────────────────────────────
router.get('/users/:id', adminAuth, async (req, res) => {
    try {
        const [user] = await db.execute(`
            SELECT u.id, u.uuid, u.full_name, u.email, u.phone, u.is_active, u.is_blocked,
                   u.blocked_reason, u.last_login, u.last_activity_timestamp, u.risk_score,
                   u.created_at, u.inactivity_threshold_days, u.inactivity_status,
                   CASE WHEN u.last_activity_timestamp > DATE_SUB(NOW(), INTERVAL 30 DAY)
                        THEN 'active' ELSE 'inactive' END as activity_status
            FROM users u WHERE u.id = ? AND u.role = 'user'
        `, [req.params.id]);
        if (!user.length) return res.status(404).json({ success: false, message: 'User not found' });

        const [docs] = await db.execute('SELECT id, title, category, file_size, created_at FROM documents WHERE user_id = ? AND is_deleted = 0', [req.params.id]);
        const [contacts] = await db.execute('SELECT id, name, email, access_level FROM trusted_contacts WHERE user_id = ?', [req.params.id]);
        const [logs] = await db.execute('SELECT action, risk_level, timestamp FROM activity_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20', [req.params.id]);

        await logAdmin(req.admin.id, 'VIEWED_USER_DETAIL', 'user', req.params.id, `Viewed profile of ${user[0].email}`, req);
        res.json({ success: true, user: user[0], documents: docs, contacts, recent_logs: logs });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch user detail' });
    }
});

module.exports = router;
module.exports.adminAuth = adminAuth;
