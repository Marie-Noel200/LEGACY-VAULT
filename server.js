require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { apiLimiter } = require('./middleware/rateLimiter');
const initDatabase = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "blob:"],
            scriptSrcElem: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "blob:"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
            workerSrc: ["'self'", "blob:"],
        }
    }
}));

app.use(cors({
    // Since frontend is served by the same Express server, allow same origin.
    // In production on Railway, BASE_URL is the app's own URL.
    origin: process.env.NODE_ENV === 'production'
        ? (process.env.BASE_URL || true)
        : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
app.use('/api', apiLimiter);

// Update last_activity_timestamp on every authenticated API call
// Also reset missed_checks and expire any pending liveness tokens (user is active)
app.use('/api', (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (token) {
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.userId && decoded.role !== 'admin') {
                const db = require('./config/database');
                // Reset activity timestamp
                db.execute(
                    'UPDATE users SET last_activity_timestamp = NOW(), inactivity_status = "active", missed_checks = 0, last_confirmed_at = NOW() WHERE id = ?',
                    [decoded.userId]
                ).catch(() => {});
                // Mark any pending liveness tokens as confirmed (user is active)
                db.execute(
                    "UPDATE liveness_tokens SET status = 'confirmed', confirmed_at = NOW() WHERE user_id = ? AND status = 'pending'",
                    [decoded.userId]
                ).catch(() => {});
            }
        } catch (e) {}
    }
    next();
});

// ── API ROUTES ─────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/emergency', require('./routes/emergency'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/access-tokens', require('./routes/access-tokens'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Legacy Vault API is running', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── USER PAGES ─────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/forgot-password', (req, res) => res.sendFile(path.join(__dirname, 'public', 'forgot-password.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reset-password.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/vault', (req, res) => res.sendFile(path.join(__dirname, 'public', 'vault.html')));
app.get('/contacts', (req, res) => res.sendFile(path.join(__dirname, 'public', 'contacts.html')));
app.get('/security', (req, res) => res.sendFile(path.join(__dirname, 'public', 'security.html')));
app.get('/activity', (req, res) => res.sendFile(path.join(__dirname, 'public', 'activity.html')));
// /audit is admin-only — redirect users to 404
app.get('/audit', (req, res) => res.redirect('/404'));
app.get('/emergency', (req, res) => res.sendFile(path.join(__dirname, 'public', 'emergency.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'public', 'profile.html')));
// Public verify page for trusted contacts — no auth required
app.get('/verify/:uuid', (req, res) => res.sendFile(path.join(__dirname, 'public', 'verify.html')));
// Contact document access portal
app.get('/contact-access/:tokenId', (req, res) => res.sendFile(path.join(__dirname, 'public', 'contact-access.html')));
// Trusted contact dashboard (full portal)
app.get('/contact-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'contact-dashboard.html')));

// ── CONFIRM ACTIVE — user clicks "I am still active" from email ──
app.get('/confirm-active/:token', async (req, res) => {
    try {
        const db = require('./config/database');
        const { logActivity } = require('./utils/logger');
        const token = req.params.token;

        const [rows] = await db.execute(
            `SELECT lt.*, u.full_name, u.email FROM liveness_tokens lt
             JOIN users u ON lt.user_id = u.id
             WHERE lt.token = ? AND lt.status = 'pending' AND lt.expires_at > NOW()`,
            [token]
        );

        if (!rows.length) {
            return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Link Expired — Legacy Vault</title>
            <link rel="icon" type="image/svg+xml" href="/img/icon.svg">
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
            </head><body style="font-family:Inter,sans-serif;background:#F8FAFC;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
            <div style="background:#fff;border-radius:16px;padding:2.5rem;max-width:440px;text-align:center;box-shadow:0 4px 24px rgba(15,23,42,.1);border:1px solid #E2E8F0">
              <div style="font-size:3rem;margin-bottom:1rem">⏰</div>
              <h2 style="font-family:Georgia,serif;color:#0F172A;margin-bottom:.5rem">Link Expired</h2>
              <p style="color:#475569;font-size:.875rem;line-height:1.7">This confirmation link has expired or already been used. If you are still active, please log in to your Legacy Vault account.</p>
              <a href="/login" style="display:inline-block;margin-top:1.5rem;background:linear-gradient(135deg,#4F46E5,#6366F1);color:#fff;text-decoration:none;padding:.875rem 2rem;border-radius:10px;font-weight:700">Sign In to Legacy Vault</a>
            </div></body></html>`);
        }

        const user = rows[0];

        // Mark token as confirmed
        await db.execute(
            "UPDATE liveness_tokens SET status = 'confirmed', confirmed_at = NOW() WHERE token = ?",
            [token]
        );

        // Reset missed checks counter, update last_confirmed_at and last_activity_timestamp
        await db.execute(
            'UPDATE users SET missed_checks = 0, last_confirmed_at = NOW(), last_check_sent_at = NOW(), last_activity_timestamp = NOW() WHERE id = ?',
            [user.user_id]
        );

        await logActivity(user.user_id, 'LIVENESS_CONFIRMED',
            `User confirmed active via email link (check #${user.check_number})`, req, 'low');

        res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Confirmed Active — Legacy Vault</title>
        <link rel="icon" type="image/svg+xml" href="/img/icon.svg">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
        <meta http-equiv="refresh" content="5;url=/login">
        </head><body style="font-family:Inter,sans-serif;background:#F8FAFC;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
        <div style="background:#fff;border-radius:16px;padding:2.5rem;max-width:440px;text-align:center;box-shadow:0 4px 24px rgba(15,23,42,.1);border:1px solid #E2E8F0">
          <div style="width:72px;height:72px;border-radius:50%;background:#F0FDF4;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;font-size:2rem">✅</div>
          <h2 style="font-family:Georgia,serif;color:#0F172A;margin-bottom:.5rem">Activity Confirmed!</h2>
          <p style="color:#475569;font-size:.875rem;line-height:1.7">Thank you, <strong>${user.full_name}</strong>. Your activity has been confirmed and the emergency timer has been reset.</p>
          <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:.875rem;margin:1.25rem 0;font-size:.82rem;color:#166534">
            ✓ Missed check counter reset to 0<br>✓ Emergency access will not be triggered<br>✓ Next check scheduled per your inactivity settings
          </div>
          <p style="color:#94A3B8;font-size:.78rem">Redirecting to login in 5 seconds...</p>
          <a href="/login" style="display:inline-block;margin-top:.5rem;background:linear-gradient(135deg,#4F46E5,#6366F1);color:#fff;text-decoration:none;padding:.875rem 2rem;border-radius:10px;font-weight:700">Sign In to Legacy Vault</a>
        </div></body></html>`);
    } catch (err) {
        console.error('Confirm active error:', err);
        res.status(500).send('Error processing confirmation');
    }
});

// ── ADMIN PAGES ────────────────────────────────────────────────
app.get('/admin', (req, res) => res.redirect('/admin/dashboard'));
app.get('/admin/login', (req, res) => res.redirect('/login'));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html')));
app.get('/admin/users', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'users.html')));
app.get('/admin/documents', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'documents.html')));
app.get('/admin/logs', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'logs.html')));
app.get('/admin/flags', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'flags.html')));
app.get('/admin/requests', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'requests.html')));

// 404 handler
app.use((req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ success: false, message: 'API endpoint not found' });
    res.sendFile(path.join(__dirname, 'public', '404.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: 'File too large. Maximum 10MB allowed.' });
    res.status(500).json({ success: false, message: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════╗
║         LEGACY VAULT SERVER              ║
║   Secure Digital Will Management         ║
╠══════════════════════════════════════════╣
║  🚀 Server running on port ${PORT}          ║
║  🌐 http://localhost:${PORT}               ║
║  🔐 Security: ENABLED                    ║
║  📊 Environment: ${process.env.NODE_ENV || 'development'}          ║
║  👤 Admin: http://localhost:${PORT}/admin   ║
╚══════════════════════════════════════════╝
    `);

    // Auto-initialize database tables on startup
    initDatabase();

    // ── 3-STAGE LIVENESS CHECK SYSTEM ─────────────────────────
    // Runs every 24 hours.
    // When a user sets inactivity threshold (e.g. 150 days):
    //   checkpoint_interval = threshold / 3  (e.g. 50 days)
    //   Day 50  → Check 1: "Are you still active?" email
    //   Day 100 → Check 2: "Are you still active?" email (if check 1 was ignored)
    //   Day 150 → Check 3: Final warning email (if checks 1 & 2 ignored)
    //   Day 150+ (all 3 ignored) → Emergency triggered, trusted contacts notified
    // If user clicks confirm at any point → timer resets, no emergency
    const runInactivityCheck = async () => {
        try {
            const db = require('./config/database');
            const { v4: uuidv4 } = require('uuid');
            const { logActivity } = require('./utils/logger');
            const { sendEmergencyCode, sendLivenessCheck } = require('./utils/mailer');
            const crypto = require('crypto');

            const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

            // Fetch all active, non-blocked users with activity data
            const [users] = await db.execute(`
                SELECT u.id, u.full_name, u.email,
                       u.inactivity_threshold_days,
                       u.missed_checks,
                       u.last_activity_timestamp,
                       u.last_check_sent_at,
                       u.last_confirmed_at,
                       DATEDIFF(NOW(), COALESCE(u.last_confirmed_at, u.last_activity_timestamp, u.created_at)) as days_since_reset,
                       DATEDIFF(NOW(), u.last_activity_timestamp) as days_inactive
                FROM users u
                WHERE u.role = 'user'
                  AND u.is_active = 1
                  AND u.is_blocked = 0
                  AND u.last_activity_timestamp IS NOT NULL
            `);

            for (const user of users) {
                // checkpoint_interval = threshold / 3  (e.g. 150 days → 50 days each)
                const threshold = user.inactivity_threshold_days || 150;
                const interval = Math.floor(threshold / 3);
                const daysSinceReset = user.days_since_reset || 0;
                const missedChecks = user.missed_checks || 0;

                // Determine which check should be sent next
                // Check 1 at interval*1, Check 2 at interval*2, Check 3 at interval*3
                const expectedCheckNum = Math.floor(daysSinceReset / interval);
                if (expectedCheckNum < 1) continue; // Not yet time for any check

                const nextCheckNum = missedChecks + 1;

                // If user has already responded to all checks or we're not at the next checkpoint yet
                if (nextCheckNum > 3) {
                    // All 3 checks were missed — trigger emergency if not already pending
                    const [existingReq] = await db.execute(
                        "SELECT id FROM access_requests WHERE user_id = ? AND status = 'pending'",
                        [user.id]
                    );
                    if (existingReq.length > 0) continue;

                    const [contacts] = await db.execute(
                        'SELECT * FROM trusted_contacts WHERE user_id = ? LIMIT 3',
                        [user.id]
                    );
                    if (contacts.length < 2) {
                        console.log(`[LIVENESS] Cannot trigger emergency for ${user.email} — fewer than 2 trusted contacts`);
                        continue;
                    }

                    const reqUuid = uuidv4();
                    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                    const [result] = await db.execute(
                        `INSERT INTO access_requests (uuid, user_id, request_type, status, approvals_required, reason, expires_at)
                         VALUES (?, ?, 'emergency', 'pending', 2, ?, ?)`,
                        [reqUuid, user.id,
                         `Auto-triggered: ${user.full_name} missed all 3 activity checks over ${threshold} days of inactivity`,
                         expiresAt]
                    );
                    const requestId = result.insertId;

                    const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();
                    for (const contact of contacts) {
                        const code = generateCode();
                        const codeExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                        await db.execute(
                            'INSERT INTO verification_codes (request_id, contact_id, code, expires_at) VALUES (?,?,?,?)',
                            [requestId, contact.id, code, codeExpiry]
                        );
                        await db.execute(
                            'INSERT INTO contact_notifications (contact_id, user_id, type, message) VALUES (?,?,?,?)',
                            [contact.id, user.id, 'auto_inactivity',
                             `URGENT: ${user.full_name} missed all 3 activity checks over ${threshold} days. Emergency access triggered. Code: ${code}. Visit /verify/${reqUuid}`]
                        );
                        await sendEmergencyCode({
                            contactName: contact.name,
                            contactEmail: contact.email,
                            vaultOwnerName: user.full_name,
                            code,
                            requestUuid: reqUuid,
                            reason: `Auto-triggered after 3 missed activity checks (${threshold} days of inactivity)`,
                            expiresAt
                        });
                    }

                    await logActivity(user.id, 'EMERGENCY_AUTO_TRIGGERED',
                        `Auto-triggered after 3 missed liveness checks (${threshold} days inactive)`, null, 'critical');
                    console.log(`[LIVENESS] 🚨 Emergency triggered for ${user.email} — all 3 checks missed over ${threshold} days`);

                } else if (expectedCheckNum >= nextCheckNum) {
                    // Time to send the next check — but only if we haven't already sent it
                    // Check if there's already a pending liveness token for this check number
                    const [pending] = await db.execute(
                        "SELECT id FROM liveness_tokens WHERE user_id = ? AND check_number = ? AND status = 'pending' AND expires_at > NOW()",
                        [user.id, nextCheckNum]
                    );
                    if (pending.length > 0) continue; // Already sent, waiting for response

                    // Also check if this check was already confirmed
                    const [confirmed] = await db.execute(
                        "SELECT id FROM liveness_tokens WHERE user_id = ? AND check_number = ? AND status = 'confirmed'",
                        [user.id, nextCheckNum]
                    );
                    if (confirmed.length > 0) continue; // Already confirmed this check

                    // Send liveness check email
                    const token = crypto.randomBytes(32).toString('hex');
                    // Token expires at the next checkpoint (so user has interval days to respond)
                    const tokenExpiry = new Date(Date.now() + interval * 24 * 60 * 60 * 1000);
                    const confirmUrl = `${BASE_URL}/confirm-active/${token}`;

                    await db.execute(
                        'INSERT INTO liveness_tokens (token, user_id, check_number, expires_at) VALUES (?,?,?,?)',
                        [token, user.id, nextCheckNum, tokenExpiry]
                    );

                    // Increment missed_checks and record when check was sent
                    await db.execute(
                        'UPDATE users SET missed_checks = ?, last_check_sent_at = NOW() WHERE id = ?',
                        [nextCheckNum, user.id]
                    );

                    await sendLivenessCheck({
                        userEmail: user.email,
                        userName: user.full_name,
                        checkNumber: nextCheckNum,
                        maxChecks: 3,
                        confirmUrl,
                        expiresAt: tokenExpiry,
                        checkIntervalDays: interval,
                        totalThresholdDays: threshold
                    });

                    await logActivity(user.id, 'LIVENESS_CHECK_SENT',
                        `Liveness check #${nextCheckNum}/3 sent (day ${nextCheckNum * interval} of ${threshold})`, null, 'medium');
                    console.log(`[LIVENESS] ✉️  Check #${nextCheckNum}/3 sent to ${user.email} (day ${nextCheckNum * interval}/${threshold})`);
                }
            }

            console.log(`[LIVENESS] Check cycle complete. Processed ${users.length} user(s).`);
        } catch (err) {
            console.error('[LIVENESS CHECK ERROR]', err.message);
        }
    };

    // Run once on startup (after 10s delay to let DB connect), then every 24h
    setTimeout(runInactivityCheck, 10000);
    setInterval(runInactivityCheck, 24 * 60 * 60 * 1000);
});

module.exports = app;
