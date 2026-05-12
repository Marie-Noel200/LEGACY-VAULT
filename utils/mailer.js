// ============================================
// LEGACY VAULT — Email Service
// Uses nodemailer with SMTP (configure in .env)
// ============================================
const nodemailer = require('nodemailer');

// Create transporter from env config
const createTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for 587
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        tls: { rejectUnauthorized: false }
    });
};

const FROM = `"Legacy Vault" <${process.env.EMAIL_USER || 'noreply@legacyvault.com'}>`;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ── SEND EMERGENCY ACCESS CODE TO TRUSTED CONTACT ──────────────
const sendEmergencyCode = async ({ contactName, contactEmail, vaultOwnerName, code, requestUuid, reason, expiresAt }) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`[EMAIL SKIPPED] No email config. Code for ${contactEmail}: ${code}`);
        return { success: false, reason: 'Email not configured' };
    }

    const verifyUrl = `${BASE_URL}/verify/${requestUuid}`;
    const expiryStr = new Date(expiresAt).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Emergency Access Request — Legacy Vault</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif">
  <div style="max-width:560px;margin:2rem auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.1);border:1px solid #E2E8F0">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4F46E5,#6366F1);padding:2rem;text-align:center">
      <div style="font-family:Georgia,serif;font-size:1.5rem;font-weight:800;color:#fff;margin-bottom:.25rem">Legacy<span style="color:#A5F3FC">Vault</span></div>
      <div style="font-size:.75rem;color:rgba(255,255,255,.7);letter-spacing:2px;text-transform:uppercase">Secure Digital Will Management</div>
    </div>
    <!-- Alert Banner -->
    <div style="background:#FEF2F2;border-bottom:1px solid #FECACA;padding:1rem 2rem;display:flex;align-items:center;gap:12px">
      <div style="width:36px;height:36px;border-radius:50%;background:#FEE2E2;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.1rem">⚠️</div>
      <div>
        <div style="font-weight:700;color:#991B1B;font-size:.9rem">Emergency Access Request</div>
        <div style="color:#B91C1C;font-size:.8rem">Action required — please review and respond</div>
      </div>
    </div>
    <!-- Body -->
    <div style="padding:2rem">
      <p style="color:#0F172A;font-size:.95rem;margin:0 0 1rem">Hello <strong>${contactName}</strong>,</p>
      <p style="color:#475569;font-size:.875rem;line-height:1.7;margin:0 0 1.5rem">
        You have been listed as a trusted contact for <strong>${vaultOwnerName}</strong> on Legacy Vault.
        An emergency access request has been initiated${reason ? ` with the following reason: <em>"${reason}"</em>` : ''}.
      </p>
      <p style="color:#475569;font-size:.875rem;line-height:1.7;margin:0 0 1.5rem">
        As a trusted contact, you are being asked to <strong>approve or deny</strong> this request.
        Access will only be granted if <strong>2 out of 3</strong> trusted contacts approve.
      </p>
      <!-- Code Box -->
      <div style="background:#EEF2FF;border:2px solid #C7D2FE;border-radius:12px;padding:1.5rem;text-align:center;margin:1.5rem 0">
        <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#4338CA;margin-bottom:.75rem">Your Verification Code</div>
        <div style="font-size:2.5rem;font-weight:900;letter-spacing:.4em;color:#4F46E5;font-family:monospace;margin-bottom:.75rem">${code}</div>
        <div style="font-size:.78rem;color:#6366F1">Enter this code on the verification page to cast your vote</div>
      </div>
      <!-- CTA Button -->
      <div style="text-align:center;margin:1.5rem 0">
        <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#4F46E5,#6366F1);color:#fff;text-decoration:none;padding:.875rem 2.5rem;border-radius:10px;font-weight:700;font-size:1rem;box-shadow:0 4px 16px rgba(79,70,229,.3)">
          Review &amp; Respond →
        </a>
      </div>
      <p style="color:#94A3B8;font-size:.78rem;text-align:center;margin:.5rem 0">
        Or copy this link: <a href="${verifyUrl}" style="color:#4F46E5">${verifyUrl}</a>
      </p>
      <!-- Expiry Warning -->
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:.875rem;margin-top:1.5rem">
        <div style="font-size:.8rem;color:#92400E"><strong>⏰ This request expires on:</strong> ${expiryStr}</div>
        <div style="font-size:.78rem;color:#92400E;margin-top:.25rem">After expiry, the code will no longer be valid.</div>
      </div>
      <!-- Security Notice -->
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:.875rem;margin-top:.75rem">
        <div style="font-size:.8rem;color:#166534"><strong>🔒 Security Notice:</strong> Legacy Vault will never ask for your password. This code is single-use and expires automatically.</div>
      </div>
    </div>
    <!-- Footer -->
    <div style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:1.25rem 2rem;text-align:center">
      <div style="font-size:.75rem;color:#94A3B8">© 2026 Legacy Vault. This email was sent because you are a trusted contact.</div>
      <div style="font-size:.75rem;color:#94A3B8;margin-top:.25rem">If you did not expect this email, please ignore it or contact support.</div>
    </div>
  </div>
