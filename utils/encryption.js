const crypto = require('crypto');
require('dotenv').config();

const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY = process.env.AES_SECRET || 'LegacyVault_AES_Key_32Characters!';
const KEY = crypto.scryptSync(SECRET_KEY, 'salt', 32);

const encrypt = (text) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return {
        iv: iv.toString('hex'),
        encryptedData: encrypted
    };
};

const decrypt = (encryptedData, ivHex) => {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

const encryptFile = (fileBuffer) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);
    return {
        iv: iv.toString('hex'),
        encryptedData: encrypted.toString('base64')
    };
};

const decryptFile = (encryptedBase64, ivHex) => {
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
};

const hashData = (data) => {
    return crypto.createHash('sha256').update(data).digest('hex');
};

module.exports = { encrypt, decrypt, encryptFile, decryptFile, hashData };
