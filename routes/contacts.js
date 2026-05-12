const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const { sendContactAdded } = require('../utils/mailer');

// GET all trusted contacts
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [contacts] = await db.execute(
            'SELECT * FROM trusted_contacts WHERE user_id = ? ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json({ success: true, contacts });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch contacts' });
    }
});

// POST add trusted contact
router.post('/', authenticateToken, [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('phone').optional({ checkFalsy: true }).isMobilePhone(),
    body('relationship').optional().trim().isLength({ max: 100 }),
    body('access_level').optional().isIn(['view','full','emergency']),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, phone, relationship, access_level, can_trigger_emergency } = req.body;

    try {
        // Check limit
        const [count] = await db.execute(
            'SELECT COUNT(*) as cnt FROM trusted_contacts WHERE user_id = ?',
            [req.user.id]
        );
        if (count[0].cnt >= 10) {
            return res.status(400).json({ success: false, message: 'Maximum 10 trusted contacts allowed' });
        }

        // Check duplicate
        const [existing] = await db.execute(
            'SELECT id FROM trusted_contacts WHERE user_id = ? AND email = ?',
            [req.user.id, email]
        );
        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: 'Contact with this email already exists' });
        }

        const [result] = await db.execute(
            `INSERT INTO trusted_contacts (user_id, name, email, phone, relationship, access_level, can_trigger_emergency)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, name, email, phone || null, relationship || null,
             access_level || 'view', can_trigger_emergency ? 1 : 0]
        );

        await logActivity(req.user.id, 'CONTACT_ADDED', `Added trusted contact: ${name} (${email})`, req, 'low');

        // Send email notification if user chose to notify
        if (req.body.notify_contact) {
            const [owner] = await db.execute('SELECT full_name FROM users WHERE id = ?', [req.user.id]);
            await sendContactAdded({
                contactEmail: email,
                contactName: name,
                vaultOwnerName: owner[0]?.full_name || 'Vault Owner',
                accessLevel: access_level || 'view'
            });
            await logActivity(req.user.id, 'CONTACT_NOTIFIED', `Email notification sent to trusted contact: ${email}`, req, 'low');
        }

        res.status(201).json({
            success: true,
            message: req.body.notify_contact
                ? `${name} added as trusted contact. They have been notified.`
                : `${name} added as trusted contact silently.`,
            contact: { id: result.insertId, name, email },
            notified: !!req.body.notify_contact
        });
    } catch (err) {
        console.error('Add contact error:', err);
        res.status(500).json({ success: false, message: 'Failed to add contact' });
    }
});

// PUT update trusted contact
router.put('/:id', authenticateToken, [
    body('name').optional().trim().isLength({ min: 2, max: 100 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('access_level').optional().isIn(['view','full','emergency']),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, phone, relationship, access_level, can_trigger_emergency } = req.body;

    try {
        const [result] = await db.execute(
            `UPDATE trusted_contacts SET
             name = COALESCE(?, name),
             email = COALESCE(?, email),
             phone = COALESCE(?, phone),
             relationship = COALESCE(?, relationship),
             access_level = COALESCE(?, access_level),
             can_trigger_emergency = COALESCE(?, can_trigger_emergency)
             WHERE id = ? AND user_id = ?`,
            [name || null, email || null, phone || null, relationship || null,
             access_level || null, can_trigger_emergency !== undefined ? (can_trigger_emergency ? 1 : 0) : null,
             req.params.id, req.user.id]
        );

        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Contact not found' });
        await logActivity(req.user.id, 'CONTACT_UPDATED', `Updated contact ID: ${req.params.id}`, req, 'low');
        res.json({ success: true, message: 'Contact updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Update failed' });
    }
});

// DELETE trusted contact
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const [result] = await db.execute(
            'DELETE FROM trusted_contacts WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Contact not found' });
        await logActivity(req.user.id, 'CONTACT_DELETED', `Deleted contact ID: ${req.params.id}`, req, 'medium');
        res.json({ success: true, message: 'Contact removed successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Delete failed' });
    }
});

module.exports = router;
