const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const { sendEmergencyCode, sendAccessGranted, sendAccessDenied } = require('../utils/mailer');

// Generate a 6-digit code
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// GET emergency status
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const [requests] = await db.execute(
            `SELECT ar.*,
             (SELECT COUNT(*) FROM access_approvals WHERE request_id = ar.id AND decision='approved') as approved_count,
             (SELECT COUNT(*) FROM access_approvals WHERE request_id = ar.id AND decision='denied') as denied_count
             FROM access_requests ar WHERE ar.user_id = ? ORDER BY ar.created_at DESC LIMIT 5`,
            [req.user.id]
        );
        const [user] = await db.execute(
            'SELECT last_activity_timestamp, inactivity_threshold_days, missed_checks, last_check_sent_at, last_confirmed_at FROM users WHERE id = ?',
            [req.user.id]
        );
        const lastActivity = user[0].last_activity_timestamp;
        const threshold = user[0].inactivity_threshold_days || 150;
        const missedChecks = user[0].missed_checks || 0;
        const daysSince = lastActivity ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000) : 0;

        // Get liveness tokens for this user
        const [livenessTokens] = await db.execute(
            `SELECT check_number, status, sent_at, confirmed_at, expires_at FROM liveness_tokens
             WHERE user_id = ? ORDER BY check_number DESC LIMIT 3`,
            [req.user.id]
        );

        res.json({
            success: true,
            requests,
            inactivity: {
                days_since_activity: daysSince,
                threshold_days: threshold,
                is_inactive: daysSince >= threshold,
                missed_checks: missedChecks,
                last_check_sent_at: user[0].last_check_sent_at,
                last_confirmed_at: user[0].last_confirmed_at
            },
            liveness: {
                checks: livenessTokens,
                interval_days: Math.floor(threshold / 3)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch status' });
    }
});

// POST trigger emergency access — generates codes for each trusted contact
router.post('/trigger', authenticateToken, async (req, res) => {
    const { reason } = req.body;
    try {
        // Check for existing pending
        const [existing] = await db.execute(`SELECT id FROM access_requests WHERE user_id = ? AND status = 'pending'`, [req.user.id]);
        if (existing.length) return res.status(409).json({ success: false, message: 'An emergency access request is already pending' });

        // Get trusted contacts
        const [contacts] = await db.execute('SELECT * FROM trusted_contacts WHERE user_id = ?', [req.user.id]);
        if (contacts.length < 2) return res.status(400).json({ success: false, message: 'You need at least 2 trusted contacts to trigger emergency access' });

        // 2-of-3 rule: require 2 approvals, max 3 contacts used
        const approvalsRequired = 2;
        const uuid = uuidv4();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const [result] = await db.execute(
            `INSERT INTO access_requests (uuid, user_id, request_type, status, approvals_required, reason, expires_at) VALUES (?,?,?,?,?,?,?)`,
            [uuid, req.user.id, 'emergency', 'pending', approvalsRequired, reason || 'Emergency access requested', expiresAt]
        );
        const requestId = result.insertId;

        // Generate unique code for each trusted contact (max 3)
        const selectedContacts = contacts.slice(0, 3);
        const codesGenerated = [];
        for (const contact of selectedContacts) {
            const code = generateCode();
            const codeExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            await db.execute(
                'INSERT INTO verification_codes (request_id, contact_id, code, expires_at) VALUES (?,?,?,?)',
                [requestId, contact.id, code, codeExpiry]
            );
            // Log notification
            await db.execute(
                'INSERT INTO contact_notifications (contact_id, user_id, type, message) VALUES (?,?,?,?)',
                [contact.id, req.user.id, 'access_request', `An emergency access request has been initiated for vault owner. Your verification code is: ${code}`]
            );
            codesGenerated.push({ contact_name: contact.name, contact_email: contact.email, code });
        }

        // Send emails to each contact with their verification code
        const [vaultOwner] = await db.execute('SELECT full_name FROM users WHERE id = ?', [req.user.id]);
        const ownerName = vaultOwner[0]?.full_name || 'Vault Owner';
        for (const c of codesGenerated) {
            await sendEmergencyCode({
                contactName: c.contact_name,
                contactEmail: c.contact_email,
                vaultOwnerName: ownerName,
                code: c.code,
                requestUuid: uuid,
                reason: reason || null,
                expiresAt: expiresAt
            });
        }

        await logActivity(req.user.id, 'EMERGENCY_TRIGGERED', `Emergency access request created. ${selectedContacts.length} contacts notified.`, req, 'high');

        res.status(201).json({
            success: true,
            message: 'Emergency access request created. Trusted contacts have been notified with their verification codes.',
            request: { uuid, approvals_required: approvalsRequired, expires_at: expiresAt },
            // In production, codes would be emailed. For demo, returned in response.
            contacts_notified: codesGenerated.map(c => ({ name: c.contact_name, email: c.contact_email })),
            // Show codes in UI for demo purposes
            verification_codes: codesGenerated
        });
    } catch (err) {
        console.error('Emergency trigger error:', err);
        res.status(500).json({ success: false, message: 'Failed to create emergency request' });
    }
});

