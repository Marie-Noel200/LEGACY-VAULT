#!/usr/bin/env python3
"""
Run admin schema updates via XAMPP MySQL
"""
import subprocess, sys, os

mysql_path = r"C:\xampp\mysql\bin\mysql.exe"

sql = """
USE legacy_vault;

ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS role ENUM('user','admin') DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS blocked_at DATETIME,
  ADD COLUMN IF NOT EXISTS last_activity_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS activity_status ENUM('active','inactive') DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS inactivity_threshold_days INT DEFAULT 30;

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

SELECT 'Schema updated successfully' as result;
SHOW TABLES;
"""

with open('_temp_admin.sql', 'w') as f:
    f.write(sql)

result = subprocess.run(
    [mysql_path, '-u', 'root', 'legacy_vault'],
    input=sql, capture_output=True, text=True
)

os.remove('_temp_admin.sql') if os.path.exists('_temp_admin.sql') else None

if result.returncode == 0:
    print("SUCCESS! Admin schema applied.")
    print(result.stdout)
else:
    print("Output:", result.stdout)
    print("Errors:", result.stderr)
