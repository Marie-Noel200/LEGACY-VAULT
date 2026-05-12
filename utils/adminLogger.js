const db = require('../config/database');

const logAdminAction = async (adminId, action, targetType = 'system', targetId = null, details = '', req = null) => {
    try {
        const ip = req ? (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown') : 'system';
        await db.execute(
            'INSERT INTO admin_logs (admin_id, action, target_type, target_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
            [adminId, action, targetType || 'system', targetId || null, details, ip]
        );
    } catch (err) {
        console.error('Admin log error:', err.message);
    }
};

const updateActivityTimestamp = async (userId) => {
    try {
        await db.execute(
            'UPDATE users SET last_activity_timestamp = NOW(), inactivity_status = "active" WHERE id = ?',
            [userId]
        );
    } catch (err) {
        console.error('Activity timestamp error:', err.message);
    }
};

const checkInactiveUsers = async (thresholdDays = 30) => {
    try {
        const [result] = await db.execute(
            `UPDATE users SET inactivity_status = 'inactive' 
             WHERE last_activity_timestamp < DATE_SUB(NOW(), INTERVAL ? DAY) 
             AND role = 'user' AND is_active = 1 AND is_blocked = 0`,
            [thresholdDays]
        );
        return result.affectedRows;
    } catch (err) {
        console.error('Inactivity check error:', err.message);
        return 0;
    }
};

module.exports = { logAdminAction, updateActivityTimestamp, checkInactiveUsers };
