-- ============================================================
-- LEGACY VAULT - Admin & Enhanced Schema
-- Run this AFTER the base schema.sql
-- ============================================================

USE legacy_vault;

-- Add admin role and last_activity_timestamp to users
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS role ENUM('user','admin') DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS blocked_at DATETIME,
  ADD COLUMN IF NOT EXISTS last_activity_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS inactivity_status ENUM('active','inactive') DEFAULT 'active';

-- Verification codes for trusted contacts (generated ONLY at access request time)
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
);

-- Admin actions log (separate from user activity_logs)
CREATE TABLE IF NOT EXISTS admin_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    action VARCHAR(255) NOT NULL,
    target_type ENUM('user','document','request','system') DEFAULT 'system',
    target_id INT,
    details TEXT,
    ip_address VARCHAR(45),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Flagged activities
CREATE TABLE IF NOT EXISTS flagged_activities (
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
);

-- Contact notifications log
CREATE TABLE IF NOT EXISTS contact_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    user_id INT NOT NULL,
    type ENUM('added','access_request','code_sent','approved','denied') NOT NULL,
    message TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES trusted_contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create default admin account (password: Admin@123456)
-- bcrypt hash of 'Admin@123456' with cost 12
INSERT IGNORE INTO users (uuid, full_name, email, password_hash, role, is_active)
VALUES (
    'admin-0000-0000-0000-000000000001',
    'System Administrator',
    'admin@legacyvault.com',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniMnMmMnMmMnMmMnMmMnMmMnM',
    'admin',
    1
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_blocked ON users(is_blocked);
CREATE INDEX IF NOT EXISTS idx_users_last_activity ON users(last_activity_timestamp);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_flagged_status ON flagged_activities(status);
CREATE INDEX IF NOT EXISTS idx_verification_codes_request ON verification_codes(request_id);

SELECT 'Admin schema applied successfully' AS result;