</body>
</html>`;

    try {
        const transporter = createTransporter();
        await transporter.sendMail({
            from: FROM,
            to: contactEmail,
            subject: `🔐 Emergency Access Request — ${vaultOwnerName}'s Legacy Vault`,
            html,
            text: `Hello ${contactName},\n\nAn emergency access request has been initiated for ${vaultOwnerName}'s Legacy Vault.\n\nYour verification code: ${code}\n\nVisit ${verifyUrl} to approve or deny.\n\nThis request expires: ${expiryStr}\n\nLegacy Vault`
        });
        console.log(`[EMAIL SENT] Emergency code to ${contactEmail}`);
        return { success: true };
    } catch (err) {
        console.error(`[EMAIL ERROR] Failed to send to ${contactEmail}:`, err.message);
        return { success: false, error: err.message };
    }
};

// ── SEND ACCESS GRANTED NOTIFICATION ───────────────────────────
const sendAccessGranted = async ({ contactEmail, contactName, vaultOwnerName, requestUuid }) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`[EMAIL SKIPPED] Access granted notification for ${contactEmail}`);
        return { success: false, reason: 'Email not configured' };
    }

    const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif">
<div style="max-width:560px;margin:2rem auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.1);border:1px solid #E2E8F0">
  <div style="background:linear-gradient(135deg,#22C55E,#16A34A);padding:2rem;text-align:center">
    <div style="font-size:2rem;margin-bottom:.5rem">✅</div>
    <div style="font-family:Georgia,serif;font-size:1.3rem;font-weight:800;color:#fff">Emergency Access Granted</div>
  </div>
  <div style="padding:2rem">
    <p style="color:#0F172A;font-size:.95rem">Hello <strong>${contactName}</strong>,</p>
    <p style="color:#475569;font-size:.875rem;line-height:1.7">The required approvals have been received. Emergency access to <strong>${vaultOwnerName}</strong>'s Legacy Vault has been <strong style="color:#166534">GRANTED</strong>.</p>
    <p style="color:#475569;font-size:.875rem;line-height:1.7">Approved contacts can now access the vault documents as permitted by their access level.</p>
    <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:.875rem;margin-top:1rem;font-size:.8rem;color:#166534">All actions are logged in the audit trail for security and compliance.</div>
  </div>
  <div style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:1rem 2rem;text-align:center;font-size:.75rem;color:#94A3B8">© 2026 Legacy Vault</div>
</div>
</body></html>`;

    try {
        const transporter = createTransporter();
        await transporter.sendMail({
            from: FROM,
            to: contactEmail,
            subject: `✅ Emergency Access Granted — ${vaultOwnerName}'s Legacy Vault`,
            html,
            text: `Hello ${contactName},\n\nEmergency access to ${vaultOwnerName}'s Legacy Vault has been GRANTED.\n\nLegacy Vault`
        });
        return { success: true };
    } catch (err) {
        console.error(`[EMAIL ERROR] Access granted notification:`, err.message);
        return { success: false, error: err.message };
    }
};

