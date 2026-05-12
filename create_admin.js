// Run this once to create the admin account
// node create_admin.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./config/database');
const { v4: uuidv4 } = require('uuid');

async function createAdmin() {
    try {
        const password = 'Admin@123456';
        const hash = await bcrypt.hash(password, 12);
        const uuid = uuidv4();

        // Apply admin schema additions
        await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role ENUM('user','admin') DEFAULT 'user'`);
        await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE`);
        await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason TEXT`);
        await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at DATETIME`);
        await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP`);
        await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS inactivity_status ENUM('active','inactive') DEFAULT 'active'`);

        // Create tables
        await db.execute(`CREATE TABLE IF NOT EXISTS verification_codes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            request_id INT NOT NULL,
            contact_id INT NOT NULL,
            code VARCHAR(10) NOT NULL,
            is_used BOOLEAN DEFAULT FALSE,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (request_id) REFERENCES access_requests(id) ON DELETE CASCADE,
            FOREIGN KEY (contact_id) REFERENCES trusted_contacts(id) ON DELETE CASCADE
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS admin_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            admin_id INT NOT NULL,
            action VARCHAR(255) NOT NULL,
            target_type ENUM('user','document','request','system') DEFAULT 'system',
            target_id INT,
            details TEXT,
            ip_address VARCHAR(45),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS flagged_activities (
            id INT AUTO_INCREMENT PRIMARY KEY,
            log_id INT,
            user_id INT,
            flagged_by INT NOT NULL,
            reason TEXT,
            severity ENUM('low','medium','high','critical') DEFAULT 'medium',
            status ENUM('open','resolved','dismissed') DEFAULT 'open',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolved_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (flagged_by) REFERENCES users(id) ON DELETE CASCADE
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS contact_notifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            contact_id INT NOT NULL,
            user_id INT NOT NULL,
            type ENUM('added','access_request','code_sent','approved','denied') NOT NULL,
            message TEXT,
            is_read BOOLEAN DEFAULT FALSE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contact_id) REFERENCES trusted_contacts(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        // Delete existing admin if any
        await db.execute(`DELETE FROM users WHERE email = 'admin@legacyvault.com'`);

        // Create admin
        await db.execute(
            `INSERT INTO users (uuid, full_name, email, password_hash, role, is_active, last_activity_timestamp) VALUES (?,?,?,?,?,?,NOW())`,
            [uuid, 'System Administrator', 'admin@legacyvault.com', hash, 'admin', 1]
        );

        console.log('✅ Admin account created successfully!');
        console.log('   Email:    admin@legacyvault.com');
        console.log('   Password: Admin@123456');
        console.log('   URL:      http://localhost:3000/admin');
        console.log('\n✅ All admin tables created successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

createAdmin();
