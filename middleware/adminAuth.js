const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authenticateAdmin = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Admin access token required' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [rows] = await db.execute(
            'SELECT id, uuid, full_name, email, role, is_active FROM users WHERE id = ? AND role = "admin" AND is_active = 1',
            [decoded.userId]
        );
        if (rows.length === 0) return res.status(403).json({ success: false, message: 'Admin access denied' });
        req.admin = rows[0];
        await db.execute('UPDATE users SET last_activity_timestamp = NOW() WHERE id = ?', [decoded.userId]);
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
};

module.exports = { authenticateAdmin };
