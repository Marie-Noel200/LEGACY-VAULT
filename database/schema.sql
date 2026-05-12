-- Legacy Vault Database Schema
-- Run this file to initialize the database

CREATE DATABASE IF NOT EXISTS legacy_vault;
USE legacy_vault;

-- Users Table
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
    last_activity DATETIME,
    inactivity_threshold_days INT DEFAULT 180,
    risk_score INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Documents Table
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Trusted Contacts Table
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Activity Logs Table
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
);

-- Access Requests Table
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
);

-- Access Request Approvals Table
CREATE TABLE IF NOT EXISTS access_approvals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    contact_id INT NOT NULL,
    decision ENUM('approved','denied') NOT NULL,
    comment TEXT,
    decided_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES access_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES trusted_contacts(id) ON DELETE CASCADE
);

-- Login Attempts Table
CREATE TABLE IF NOT EXISTS login_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255),
    ip_address VARCHAR(45),
    success BOOLEAN DEFAULT FALSE,
    user_agent TEXT,
    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sessions Table
CREATE TABLE IF NOT EXISTS user_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    session_token VARCHAR(500),
    ip_address VARCHAR(45),
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_trusted_contacts_user_id ON trusted_contacts(user_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_timestamp ON activity_logs(timestamp);
CREATE INDEX idx_access_requests_user_id ON access_requests(user_id);
CREATE INDEX idx_login_attempts_email ON login_attempts(email);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip_address);

-- ── ADMIN PANEL ADDITIONS ──────────────────────────────────────

-- Add admin columns to users table
ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS role ENUM('user','admin') DEFAULT 'user',
    ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
    ADD COLUMN IF NOT EXISTS blocked_at DATETIME,
    ADD COLUMN IF NOT EXISTS last_activity_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS inactivity_status ENUM('active','inactive') DEFAULT 'active';

-- Verification Codes Table (for emergency access 2-of-3 verification)
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

-- Contact Notifications Table
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
);

-- Flagged Activities Table
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
);

-- Admin Action Logs Table
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
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_blocked ON users(is_blocked);
CREATE INDEX IF NOT EXISTS idx_flagged_status ON flagged_activities(status);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_request ON verification_codes(request_id);
CREATE INDEX IF NOT EXISTS idx_contact_notifications_contact ON contact_notifications(contact_id);

-- Default admin account (password: Admin@123456)
-- bcrypt hash of 'Admin@123456' with cost 12
INSERT IGNORE INTO users (uuid, full_name, email, password_hash, role, is_active)
VALUES (
    'admin-0000-0000-0000-000000000001',
    'System Administrator',
    'admin@legacyvault.com',
    '$2a$12$OnwnTEzxVLkPle9gvzcSDuvTPMTNtbyJhXRx5bL77o1C2RY1JrpKa',
    'admin',
    1
);

-- ══════════════════════════════════════════════════════════════
-- ADVANCED INHERITANCE & ACCESS CONTROL ADDITIONS
-- ══════════════════════════════════════════════════════════════

-- 1. Add document-level security columns to documents table
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS document_password_hash VARCHAR(255) DEFAULT NULL COMMENT 'bcrypt hash of optional document PIN',
    ADD COLUMN IF NOT EXISTS is_password_protected BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS assigned_contact_id INT DEFAULT NULL COMMENT 'NULL = general, set = document-specific',
    ADD COLUMN IF NOT EXISTS access_note TEXT DEFAULT NULL COMMENT 'Note for assigned contact',
    ADD COLUMN IF NOT EXISTS inheritance_type ENUM('general','specific') DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS access_count INT DEFAULT 0 COMMENT 'How many times accessed by contacts',
    ADD FOREIGN KEY IF NOT EXISTS fk_doc_contact (assigned_contact_id) REFERENCES trusted_contacts(id) ON DELETE SET NULL;

-- 2. Add role_type to trusted_contacts
ALTER TABLE trusted_contacts
    ADD COLUMN IF NOT EXISTS role_type ENUM('general','document-specific') DEFAULT 'general' COMMENT 'general=all docs, document-specific=assigned only',
    ADD COLUMN IF NOT EXISTS inheritance_access BOOLEAN DEFAULT TRUE COMMENT 'Can access general inheritance docs',
    ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- 3. Access Tokens Table (secure temporary tokens for contact document access)