// ── SEND ACCESS DENIED NOTIFICATION ────────────────────────────
const sendAccessDenied = async ({ contactEmail, contactName, vaultOwnerName }) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return { success: false };
    const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif">
<div style="max-width:560px;margin:2rem auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.1);border:1px solid #E2E8F0">
  <div style="background:linear-gradient(135deg,#EF4444,#DC2626);padding:2rem;text-align:center">
    <div style="font-size:2rem;margin-bottom:.5rem">❌</div>
    <div style="font-family:Georgia,serif;font-size:1.3rem;font-weight:800;color:#fff">Emergency Access Denied</div>
  </div>
  <div style="padding:2rem">
    <p style="color:#0F172A;font-size:.95rem">Hello <strong>${contactName}</strong>,</p>
    <p style="color:#475569;font-size:.875rem;line-height:1.7">The emergency access request for <strong>${vaultOwnerName}</strong>'s Legacy Vault has been <strong style="color:#991B1B">DENIED</strong>.</p>
    <p style="color:#475569;font-size:.875rem;line-height:1.7">No further action is required. The vault remains secure.</p>
  </div>
  <div style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:1rem 2rem;text-align:center;font-size:.75rem;color:#94A3B8">© 2026 Legacy Vault</div>
</div>
</body></html>`;
    try {
        const transporter = createTransporter();
        await transporter.sendMail({ from: FROM, to: contactEmail, subject: `❌ Emergency Access Denied — ${vaultOwnerName}'s Legacy Vault`, html });
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

// ── SEND CONTACT ADDED NOTIFICATION ────────────────────────────
const sendContactAdded = async ({ contactEmail, contactName, vaultOwnerName, accessLevel }) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`[EMAIL SKIPPED] Contact added notification for ${contactEmail}`);
        return { success: false, reason: 'Email not configured' };
    }

    const accessDescriptions = {
        view: 'View Only — You can see the document list',
        full: 'Full Access — You can download documents',
        emergency: 'Emergency Access — Full access when emergency is triggered'
    };

    const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif">
<div style="max-width:560px;margin:2rem auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.1);border:1px solid #E2E8F0">
  <div style="background:linear-gradient(135deg,#4F46E5,#6366F1);padding:2rem;text-align:center">
    <div style="font-family:Georgia,serif;font-size:1.5rem;font-weight:800;color:#fff;margin-bottom:.25rem">Legacy<span style="color:#A5F3FC">Vault</span></div>
    <div style="font-size:.75rem;color:rgba(255,255,255,.7);letter-spacing:2px;text-transform:uppercase">Secure Digital Will Management</div>
  </div>
  <div style="padding:2rem">
    <p style="color:#0F172A;font-size:.95rem">Hello <strong>${contactName}</strong>,</p>
    <p style="color:#475569;font-size:.875rem;line-height:1.7">
      <strong>${vaultOwnerName}</strong> has added you as a <strong>Trusted Contact</strong> on their Legacy Vault account.
      This means you may be asked to help verify emergency access requests in the future.
    </p>
    <div style="background:#EEF2FF;border:1px solid #C7D2FE;border-radius:12px;padding:1.25rem;margin:1.5rem 0">
      <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#4338CA;margin-bottom:.5rem">Your Access Level</div>
      <div style="font-size:1rem;font-weight:700;color:#4F46E5;margin-bottom:.25rem">${(accessLevel || 'view').toUpperCase()}</div>
      <div style="font-size:.82rem;color:#6366F1">${accessDescriptions[accessLevel] || accessDescriptions.view}</div>
    </div>
    <p style="color:#475569;font-size:.875rem;line-height:1.7">
      If an emergency access request is ever triggered, you will receive an email with a unique verification code.
      You will need to visit the Legacy Vault verification page and enter your code to approve or deny access.
    </p>
    <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:.875rem;margin-top:1rem;font-size:.8rem;color:#166534">
      <strong>🔒 Your role is important.</strong> Emergency access requires 2 out of 3 trusted contacts to approve. Your decision matters.
    </div>
  </div>
  <div style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:1.25rem 2rem;text-align:center;font-size:.75rem;color:#94A3B8">
    © 2026 Legacy Vault. You received this because ${vaultOwnerName} added you as a trusted contact.
  </div>
