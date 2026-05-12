// ============================================================
// LEGACY VAULT — Auto Database Initializer
// Runs on server startup — creates all tables if they don't exist
// Safe to run multiple times (uses CREATE TABLE IF NOT EXISTS)
// ============================================================
const db = require('../config/database');

const initDatabase = async () => {
    try {
        console.log('[DB INIT] Starting database initialization...');

        // ── USERS ──────────────────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                uuid VARCHAR(36) UNIQUE NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                phone VARCHAR(20),
                password_hash VARCHAR(255) NOT NULL,
                profile_picture VARCHAR(500),
                two_factor_enabled BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                last_login DATETIME,
                inactivity_threshold_days INT DEFAULT 180,
                risk_score INT DEFAULT 0,
                role ENUM('user','admin') DEFAULT 'user',
                is_blocked BOOLEAN DEFAULT FALSE,
                blocked_reason TEXT,
                blocked_at DATETIME,
                last_activity_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                inactivity_status ENUM('active','inactive') DEFAULT 'active',
                check_interval_days INT DEFAULT 50,
                max_missed_checks INT DEFAULT 3,
                missed_checks INT DEFAULT 0,
                last_check_sent_at DATETIME DEFAULT NULL,
                last_confirmed_at DATETIME DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // ── DOCUMENTS ──────────────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS documents (
                id INT AUTO_INCREMENT PRIMARY KEY,
                uuid VARCHAR(36) UNIQUE NOT NULL,
                user_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                file_name VARCHAR(500),
                file_path VARCHAR(1000),
                file_size BIGINT,
                file_type VARCHAR(100),
                encrypted_data LONGTEXT,
                encryption_iv VARCHAR(255),
                is_encrypted BOOLEAN DEFAULT TRUE,
                category ENUM('will','property','financial','insurance','personal','other') DEFAULT 'other',
                is_deleted BOOLEAN DEFAULT FALSE,
                document_password_hash VARCHAR(255) DEFAULT NULL,
                is_password_protected BOOLEAN DEFAULT FALSE,
                assigned_contact_id INT DEFAULT NULL,
                access_note TEXT DEFAULT NULL,
                inheritance_type ENUM('general','specific') DEFAULT 'general',
                access_count INT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // ── TRUSTED CONTACTS ───────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS trusted_contacts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(20),
                relationship VARCHAR(100),
                access_level ENUM('view','full','emergency') DEFAULT 'view',
                is_verified BOOLEAN DEFAULT FALSE,
                verification_token VARCHAR(255),
                can_trigger_emergency BOOLEAN DEFAULT FALSE,
                role_type ENUM('general','document-specific') DEFAULT 'general',
                inheritance_access BOOLEAN DEFAULT TRUE,
                notes TEXT DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // ── ACTIVITY LOGS ──────────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                action VARCHAR(255) NOT NULL,
                details TEXT,
                ip_address VARCHAR(45),
                user_agent TEXT,
                risk_level ENUM('low','medium','high','critical') DEFAULT 'low',
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        // ── ACCESS REQUESTS ────────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS access_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                uuid VARCHAR(36) UNIQUE NOT NULL,
                user_id INT NOT NULL,
                requested_by INT,
                request_type ENUM('emergency','inheritance','document') DEFAULT 'emergency',
                status ENUM('pending','approved','denied','expired') DEFAULT 'pending',
                approvals_required INT DEFAULT 2,
                approvals_count INT DEFAULT 0,
                denial_count INT DEFAULT 0,
                reason TEXT,
                expires_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // ── ACCESS APPROVALS ───────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS access_approvals (
                id INT AUTO_INCREMENT PRIMARY KEY,
                request_id INT NOT NULL,
                contact_id INT NOT NULL,
                decision ENUM('approved','denied') NOT NULL,
                comment TEXT,
                decided_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (request_id) REFERENCES access_requests(id) ON DELETE CASCADE,
                FOREIGN KEY (contact_id) REFERENCES trusted_contacts(id) ON DELETE CASCADE
            )
        `);

        // ── LOGIN ATTEMPTS ─────────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS login_attempts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255),
                ip_address VARCHAR(45),
                success BOOLEAN DEFAULT FALSE,
                user_agent TEXT,
                attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ── VERIFICATION CODES ─────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS verification_codes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                request_id INT NOT NULL,
                contact_id INT NOT NULL,
                code VARCHAR(10) NOT NULL,
                is_used BOOLEAN DEFAULT FALSE,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (request_id) REFERENCES access_requests(id) ON DELETE CASCADE,
                FOREIGN KEY (contact_id) REFERENCES trusted_contacts(id) ON DELETE CASCADE
            )
        `);

        // ── CONTACT NOTIFICATIONS ──────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS contact_notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                contact_id INT NOT NULL,
                user_id INT NOT NULL,
                type VARCHAR(100) NOT NULL,
                message TEXT,
                is_read BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (contact_id) REFERENCES trusted_contacts(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // ── FLAGGED ACTIVITIES ─────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS flagged_activities (
                id INT AUTO_INCREMENT PRIMARY KEY,
                log_id INT,
                user_id INT,
                flagged_by INT NOT NULL,
                reason TEXT NOT NULL,
                severity ENUM('low','medium','high','critical') DEFAULT 'medium',
                status ENUM('open','resolved','dismissed') DEFAULT 'open',
                resolved_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (flagged_by) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // ── ADMIN LOGS ─────────────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS admin_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                admin_id INT NOT NULL,
                action VARCHAR(255) NOT NULL,
                target_type VARCHAR(100) DEFAULT 'system',
                target_id INT,
                details TEXT,
                ip_address VARCHAR(45),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // ── ACCESS TOKENS ──────────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS access_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                token_id VARCHAR(36) UNIQUE NOT NULL,
                contact_id INT NOT NULL,
                document_id INT DEFAULT NULL,
                user_id INT NOT NULL,
                verification_code VARCHAR(10) NOT NULL,
                token_hash VARCHAR(255) NOT NULL,
                access_type ENUM('document','general','emergency') DEFAULT 'document',
                status ENUM('pending','used','expired','revoked') DEFAULT 'pending',
                attempts INT DEFAULT 0,
                max_attempts INT DEFAULT 3,
                expires_at DATETIME NOT NULL,
                used_at DATETIME DEFAULT NULL,
                ip_address VARCHAR(45) DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (contact_id) REFERENCES trusted_contacts(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // ── DOCUMENT ACCESS LOG ────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS document_access_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                document_id INT NOT NULL,
                contact_id INT NOT NULL,
                user_id INT NOT NULL,
                token_id VARCHAR(36) DEFAULT NULL,
                action ENUM('viewed','downloaded','denied','attempted') NOT NULL,
                ip_address VARCHAR(45),
                user_agent TEXT,
                accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
                FOREIGN KEY (contact_id) REFERENCES trusted_contacts(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // ── INHERITANCE SETTINGS ───────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS inheritance_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT UNIQUE NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                inactivity_threshold_days INT DEFAULT 180,
                require_document_pin BOOLEAN DEFAULT FALSE,
                general_access_level ENUM('view','download','full') DEFAULT 'download',
                notify_on_access BOOLEAN DEFAULT TRUE,
                auto_revoke_days INT DEFAULT 30,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // ── LIVENESS TOKENS ────────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS liveness_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                token VARCHAR(64) UNIQUE NOT NULL,
                user_id INT NOT NULL,
                check_number INT NOT NULL,
                status ENUM('pending','confirmed','expired') DEFAULT 'pending',
                sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                confirmed_at DATETIME DEFAULT NULL,
                expires_at DATETIME NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY uq_user_check (user_id, check_number)
            )
        `);

        // ── INACTIVITY CHECKS ──────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS inactivity_checks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                check_number TINYINT NOT NULL,
                token VARCHAR(64) UNIQUE NOT NULL,
                status ENUM('sent','confirmed','ignored','expired') DEFAULT 'sent',
                sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                confirmed_at DATETIME DEFAULT NULL,
                expires_at DATETIME NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // ── PASSWORD RESET TOKENS ──────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                token VARCHAR(64) UNIQUE NOT NULL,
                expires_at DATETIME NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // ── DEFAULT ADMIN ACCOUNT ──────────────────────────────
        // Always ensure admin exists with correct password: Admin@123456
        const [adminRows] = await db.execute(
            "SELECT id FROM users WHERE email = 'admin@legacyvault.com'"
        );
        if (adminRows.length > 0) {
            // Admin exists — force-update the password hash and role
            await db.execute(
                `UPDATE users SET
                    password_hash = '$2a$12$OnwnTEzxVLkPle9gvzcSDuvTPMTNtbyJhXRx5bL77o1C2RY1JrpKa',
                    role = 'admin',
                    is_active = 1,
                    is_blocked = 0
                WHERE email = 'admin@legacyvault.com'`
            );
            console.log('[DB INIT] ✅ Admin account password updated');
        } else {
            // Admin does not exist — create it
            await db.execute(`
                INSERT INTO users (uuid, full_name, email, password_hash, role, is_active)
                VALUES (
                    'admin-0000-0000-0000-000000000001',
                    'System Administrator',
                    'admin@legacyvault.com',
                    '$2a$12$OnwnTEzxVLkPle9gvzcSDuvTPMTNtbyJhXRx5bL77o1C2RY1JrpKa',
                    'admin',
                    1
                )
            `);
            console.log('[DB INIT] ✅ Admin account created');
        }

        console.log('[DB INIT] ✅ All tables created successfully');
        console.log('[DB INIT] ✅ Default admin account ready (admin@legacyvault.com)');
    } catch (err) {
        console.error('[DB INIT] ❌ Error:', err.message);
        // Don't crash the server — log and continue
    }
};

module.exports = initDatabase;
