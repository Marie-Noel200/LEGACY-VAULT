const db = require('../config/database');

const logActivity = async (userId, action, details = '', req = null, riskLevel = 'low') => {
    try {
        const ip = req ? (req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown') : 'system';
        const userAgent = req ? (req.headers['user-agent'] || 'unknown') : 'system';

        await db.execute(
            'INSERT INTO activity_logs (user_id, action, details, ip_address, user_agent, risk_level) VALUES (?, ?, ?, ?, ?, ?)',
            [userId || null, action, details, ip, userAgent, riskLevel]
        );
    } catch (err) {
        console.error('Logging error:', err.message);
    }
};

const calculateRiskScore = async (userId) => {
    try {
        const [failedLogins] = await db.execute(
            `SELECT COUNT(*) as count FROM login_attempts 
             WHERE email = (SELECT email FROM users WHERE id = ?) 
             AND success = 0 AND attempted_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
            [userId]
        );

        const [unusualActivity] = await db.execute(
            `SELECT COUNT(*) as count FROM activity_logs 
             WHERE user_id = ? AND risk_level IN ('high','critical') 
             AND timestamp > DATE_SUB(NOW(), INTERVAL 7 DAY)`,
            [userId]
        );

        let score = 0;
        score += Math.min(failedLogins[0].count * 10, 50);
        score += Math.min(unusualActivity[0].count * 15, 50);

        await db.execute('UPDATE users SET risk_score = ? WHERE id = ?', [score, userId]);
        return score;
    } catch (err) {
        console.error('Risk score error:', err.message);
        return 0;
    }
};

module.exports = { logActivity, calculateRiskScore };