</div>
</body></html>`;

    try {
        const transporter = createTransporter();
        await transporter.sendMail({
            from: FROM,
            to: contactEmail,
            subject: `You've been added as a Trusted Contact — Legacy Vault`,
            html,
            text: `Hello ${contactName},\n\n${vaultOwnerName} has added you as a Trusted Contact on Legacy Vault.\n\nAccess Level: ${accessLevel}\n\nIf an emergency occurs, you will receive a verification code by email.\n\nLegacy Vault`
        });
        console.log(`[EMAIL SENT] Contact added notification to ${contactEmail}`);
        return { success: true };
    } catch (err) {
        console.error(`[EMAIL ERROR] Contact added:`, err.message);
        return { success: false, error: err.message };
    }
};

// ── SEND LIVENESS CHECK EMAIL ───────────────────────────────────
// Sent at each checkpoint (threshold/3 days) to ask "Are you still active?"
// checkNumber: 1, 2, or 3
// maxChecks: always 3
// totalThresholdDays: user's full inactivity threshold (e.g. 150)
// checkIntervalDays: threshold / 3 (e.g. 50)
const sendLivenessCheck = async ({ userEmail, userName, checkNumber, maxChecks = 3, confirmUrl, expiresAt, checkIntervalDays, totalThresholdDays }) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`[EMAIL SKIPPED] Liveness check #${checkNumber} for ${userEmail}. Confirm: ${confirmUrl}`);
        return { success: false, reason: 'Email not configured' };
    }

    const expiryStr = new Date(expiresAt).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const checksRemaining = maxChecks - checkNumber;
    const urgencyColor = checkNumber === 1 ? '#1E40AF' : checkNumber === 2 ? '#92400E' : '#991B1B';
    const urgencyBg = checkNumber === 1 ? '#EFF6FF' : checkNumber === 2 ? '#FFFBEB' : '#FEF2F2';
    const urgencyBorder = checkNumber === 1 ? '#BFDBFE' : checkNumber === 2 ? '#FDE68A' : '#FECACA';
    const urgencyIcon = checkNumber === 1 ? '🔔' : checkNumber === 2 ? '⚠️' : '🚨';
    const threshold = totalThresholdDays || (checkIntervalDays * maxChecks);

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif">
  <div style="max-width:560px;margin:2rem auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.1);border:1px solid #E2E8F0">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4F46E5,#6366F1);padding:2rem;text-align:center">
      <div style="font-family:Georgia,serif;font-size:1.5rem;font-weight:800;color:#fff;margin-bottom:.25rem">Legacy<span style="color:#A5F3FC">Vault</span></div>
      <div style="font-size:.75rem;color:rgba(255,255,255,.7);letter-spacing:2px;text-transform:uppercase">Activity Verification</div>
    </div>
    <!-- Urgency Banner -->
    <div style="background:${urgencyBg};border-bottom:1px solid ${urgencyBorder};padding:1rem 2rem;display:flex;align-items:center;gap:12px">
      <div style="font-size:1.5rem">${urgencyIcon}</div>
      <div>
        <div style="font-weight:700;color:${urgencyColor};font-size:.9rem">Activity Check ${checkNumber} of ${maxChecks}</div>
        <div style="color:${urgencyColor};font-size:.8rem;opacity:.85">${checksRemaining > 0
            ? `${checksRemaining} check${checksRemaining > 1 ? 's' : ''} remaining before emergency is triggered`
            : 'FINAL CHECK — Emergency will be triggered if you do not respond'
        }</div>
      </div>
    </div>
    <!-- Body -->
    <div style="padding:2rem">
      <p style="color:#0F172A;font-size:.95rem;margin:0 0 1rem">Hello <strong>${userName}</strong>,</p>
      <p style="color:#475569;font-size:.875rem;line-height:1.7;margin:0 0 1.5rem">
        Legacy Vault has not detected any activity on your account for <strong>${checkNumber * checkIntervalDays} days</strong>.
        This is your <strong>Check ${checkNumber} of ${maxChecks}</strong> — please confirm you are still active to prevent emergency access from being triggered.
      </p>
      <!-- Timeline -->
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:1.25rem;margin-bottom:1.5rem">
        <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94A3B8;margin-bottom:.875rem">Your ${threshold}-Day Verification Timeline</div>
        ${[1, 2, 3].map(n => `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:.5rem">
          <div style="width:24px;height:24px;border-radius:50%;background:${n < checkNumber ? '#22C55E' : n === checkNumber ? '#4F46E5' : '#E2E8F0'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span style="color:#fff;font-size:.65rem;font-weight:800">${n < checkNumber ? '✓' : n}</span>
          </div>
          <div style="font-size:.82rem;color:${n === checkNumber ? '#0F172A' : '#94A3B8'};font-weight:${n === checkNumber ? '600' : '400'}">
            Day ${n * checkIntervalDays}: Check ${n}${n < checkNumber ? ' — <span style="color:#EF4444">Missed</span>' : n === checkNumber ? ' — <strong style="color:#4F46E5">Current (respond now)</strong>' : ' — Upcoming'}
          </div>
        </div>`).join('')}
        <div style="display:flex;align-items:center;gap:10px;margin-top:.5rem">
          <div style="width:24px;height:24px;border-radius:50%;background:#EF4444;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span style="color:#fff;font-size:.65rem;font-weight:800">!</span>
          </div>
          <div style="font-size:.82rem;color:#94A3B8">Day ${threshold}: Emergency triggered if no response to all 3 checks</div>
        </div>
      </div>
      <!-- CTA -->
      <div style="text-align:center;margin:1.5rem 0">
        <a href="${confirmUrl}" style="display:inline-block;background:linear-gradient(135deg,#4F46E5,#6366F1);color:#fff;text-decoration:none;padding:1rem 2.5rem;border-radius:10px;font-weight:700;font-size:1rem;box-shadow:0 4px 16px rgba(79,70,229,.3)">
          ✅ Yes, I Am Still Active
        </a>
      </div>
      <p style="color:#94A3B8;font-size:.78rem;text-align:center;margin:.5rem 0">
        Or copy this link: <a href="${confirmUrl}" style="color:#4F46E5">${confirmUrl}</a>
      </p>
      <!-- Warning -->
      <div style="background:${urgencyBg};border:1px solid ${urgencyBorder};border-radius:10px;padding:.875rem;margin-top:1.5rem">
        <div style="font-size:.8rem;color:${urgencyColor}">
          <strong>⏰ This link expires:</strong> ${expiryStr}<br>
          <span style="opacity:.85">${checkNumber < maxChecks
            ? `If you do not respond, check ${checkNumber + 1} will be sent in ${checkIntervalDays} days.`
            : 'If you do not respond, emergency access will be triggered and your trusted contacts will be notified.'
          }</span>
        </div>
      </div>
      <!-- Tip -->
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:.875rem;margin-top:.75rem">
        <div style="font-size:.8rem;color:#166534">
          <strong>💡 Tip:</strong> Simply logging in to your Legacy Vault account also resets the inactivity timer automatically.
        </div>
      </div>
    </div>
    <!-- Footer -->
    <div style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:1.25rem 2rem;text-align:center">
      <div style="font-size:.75rem;color:#94A3B8">© 2026 Legacy Vault. If you recently logged in, you can ignore this email.</div>
      <div style="font-size:.75rem;color:#94A3B8;margin-top:.25rem">You received this because you have an active Legacy Vault account.</div>
    </div>
  </div>
