// ============================================================
// LEGACY VAULT — Access Tokens Route
// Handles generation and management of secure access tokens
// for trusted contacts to access documents
// ============================================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const { sendEmergencyCode } = require('../utils/mailer');

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── POST generate access token for a contact ──────────────────
// Owner generates a token to give a contact access to a document or general docs
router.post('/generate', authenticateToken, [
    body('contact_id').isInt().withMessage('Contact ID required'),
    body('document_id').optional().isInt(),
    body('access_type').isIn(['document','general']).withMessage('Access type required'),
    body('expires_hours').optional().isInt({ min: 1, max: 720 }),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { contact_id, document_id, access_type, expires_hours = 72 } = req.body;

    try {
        // Verify contact belongs to this user
        const [contacts] = await db.execute(
            'SELECT * FROM trusted_contacts WHERE id = ? AND user_id = ?',
            [contact_id, req.user.id]
        );
        if (!contacts.length) return res.status(404).json({ success: false, message: 'Contact not found' });
        const contact = contacts[0];

        // If document access, verify document belongs to user
        let docId = null;
        let docTitle = null;
        if (access_type === 'document' && document_id) {
            const [docs] = await db.execute(
                'SELECT id, title, uuid, is_password_protected FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 0',
                [document_id, req.user.id]
            );
            if (!docs.length) return res.status(404).json({ success: false, message: 'Document not found' });

            // Check document-specific access: if doc has assigned_contact_id, only that contact can get a token
            const [docCheck] = await db.execute(
                'SELECT assigned_contact_id, inheritance_type FROM documents WHERE id = ?',
                [document_id]
            );
            if (docCheck[0].inheritance_type === 'specific' &&
                docCheck[0].assigned_contact_id &&
                docCheck[0].assigned_contact_id !== parseInt(contact_id)) {
                return res.status(403).json({
                    success: false,
                    message: 'This document is assigned to a different contact'
                });
            }

            docId = docs[0].id;
            docTitle = docs[0].title;
        }

        // Revoke any existing pending tokens for this contact+document
        await db.execute(
            `UPDATE access_tokens SET status = 'revoked'
             WHERE contact_id = ? AND user_id = ? AND status = 'pending'
             AND (document_id = ? OR (document_id IS NULL AND ? IS NULL))`,
            [contact_id, req.user.id, docId, docId]
        );

        // Generate token
        const tokenId = uuidv4();
        const code = generateCode();
        const expiresAt = new Date(Date.now() + expires_hours * 60 * 60 * 1000);

        await db.execute(
            `INSERT INTO access_tokens (token_id, contact_id, document_id, user_id, verification_code,
             token_hash, access_type, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [tokenId, contact_id, docId, req.user.id, code,
             await bcrypt.hash(tokenId + code, 10), access_type, expiresAt]
        );

        // Get owner info for email
        const [owner] = await db.execute('SELECT full_name FROM users WHERE id = ?', [req.user.id]);
        const ownerName = owner[0]?.full_name || 'Vault Owner';

        // Send email to contact
        await sendEmergencyCode({
            contactName: contact.name,
            contactEmail: contact.email,
            vaultOwnerName: ownerName,
            code,
            requestUuid: tokenId,
            reason: access_type === 'document'
                ? `Access to document: "${docTitle}"`
                : 'General inheritance document access',
            expiresAt
        });

        await logActivity(req.user.id, 'ACCESS_TOKEN_GENERATED',
            `Token generated for ${contact.email} — ${access_type} access${docTitle ? ` to "${docTitle}"` : ''}`,
            req, 'medium');

        res.status(201).json({
            success: true,
            message: `Access token generated and sent to ${contact.email}`,
            token: {
                token_id: tokenId,
                contact_name: contact.name,
                contact_email: contact.email,
                access_type,
                document_title: docTitle,
                expires_at: expiresAt,
                verification_code: code // shown in UI for demo; in production only emailed
            }
        });
    } catch (err) {
        console.error('Token generation error:', err);
        res.status(500).json({ success: false, message: 'Failed to generate token' });
    }
});

// ── GET all tokens for owner ───────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [tokens] = await db.execute(
            `SELECT at.token_id, at.access_type, at.status, at.attempts, at.expires_at,
                    at.used_at, at.created_at, at.ip_address,
                    tc.name as contact_name, tc.email as contact_email,
                    d.title as document_title, d.uuid as document_uuid
             FROM access_tokens at
             JOIN trusted_contacts tc ON at.contact_id = tc.id
             LEFT JOIN documents d ON at.document_id = d.id
             WHERE at.user_id = ?
             ORDER BY at.created_at DESC`,
            [req.user.id]
        );
        res.json({ success: true, tokens });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch tokens' });
    }
});

// ── DELETE revoke a token ──────────────────────────────────────
router.delete('/:tokenId', authenticateToken, async (req, res) => {
    try {
        const [result] = await db.execute(
            "UPDATE access_tokens SET status = 'revoked' WHERE token_id = ? AND user_id = ?",
            [req.params.tokenId, req.user.id]
        );
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Token not found' });
        await logActivity(req.user.id, 'ACCESS_TOKEN_REVOKED', `Token ${req.params.tokenId} revoked`, req, 'medium');
        res.json({ success: true, message: 'Token revoked' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to revoke token' });
    }
});

// ── GET document access log ────────────────────────────────────
router.get('/access-log', authenticateToken, async (req, res) => {
    try {
        const [logs] = await db.execute(
            `SELECT dal.*, tc.name as contact_name, tc.email as contact_email,
                    d.title as document_title
             FROM document_access_log dal
             JOIN trusted_contacts tc ON dal.contact_id = tc.id
             JOIN documents d ON dal.document_id = d.id
             WHERE dal.user_id = ?
             ORDER BY dal.accessed_at DESC
             LIMIT 100`,
            [req.user.id]
        );
        res.json({ success: true, logs });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch access log' });
    }
});

// ── GET inheritance settings ───────────────────────────────────
router.get('/inheritance-settings', authenticateToken, async (req, res) => {
    try {
        const [settings] = await db.execute(
            'SELECT * FROM inheritance_settings WHERE user_id = ?',
            [req.user.id]
        );
        if (!settings.length) {
            // Create default settings
            await db.execute(
                'INSERT INTO inheritance_settings (user_id) VALUES (?)',
                [req.user.id]
            );
            return res.json({ success: true, settings: { user_id: req.user.id, inactivity_threshold_days: 180, general_access_level: 'download', notify_on_access: true, auto_revoke_days: 30 } });
        }
        res.json({ success: true, settings: settings[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch settings' });
    }
});

// ── PUT update inheritance settings ───────────────────────────
router.put('/inheritance-settings', authenticateToken, async (req, res) => {
    const { inactivity_threshold_days, general_access_level, notify_on_access, auto_revoke_days, require_document_pin } = req.body;
    try {
        await db.execute(
            `INSERT INTO inheritance_settings (user_id, inactivity_threshold_days, general_access_level, notify_on_access, auto_revoke_days, require_document_pin)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             inactivity_threshold_days = VALUES(inactivity_threshold_days),
             general_access_level = VALUES(general_access_level),
             notify_on_access = VALUES(notify_on_access),
             auto_revoke_days = VALUES(auto_revoke_days),
             require_document_pin = VALUES(require_document_pin)`,
            [req.user.id, inactivity_threshold_days || 180, general_access_level || 'download',
             notify_on_access !== false, auto_revoke_days || 30, require_document_pin || false]
        );
        await logActivity(req.user.id, 'INHERITANCE_SETTINGS_UPDATED', 'Inheritance settings updated', req, 'low');
        res.json({ success: true, message: 'Settings updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update settings' });
    }
});

module.exports = router;
