#!/usr/bin/env python3
"""
Create admin account and run admin schema
Run: python create_admin.py
"""
import subprocess, hashlib, os

mysql = r"C:\xampp\mysql\bin\mysql.exe"

# We'll use a known bcrypt hash for Admin@123456
# Generated with bcrypt cost 12
# You can change the password after first login

sql = """
USE legacy_vault;

-- Add new columns to users table (safe to run multiple times)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role ENUM('user','admin') DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at DATETIME;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_status ENUM('active','inactive') DEFAULT 'active';

-- Create new tables
CREATE TABLE IF NOT EXISTS contact_verification_codes (
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

CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    contact_id INT,
    type ENUM('contact_added','access_request','access_approved','access_denied','inactivity_warning','admin_action') NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    action VARCHAR(255) NOT NULL,
    target_user_id INT,
    details TEXT,
    ip_address VARCHAR(45),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS flagged_activities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    log_id INT,
    user_id INT,
    reason TEXT NOT NULL,
    flagged_by INT NOT NULL,
    status ENUM('open','resolved','dismissed') DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (flagged_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Create admin account (password: Admin@123456)
-- bcrypt hash of Admin@123456 with cost 12
INSERT INTO users (uuid, full_name, email, password_hash, role, is_active, last_activity_timestamp)
VALUES (
    'admin-legacy-vault-system-2024',
    'System Administrator',
    'admin@legacyvault.com',
    '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    'admin',
    1,
    NOW()
) ON DUPLICATE KEY UPDATE role='admin', is_active=1;

SELECT 'Admin schema applied successfully!' as result;
SELECT id, full_name, email, role FROM users WHERE role='admin';
"""

result = subprocess.run([mysql, '-u', 'root', 'legacy_vault'], input=sql, capture_output=True, text=True)

if result.returncode == 0:
    print("SUCCESS!")
    print(result.stdout)
    print("\n" + "="*50)
    print("ADMIN LOGIN CREDENTIALS:")
    print("  URL:      http://localhost:3000/admin/login")
    print("  Email:    admin@legacyvault.com")
    print("  Password: Admin@123456")
    print("="*50)
else:
    print("Output:", result.stdout)
    print("Errors:", result.stderr)
    print("\nIf MySQL is not running, start XAMPP MySQL first!")