</body>
</html>`;

    try {
        const transporter = createTransporter();
        await transporter.sendMail({
            from: FROM,
            to: userEmail,
            subject: `${urgencyIcon} Activity Check ${checkNumber}/${maxChecks} — Are you still active? | Legacy Vault`,
            html,
            text: `Hello ${userName},\n\nThis is Activity Check ${checkNumber} of ${maxChecks}.\n\nLegacy Vault has not detected activity on your account for ${checkNumber * checkIntervalDays} days.\n\nPlease confirm you are still active:\n${confirmUrl}\n\nIf you do not respond, emergency access will be triggered after all ${maxChecks} checks are missed (${threshold} days total).\n\nLegacy Vault`
        });
        console.log(`[EMAIL SENT] Liveness check #${checkNumber} to ${userEmail}`);
        return { success: true };
    } catch (err) {
        console.error(`[EMAIL ERROR] Liveness check:`, err.message);
        return { success: false, error: err.message };
    }
};

// module.exports moved to bottom of file after sendPasswordReset

// ── SEND PASSWORD RESET EMAIL ───────────────────────────────────
const sendPasswordReset = async ({ userEmail, userName, resetUrl, expiresAt }) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`[EMAIL SKIPPED] Password reset for ${userEmail}. Link: ${resetUrl}`);
        return { success: false, reason: 'Email not configured' };
    }

    const expiryStr = new Date(expiresAt).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: true
    }) + ' — ' + new Date(expiresAt).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif">
  <div style="max-width:560px;margin:2rem auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.1);border:1px solid #E2E8F0">
    <div style="background:linear-gradient(135deg,#4F46E5,#6366F1);padding:2rem;text-align:center">
      <div style="font-family:Georgia,serif;font-size:1.5rem;font-weight:800;color:#fff;margin-bottom:.25rem">Legacy<span style="color:#A5F3FC">Vault</span></div>
      <div style="font-size:.75rem;color:rgba(255,255,255,.7);letter-spacing:2px;text-transform:uppercase">Password Reset</div>
    </div>
    <div style="padding:2rem">
      <p style="color:#0F172A;font-size:.95rem;margin:0 0 1rem">Hello <strong>${userName}</strong>,</p>
      <p style="color:#475569;font-size:.875rem;line-height:1.7;margin:0 0 1.5rem">
        We received a request to reset the password for your Legacy Vault account.
        Click the button below to set a new password.
      </p>
      <div style="text-align:center;margin:1.5rem 0">
        <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#4F46E5,#6366F1);color:#fff;text-decoration:none;padding:1rem 2.5rem;border-radius:10px;font-weight:700;font-size:1rem;box-shadow:0 4px 16px rgba(79,70,229,.3)">
          Reset My Password →
        </a>
      </div>
      <p style="color:#94A3B8;font-size:.78rem;text-align:center;margin:.5rem 0">
        Or copy this link:<br><a href="${resetUrl}" style="color:#4F46E5;word-break:break-all">${resetUrl}</a>
      </p>
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:.875rem;margin-top:1.5rem">
        <div style="font-size:.8rem;color:#92400E"><strong>⏰ This link expires at:</strong> ${expiryStr}</div>
        <div style="font-size:.78rem;color:#92400E;margin-top:.25rem">The link is single-use and expires in 1 hour.</div>
      </div>
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:.875rem;margin-top:.75rem">
        <div style="font-size:.8rem;color:#166534"><strong>🔒 Didn't request this?</strong> If you did not request a password reset, you can safely ignore this email. Your password will not change.</div>
      </div>
    </div>
    <div style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:1.25rem 2rem;text-align:center">
      <div style="font-size:.75rem;color:#94A3B8">© 2026 Legacy Vault. This link expires in 1 hour.</div>
    </div>
  </div>
</body>
</html>`;

    try {
        const transporter = createTransporter();
        await transporter.sendMail({
            from: FROM,
            to: userEmail,
            subject: `🔑 Reset Your Legacy Vault Password`,
            html,
            text: `Hello ${userName},\n\nClick the link below to reset your password:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, ignore this email.\n\nLegacy Vault`
        });
        console.log(`[EMAIL SENT] Password reset to ${userEmail}`);
        return { success: true };
    } catch (err) {
        console.error(`[EMAIL ERROR] Password reset:`, err.message);
        return { success: false, error: err.message };
    }
};

module.exports = { sendEmergencyCode, sendAccessGranted, sendAccessDenied, sendContactAdded, sendLivenessCheck, sendPasswordReset };