CREATE TABLE IF NOT EXISTS access_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token_id VARCHAR(36) UNIQUE NOT NULL,
    contact_id INT NOT NULL,
    document_id INT DEFAULT NULL COMMENT 'NULL = general access, set = specific document',
    user_id INT NOT NULL COMMENT 'Vault owner',
    verification_code VARCHAR(10) NOT NULL,
    token_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt hash of the full token',
    access_type ENUM('document','general','emergency') DEFAULT 'document',
    status ENUM('pending','used','expired','revoked') DEFAULT 'pending',
    attempts INT DEFAULT 0 COMMENT 'Failed verification attempts',
    max_attempts INT DEFAULT 3,
    expires_at DATETIME NOT NULL,
    used_at DATETIME DEFAULT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES trusted_contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- 4. Document Access Log (fine-grained access tracking)
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
);

-- 5. Inheritance Settings Table (per-user inheritance configuration)
CREATE TABLE IF NOT EXISTS inheritance_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    inactivity_threshold_days INT DEFAULT 180,
    require_document_pin BOOLEAN DEFAULT FALSE COMMENT 'Force PIN on all docs',
    general_access_level ENUM('view','download','full') DEFAULT 'download',
    notify_on_access BOOLEAN DEFAULT TRUE COMMENT 'Email owner when docs accessed',
    auto_revoke_days INT DEFAULT 30 COMMENT 'Auto-revoke access after N days',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_access_tokens_contact ON access_tokens(contact_id);
CREATE INDEX IF NOT EXISTS idx_access_tokens_status ON access_tokens(status);
CREATE INDEX IF NOT EXISTS idx_access_tokens_expires ON access_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_doc_access_log_doc ON document_access_log(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_access_log_contact ON document_access_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_documents_assigned_contact ON documents(assigned_contact_id);
CREATE INDEX IF NOT EXISTS idx_documents_inheritance_type ON documents(inheritance_type);

-- ── ACTIVITY CHECK / LIVENESS VERIFICATION ────────────────────
-- Tracks periodic "are you still active?" checks sent to users

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS check_interval_days INT DEFAULT 50 COMMENT 'How often to send liveness check (default 50 days)',
    ADD COLUMN IF NOT EXISTS max_missed_checks INT DEFAULT 3 COMMENT 'Missed checks before emergency trigger',
    ADD COLUMN IF NOT EXISTS missed_checks INT DEFAULT 0 COMMENT 'Current count of missed liveness checks',
    ADD COLUMN IF NOT EXISTS last_check_sent_at DATETIME DEFAULT NULL COMMENT 'When last liveness check email was sent',
    ADD COLUMN IF NOT EXISTS last_confirmed_at DATETIME DEFAULT NULL COMMENT 'When user last confirmed they are active';

-- Liveness Check Tokens (for "I am still active" confirmation links)
CREATE TABLE IF NOT EXISTS liveness_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(64) UNIQUE NOT NULL,
    user_id INT NOT NULL,
    check_number INT NOT NULL COMMENT '1, 2, or 3 — which check this is',
    status ENUM('pending','confirmed','expired') DEFAULT 'pending',
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at DATETIME DEFAULT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_liveness_token ON liveness_tokens(token);
CREATE INDEX IF NOT EXISTS idx_liveness_user ON liveness_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_liveness_status ON liveness_tokens(status);

-- ── INACTIVITY CHECK-IN SYSTEM ────────────────────────────────
-- Tracks the 3-stage "are you still active?" email checks
CREATE TABLE IF NOT EXISTS inactivity_checks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    check_number TINYINT NOT NULL COMMENT '1=first, 2=second, 3=final',
    token VARCHAR(64) UNIQUE NOT NULL COMMENT 'Secure token for confirmation link',
    status ENUM('sent','confirmed','ignored','expired') DEFAULT 'sent',
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at DATETIME DEFAULT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_inactivity_checks_user ON inactivity_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_inactivity_checks_token ON inactivity_checks(token);
CREATE INDEX IF NOT EXISTS idx_inactivity_checks_status ON inactivity_checks(status);

-- ── PASSWORD RESET TOKENS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(64) UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);