// POST trusted contact responds with their code
router.post('/respond/:requestUuid', [
    body('decision').isIn(['approved','denied']),
    body('contact_id').isInt(),
    body('code').notEmpty().withMessage('Verification code required'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { decision, contact_id, code, comment } = req.body;
    try {
        const [requests] = await db.execute(
            `SELECT * FROM access_requests WHERE uuid = ? AND status = 'pending' AND expires_at > NOW()`,
            [req.params.requestUuid]
        );
        if (!requests.length) return res.status(404).json({ success: false, message: 'Request not found or expired' });
        const request = requests[0];

        // Verify contact belongs to this user
        const [contacts] = await db.execute('SELECT id FROM trusted_contacts WHERE id = ? AND user_id = ?', [contact_id, request.user_id]);
        if (!contacts.length) return res.status(403).json({ success: false, message: 'Unauthorized contact' });

        // Verify the code
        const [codes] = await db.execute(
            `SELECT * FROM verification_codes WHERE request_id = ? AND contact_id = ? AND is_used = 0 AND expires_at > NOW()`,
            [request.id, contact_id]
        );
        if (!codes.length) return res.status(400).json({ success: false, message: 'No valid verification code found for this contact' });
        if (codes[0].code !== code.trim()) return res.status(400).json({ success: false, message: 'Invalid verification code' });

        // Check already responded
        const [alreadyVoted] = await db.execute('SELECT id FROM access_approvals WHERE request_id = ? AND contact_id = ?', [request.id, contact_id]);
        if (alreadyVoted.length) return res.status(409).json({ success: false, message: 'You have already responded to this request' });

        // Mark code as used
        await db.execute('UPDATE verification_codes SET is_used = 1 WHERE id = ?', [codes[0].id]);

        // Record decision
        await db.execute('INSERT INTO access_approvals (request_id, contact_id, decision, comment) VALUES (?,?,?,?)', [request.id, contact_id, decision, comment || null]);

        // Log notification
        await db.execute('INSERT INTO contact_notifications (contact_id, user_id, type, message) VALUES (?,?,?,?)',
            [contact_id, request.user_id, decision === 'approved' ? 'approved' : 'denied', `Contact ${decision} the access request`]);

        if (decision === 'approved') {
            const newCount = request.approvals_count + 1;
            if (newCount >= request.approvals_required) {
                await db.execute(`UPDATE access_requests SET status = 'approved', approvals_count = ? WHERE id = ?`, [newCount, request.id]);
                await logActivity(request.user_id, 'EMERGENCY_APPROVED', `Emergency access GRANTED. ${newCount}/${request.approvals_required} approvals met.`, null, 'critical');

                // Email all contacts that access was granted
                const [allContacts] = await db.execute(
                    `SELECT tc.name, tc.email FROM trusted_contacts tc
                     JOIN verification_codes vc ON vc.contact_id = tc.id
                     WHERE vc.request_id = ?`, [request.id]
                );
                const [owner] = await db.execute('SELECT full_name FROM users WHERE id = ?', [request.user_id]);
                for (const c of allContacts) {
                    await sendAccessGranted({
                        contactEmail: c.email, contactName: c.name,
                        vaultOwnerName: owner[0]?.full_name || 'Vault Owner',
                        requestUuid: req.params.requestUuid
                    });
                }
                return res.json({ success: true, message: 'Access GRANTED. Required approvals met. Documents are now accessible.', access_granted: true });
            } else {
                await db.execute('UPDATE access_requests SET approvals_count = ? WHERE id = ?', [newCount, request.id]);
                return res.json({ success: true, message: `Approval recorded. ${newCount}/${request.approvals_required} approvals so far.`, access_granted: false });
            }
        } else {
            await db.execute(`UPDATE access_requests SET status = 'denied', denial_count = denial_count + 1 WHERE id = ?`, [request.id]);
            await logActivity(request.user_id, 'EMERGENCY_DENIED', 'Emergency access DENIED by trusted contact.', null, 'high');

            // Email all contacts that access was denied
            const [allContacts] = await db.execute(
                `SELECT tc.name, tc.email FROM trusted_contacts tc
                 JOIN verification_codes vc ON vc.contact_id = tc.id
                 WHERE vc.request_id = ?`, [request.id]
            );
            const [owner] = await db.execute('SELECT full_name FROM users WHERE id = ?', [request.user_id]);
            for (const c of allContacts) {
                await sendAccessDenied({
                    contactEmail: c.email, contactName: c.name,
                    vaultOwnerName: owner[0]?.full_name || 'Vault Owner'
                });
            }
            return res.json({ success: true, message: 'Access DENIED.', access_granted: false });
        }
    } catch (err) {
        console.error('Respond error:', err);
        res.status(500).json({ success: false, message: 'Failed to process response' });
    }
});

// GET public access request info (for trusted contacts to view)
router.get('/request/:uuid', async (req, res) => {
    try {
        const [requests] = await db.execute(
            `SELECT ar.uuid, ar.status, ar.approvals_required, ar.approvals_count, ar.reason, ar.expires_at, ar.created_at,
             u.full_name as vault_owner
             FROM access_requests ar JOIN users u ON ar.user_id = u.id
             WHERE ar.uuid = ?`,
            [req.params.uuid]
        );
        if (!requests.length) return res.status(404).json({ success: false, message: 'Request not found' });
        res.json({ success: true, request: requests[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch request' });
    }
});

// GET all requests for user
router.get('/requests', authenticateToken, async (req, res) => {
    try {
        const [requests] = await db.execute(
            `SELECT ar.*,
             (SELECT COUNT(*) FROM access_approvals WHERE request_id = ar.id AND decision='approved') as approved_count,
             (SELECT COUNT(*) FROM access_approvals WHERE request_id = ar.id AND decision='denied') as denied_count
             FROM access_requests ar WHERE ar.user_id = ? ORDER BY ar.created_at DESC`,
            [req.user.id]
        );
        res.json({ success: true, requests });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch requests' });
    }
});

// PUT update inactivity threshold
router.put('/settings', authenticateToken, [body('inactivity_threshold_days').isInt({ min: 30, max: 730 })], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
        await db.execute('UPDATE users SET inactivity_threshold_days = ? WHERE id = ?', [req.body.inactivity_threshold_days, req.user.id]);
        await logActivity(req.user.id, 'EMERGENCY_SETTINGS_UPDATED', 'Inactivity threshold updated', req, 'low');
        res.json({ success: true, message: 'Settings updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Update failed' });
    }
});

module.exports = router;
