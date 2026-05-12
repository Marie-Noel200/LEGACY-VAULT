const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// GET activity logs
router.get('/', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const riskFilter = req.query.risk || null;

        let query = `SELECT id, action, details, ip_address, risk_level, timestamp 
                     FROM activity_logs WHERE user_id = ?`;
        const params = [req.user.id];

        if (riskFilter) {
            query += ' AND risk_level = ?';
            params.push(riskFilter);
        }

        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [logs] = await db.execute(query, params);

        const [countResult] = await db.execute(
            'SELECT COUNT(*) as total FROM activity_logs WHERE user_id = ?',
            [req.user.id]
        );

        res.json({
            success: true,
            logs,
            pagination: {
                page,
                limit,
                total: countResult[0].total,
                pages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch logs' });
    }
});

// GET audit summary
router.get('/summary', authenticateToken, async (req, res) => {
    try {
        const [summary] = await db.execute(
            `SELECT 
                COUNT(*) as total_events,
                SUM(CASE WHEN risk_level = 'low' THEN 1 ELSE 0 END) as low_risk,
                SUM(CASE WHEN risk_level = 'medium' THEN 1 ELSE 0 END) as medium_risk,
                SUM(CASE WHEN risk_level = 'high' THEN 1 ELSE 0 END) as high_risk,
                SUM(CASE WHEN risk_level = 'critical' THEN 1 ELSE 0 END) as critical_risk,
                SUM(CASE WHEN action = 'LOGIN_SUCCESS' THEN 1 ELSE 0 END) as successful_logins,
                SUM(CASE WHEN action = 'LOGIN_FAILED' THEN 1 ELSE 0 END) as failed_logins,
                SUM(CASE WHEN action = 'DOCUMENT_UPLOADED' THEN 1 ELSE 0 END) as uploads,
                SUM(CASE WHEN action = 'DOCUMENT_DOWNLOADED' THEN 1 ELSE 0 END) as downloads
             FROM activity_logs WHERE user_id = ?`,
            [req.user.id]
        );

        const [recentActivity] = await db.execute(
            `SELECT action, timestamp FROM activity_logs 
             WHERE user_id = ? ORDER BY timestamp DESC LIMIT 10`,
            [req.user.id]
        );

        const [loginAttempts] = await db.execute(
            `SELECT DATE(attempted_at) as date, 
             SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success,
             SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
             FROM login_attempts 
             WHERE email = (SELECT email FROM users WHERE id = ?)
             AND attempted_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
             GROUP BY DATE(attempted_at) ORDER BY date DESC`,
            [req.user.id]
        );

        res.json({
            success: true,
            summary: summary[0],
            recent_activity: recentActivity,
            login_history: loginAttempts
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch summary' });
    }
});

// GET behavioral monitoring / risk assessment
router.get('/risk', authenticateToken, async (req, res) => {
    try {
        const [user] = await db.execute(
            'SELECT risk_score, last_login, last_activity_timestamp FROM users WHERE id = ?',
            [req.user.id]
        );

        const [failedLogins] = await db.execute(
            `SELECT COUNT(*) as count FROM login_attempts 
             WHERE email = (SELECT email FROM users WHERE id = ?) 
             AND success = 0 AND attempted_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
            [req.user.id]
        );

        const [uniqueIPs] = await db.execute(
            `SELECT COUNT(DISTINCT ip_address) as count FROM activity_logs 
             WHERE user_id = ? AND timestamp > DATE_SUB(NOW(), INTERVAL 7 DAY)`,
            [req.user.id]
        );

        const [highRiskEvents] = await db.execute(
            `SELECT action, details, timestamp FROM activity_logs 
             WHERE user_id = ? AND risk_level IN ('high','critical') 
             ORDER BY timestamp DESC LIMIT 10`,
            [req.user.id]
        );

        res.json({
            success: true,
            risk_score: user[0].risk_score,
            failed_logins_24h: failedLogins[0].count,
            unique_ips_7d: uniqueIPs[0].count,
            high_risk_events: highRiskEvents,
            last_login: user[0].last_login,
            last_activity: user[0].last_activity_timestamp
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch risk data' });
    }
});

module.exports = router;
