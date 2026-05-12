const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [rows] = await db.execute(
            'SELECT id, uuid, full_name, email, role, is_active FROM users WHERE id = ? AND is_active = 1 AND is_blocked = 0',
            [decoded.userId]
        );

        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: 'User not found, inactive, or blocked' });
        }

        req.user = rows[0];

        // Update last activity
        await db.execute('UPDATE users SET last_activity_timestamp = NOW() WHERE id = ?', [decoded.userId]);

        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expired' });
        }
        return res.status(403).json({ success: false, message: 'Invalid token' });
    }
};

module.exports = { authenticateToken };
