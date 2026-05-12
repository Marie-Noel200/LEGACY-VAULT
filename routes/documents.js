const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { encryptFile, decryptFile } = require('../utils/encryption');
const { logActivity } = require('../utils/logger');
const { uploadLimiter } = require('../middleware/rateLimiter');

// Multer config
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png', '.xlsx', '.xls'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('File type not allowed'));
    }
});

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── GET all documents (owner) ──────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [docs] = await db.execute(
            `SELECT d.id, d.uuid, d.title, d.description, d.file_name, d.file_size,
                    d.file_type, d.category, d.is_encrypted, d.is_password_protected,
                    d.inheritance_type, d.assigned_contact_id, d.access_note,
                    d.created_at, d.updated_at,
                    tc.name as assigned_contact_name, tc.email as assigned_contact_email
             FROM documents d
             LEFT JOIN trusted_contacts tc ON d.assigned_contact_id = tc.id
             WHERE d.user_id = ? AND d.is_deleted = 0
             ORDER BY d.created_at DESC`,
            [req.user.id]
        );
        await logActivity(req.user.id, 'DOCUMENTS_VIEWED', 'User viewed document list', req, 'low');
        res.json({ success: true, documents: docs });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch documents' });
    }
});

// ── GET single document metadata ───────────────────────────────
router.get('/:uuid', authenticateToken, async (req, res) => {
    try {
        const [docs] = await db.execute(
            `SELECT d.id, d.uuid, d.title, d.description, d.file_name, d.file_size,
                    d.file_type, d.category, d.is_encrypted, d.is_password_protected,
                    d.inheritance_type, d.assigned_contact_id, d.access_note, d.created_at,
                    tc.name as assigned_contact_name, tc.email as assigned_contact_email
             FROM documents d
             LEFT JOIN trusted_contacts tc ON d.assigned_contact_id = tc.id
             WHERE d.uuid = ? AND d.user_id = ? AND d.is_deleted = 0`,
            [req.params.uuid, req.user.id]
        );
        if (docs.length === 0) return res.status(404).json({ success: false, message: 'Document not found' });
        res.json({ success: true, document: docs[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch document' });
    }
});

// ── POST upload document ───────────────────────────────────────
router.post('/upload', authenticateToken, uploadLimiter, upload.single('document'), [
    body('title').trim().isLength({ min: 1, max: 255 }).withMessage('Title required'),
    body('category').optional().isIn(['will','property','financial','insurance','personal','other']),
    body('document_password').optional().isLength({ min: 4, max: 50 }).withMessage('Document PIN must be 4-50 characters'),
    body('assigned_contact_id').optional().isInt(),
    body('inheritance_type').optional().isIn(['general','specific']),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const { title, description, category, document_password, assigned_contact_id, access_note, inheritance_type } = req.body;

    try {
        // Encrypt the file
        const uuid = uuidv4();
        const { iv, encryptedData } = encryptFile(req.file.buffer);

        // Hash document password if provided
        let docPasswordHash = null;
        let isPasswordProtected = false;
        if (document_password && document_password.trim()) {
            const salt = await bcrypt.genSalt(12);
            docPasswordHash = await bcrypt.hash(document_password.trim(), salt);
            isPasswordProtected = true;
        }

        // Validate assigned contact belongs to this user
        let validContactId = null;
        let docInheritanceType = 'general';
        if (assigned_contact_id && parseInt(assigned_contact_id) > 0) {
            const [contacts] = await db.execute(
                'SELECT id FROM trusted_contacts WHERE id = ? AND user_id = ?',
                [assigned_contact_id, req.user.id]
            );
            if (contacts.length > 0) {
                validContactId = parseInt(assigned_contact_id);
                docInheritanceType = 'specific';
                // Update contact role_type to document-specific
                await db.execute(
                    'UPDATE trusted_contacts SET role_type = "document-specific" WHERE id = ? AND user_id = ?',
                    [validContactId, req.user.id]
                );
            }
        }

        const [result] = await db.execute(
            `INSERT INTO documents (uuid, user_id, title, description, file_name, file_size, file_type,
             encrypted_data, encryption_iv, is_encrypted, category, document_password_hash,
             is_password_protected, assigned_contact_id, access_note, inheritance_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
            [uuid, req.user.id, title, description || null, req.file.originalname,
             req.file.size, req.file.mimetype, encryptedData, iv, category || 'other',
             docPasswordHash, isPasswordProtected, validContactId, access_note || null,
             docInheritanceType]
        );

        // Log with detail about assignment
        const logDetail = validContactId
            ? `Uploaded: ${title} — assigned to contact ID ${validContactId}${isPasswordProtected ? ' (PIN protected)' : ''}`
            : `Uploaded: ${title} (general)${isPasswordProtected ? ' (PIN protected)' : ''}`;
        await logActivity(req.user.id, 'DOCUMENT_UPLOADED', logDetail, req, 'low');

        if (validContactId) {
            await logActivity(req.user.id, 'DOCUMENT_ASSIGNED', `Document "${title}" assigned to contact ID ${validContactId}`, req, 'low');
        }

        res.status(201).json({
            success: true,
            message: 'Document uploaded and encrypted successfully',
            document: {
                uuid, title,
                file_name: req.file.originalname,
                is_password_protected: isPasswordProtected,
                inheritance_type: docInheritanceType,
                assigned_contact_id: validContactId
            }
        });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ success: false, message: 'Upload failed' });
    }
});

// ── GET download (owner — no PIN needed) ──────────────────────
router.get('/:uuid/download', authenticateToken, async (req, res) => {
    try {
        const [docs] = await db.execute(
            'SELECT * FROM documents WHERE uuid = ? AND user_id = ? AND is_deleted = 0',
            [req.params.uuid, req.user.id]
        );
        if (docs.length === 0) return res.status(404).json({ success: false, message: 'Document not found' });

        const doc = docs[0];
        const decryptedBuffer = decryptFile(doc.encrypted_data, doc.encryption_iv);
        await logActivity(req.user.id, 'DOCUMENT_DOWNLOADED', `Downloaded: ${doc.title}`, req, 'low');
        res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`);
        res.setHeader('Content-Type', doc.file_type || 'application/octet-stream');
        res.send(decryptedBuffer);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Download failed' });
    }
});

// ── POST verify document PIN (owner checks their own PIN) ──────
router.post('/:uuid/verify-pin', authenticateToken, async (req, res) => {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ success: false, message: 'PIN required' });
    try {
        const [docs] = await db.execute(
            'SELECT document_password_hash, is_password_protected FROM documents WHERE uuid = ? AND user_id = ? AND is_deleted = 0',
            [req.params.uuid, req.user.id]
        );
        if (!docs.length) return res.status(404).json({ success: false, message: 'Document not found' });
        if (!docs[0].is_password_protected) return res.json({ success: true, message: 'No PIN set' });
        const valid = await bcrypt.compare(pin, docs[0].document_password_hash);
        if (!valid) {
            await logActivity(req.user.id, 'DOCUMENT_PIN_FAILED', `Failed PIN attempt on document ${req.params.uuid}`, req, 'medium');
            return res.status(401).json({ success: false, message: 'Incorrect PIN' });
        }
        res.json({ success: true, message: 'PIN verified' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'PIN verification failed' });
    }
});

// ── PUT update document metadata ───────────────────────────────
router.put('/:uuid', authenticateToken, [
    body('title').optional().trim().isLength({ min: 1, max: 255 }),
    body('category').optional().isIn(['will','property','financial','insurance','personal','other']),
    body('assigned_contact_id').optional(),
    body('inheritance_type').optional().isIn(['general','specific']),
], async (req, res) => {
    const { title, description, category, assigned_contact_id, access_note, inheritance_type } = req.body;
    try {
        // Validate contact if provided
        let validContactId = assigned_contact_id === '' ? null : (assigned_contact_id || undefined);
        if (validContactId !== undefined && validContactId !== null) {
            const [contacts] = await db.execute(
                'SELECT id FROM trusted_contacts WHERE id = ? AND user_id = ?',
                [validContactId, req.user.id]
            );
            if (!contacts.length) validContactId = null;
        }

        const [result] = await db.execute(
            `UPDATE documents SET
             title = COALESCE(?, title),
             description = COALESCE(?, description),
             category = COALESCE(?, category),
             assigned_contact_id = ${validContactId !== undefined ? '?' : 'assigned_contact_id'},
             access_note = COALESCE(?, access_note),
             inheritance_type = COALESCE(?, inheritance_type)
             WHERE uuid = ? AND user_id = ? AND is_deleted = 0`,
            validContactId !== undefined
                ? [title||null, description||null, category||null, validContactId, access_note||null, inheritance_type||null, req.params.uuid, req.user.id]
                : [title||null, description||null, category||null, access_note||null, inheritance_type||null, req.params.uuid, req.user.id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Document not found' });
        await logActivity(req.user.id, 'DOCUMENT_UPDATED', `Updated document: ${req.params.uuid}`, req, 'low');
        res.json({ success: true, message: 'Document updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Update failed' });
    }
});

// ── DELETE document ────────────────────────────────────────────
router.delete('/:uuid', authenticateToken, async (req, res) => {
    try {
        const [result] = await db.execute(
            'UPDATE documents SET is_deleted = 1 WHERE uuid = ? AND user_id = ?',
            [req.params.uuid, req.user.id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Document not found' });
        await logActivity(req.user.id, 'DOCUMENT_DELETED', `Deleted document: ${req.params.uuid}`, req, 'medium');
        res.json({ success: true, message: 'Document deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Delete failed' });
    }
});

// ── POST contact accesses document via token ───────────────────
// Public endpoint — contact uses their token + optional PIN
router.post('/contact-access/:tokenId', [
    body('verification_code').notEmpty().withMessage('Verification code required'),
    body('document_pin').optional(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { verification_code, document_pin } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';

    try {
        // Find token
        const [tokens] = await db.execute(
            `SELECT at.*, tc.name as contact_name, tc.email as contact_email,
                    d.title, d.file_name, d.file_type, d.encrypted_data, d.encryption_iv,
                    d.is_password_protected, d.document_password_hash, d.uuid as doc_uuid,
                    d.inheritance_type, d.assigned_contact_id
             FROM access_tokens at
             JOIN trusted_contacts tc ON at.contact_id = tc.id
             LEFT JOIN documents d ON at.document_id = d.id
             WHERE at.token_id = ? AND at.status = 'pending' AND at.expires_at > NOW()`,
            [req.params.tokenId]
        );

        if (!tokens.length) {
            return res.status(404).json({ success: false, message: 'Token not found, expired, or already used' });
        }

        const token = tokens[0];

        // Check max attempts
        if (token.attempts >= token.max_attempts) {
            await db.execute("UPDATE access_tokens SET status = 'expired' WHERE token_id = ?", [token.token_id]);
            return res.status(429).json({ success: false, message: 'Too many failed attempts. Token revoked.' });
        }

        // Verify code
        if (token.verification_code !== verification_code.trim()) {
            await db.execute('UPDATE access_tokens SET attempts = attempts + 1 WHERE token_id = ?', [token.token_id]);
            // Log failed attempt
            await db.execute(
                `INSERT INTO document_access_log (document_id, contact_id, user_id, token_id, action, ip_address)
                 VALUES (?, ?, ?, ?, 'attempted', ?)`,
                [token.document_id, token.contact_id, token.user_id, token.token_id, ip]
            );
            return res.status(401).json({ success: false, message: 'Invalid verification code' });
        }

        // If document has PIN, verify it
        if (token.is_password_protected && token.document_id) {
            if (!document_pin) {
                return res.status(400).json({
                    success: false,
                    message: 'This document requires a PIN',
                    requires_pin: true
                });
            }
            const pinValid = await bcrypt.compare(document_pin, token.document_password_hash);
            if (!pinValid) {
                await db.execute('UPDATE access_tokens SET attempts = attempts + 1 WHERE token_id = ?', [token.token_id]);
                await db.execute(
                    `INSERT INTO document_access_log (document_id, contact_id, user_id, token_id, action, ip_address)
                     VALUES (?, ?, ?, ?, 'denied', ?)`,
                    [token.document_id, token.contact_id, token.user_id, token.token_id, ip]
                );
                return res.status(401).json({ success: false, message: 'Incorrect document PIN' });
            }
        }

        // Check access rights — document-specific contacts can only access assigned docs
        if (token.document_id && token.assigned_contact_id && token.assigned_contact_id !== token.contact_id) {
            await db.execute(
                `INSERT INTO document_access_log (document_id, contact_id, user_id, token_id, action, ip_address)
                 VALUES (?, ?, ?, ?, 'denied', ?)`,
                [token.document_id, token.contact_id, token.user_id, token.token_id, ip]
            );
            return res.status(403).json({ success: false, message: 'You are not authorized to access this document' });
        }

        // Mark token as used
        await db.execute(
            "UPDATE access_tokens SET status = 'used', used_at = NOW(), ip_address = ? WHERE token_id = ?",
            [ip, token.token_id]
        );

        // Log successful access
        await db.execute(
            `INSERT INTO document_access_log (document_id, contact_id, user_id, token_id, action, ip_address)
             VALUES (?, ?, ?, ?, 'downloaded', ?)`,
            [token.document_id, token.contact_id, token.user_id, token.token_id, ip]
        );

        // Update document access count
        if (token.document_id) {
            await db.execute('UPDATE documents SET access_count = access_count + 1 WHERE id = ?', [token.document_id]);
        }

        // Decrypt and send document
        if (token.document_id && token.encrypted_data) {
            const decryptedBuffer = decryptFile(token.encrypted_data, token.encryption_iv);
            res.setHeader('Content-Disposition', `attachment; filename="${token.file_name}"`);
            res.setHeader('Content-Type', token.file_type || 'application/octet-stream');
            res.setHeader('X-Contact-Name', token.contact_name);
            return res.send(decryptedBuffer);
        }

        // General access — return list of accessible documents
        const [generalDocs] = await db.execute(
            `SELECT uuid, title, file_name, file_size, category, is_password_protected, created_at
             FROM documents
             WHERE user_id = ? AND is_deleted = 0 AND inheritance_type = 'general'
             ORDER BY created_at DESC`,
            [token.user_id]
        );

        res.json({
            success: true,
            access_type: 'general',
            contact_name: token.contact_name,
            documents: generalDocs
        });

    } catch (err) {
        console.error('Contact access error:', err);
        res.status(500).json({ success: false, message: 'Access failed' });
    }
});

// ── GET documents accessible to a contact (via token) ─────────
router.get('/contact-docs/:tokenId', async (req, res) => {
    try {
        const [tokens] = await db.execute(
            `SELECT at.*, tc.name, tc.email, tc.role_type
             FROM access_tokens at
             JOIN trusted_contacts tc ON at.contact_id = tc.id
             WHERE at.token_id = ? AND at.status IN ('pending','used') AND at.expires_at > NOW()`,
            [req.params.tokenId]
        );
        if (!tokens.length) return res.status(404).json({ success: false, message: 'Invalid or expired token' });

        const token = tokens[0];

        let docs;
        if (token.access_type === 'document' && token.document_id) {
            // Specific document access
            const [d] = await db.execute(
                'SELECT uuid, title, file_name, file_size, category, is_password_protected, created_at FROM documents WHERE id = ? AND is_deleted = 0',
                [token.document_id]
            );
            docs = d;
        } else {
            // General access
            const [d] = await db.execute(
                `SELECT uuid, title, file_name, file_size, category, is_password_protected, created_at
                 FROM documents WHERE user_id = ? AND is_deleted = 0 AND inheritance_type = 'general'
                 ORDER BY created_at DESC`,
                [token.user_id]
            );
            docs = d;
        }

        res.json({
            success: true,
            contact: { name: token.name, email: token.email, role_type: token.role_type },
            access_type: token.access_type,
            documents: docs,
            expires_at: token.expires_at
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch documents' });
    }
});

module.exports = router;
