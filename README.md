# Legacy Vault — Secure Digital Will Management System

A full-stack secure document management platform with AES-256 encryption, JWT authentication, behavioral monitoring, emergency access workflows, and a complete admin control panel.

---

## Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** MySQL (mysql2)
- **Authentication:** JWT (jsonwebtoken) + bcryptjs
- **Encryption:** AES-256-CBC (Node.js built-in crypto)
- **Email:** Nodemailer
- **Frontend:** Vanilla JS, Bootstrap 5, Font Awesome 6
- **Security:** Helmet, express-rate-limit, express-validator

---

## Features

- Single unified login for users and admins (role-based redirect)
- AES-256-CBC document encryption — files never stored in plain text
- bcrypt password hashing (cost factor 12)
- JWT token authentication (8h admin / 24h user)
- Rate limiting — 5 login attempts per 15 minutes in production
- Behavioral monitoring and risk scoring
- 3-stage liveness check system with email confirmation
- 2-of-3 multi-party emergency access verification
- Complete admin panel with audit logs, user management, block/unblock
- Document PIN protection for trusted contact access
- Trusted contact inheritance system

---

## Local Development

### Prerequisites
- Node.js >= 18
- MySQL (XAMPP recommended for local)

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/Marie-Noel200/LEGACY-VAULT.git
cd LEGACY-VAULT

# 2. Install dependencies
npm install

# 3. Copy environment file
cp .env.example .env
# Edit .env with your local values

# 4. Start MySQL (XAMPP Control Panel)

# 5. Create database and admin account
node create_admin.js

# 6. Start the server
npm start
```

Open `http://localhost:3000`

### Default Admin Credentials
```
Email:    admin@legacyvault.com
Password: Admin@123456
```

---

## Production Deployment (Railway)

### 1. Push to GitHub
```bash
git add .
git commit -m "your message"
git push
```

### 2. Deploy on Railway
1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select this repository
3. Add a MySQL database service
4. Set environment variables (see `.env.example`)

### 3. Environment Variables for Railway
Copy these from your Railway MySQL service and set in your Node.js service:

| Variable | Value |
|---|---|
| `DB_HOST` | From Railway MySQL (MYSQLHOST) |
| `DB_USER` | From Railway MySQL (MYSQLUSER) |
| `DB_PASSWORD` | From Railway MySQL (MYSQLPASSWORD) |
| `DB_NAME` | From Railway MySQL (MYSQLDATABASE) |
| `JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `AES_SECRET` | Exactly 32 characters |
| `NODE_ENV` | `production` |
| `BASE_URL` | Your Railway app URL |
| `EMAIL_USER` | Your Gmail address |
| `EMAIL_PASS` | Gmail App Password |

### 4. Initialize Database
In Railway MySQL console, run the contents of `database/schema.sql`

---

## Project Structure

```
├── server.js              # Express server entry point
├── routes/
│   ├── auth.js            # Register, login, profile
│   ├── documents.js       # Upload (encrypt), download (decrypt)
│   ├── contacts.js        # Trusted contacts management
│   ├── emergency.js       # Emergency access + liveness checks
│   ├── logs.js            # Activity logs + risk assessment
│   ├── admin.js           # Admin API (users, flags, audit)
│   └── access-tokens.js   # Contact access tokens
├── middleware/
│   ├── auth.js            # JWT user authentication
│   ├── adminAuth.js       # JWT admin authentication
│   └── rateLimiter.js     # Rate limiting
├── utils/
│   ├── encryption.js      # AES-256-CBC encrypt/decrypt
│   ├── logger.js          # Activity logging + risk scoring
│   ├── mailer.js          # Email sending (nodemailer)
│   └── adminLogger.js     # Admin audit logging
├── config/
│   └── database.js        # MySQL connection pool
├── database/
│   └── schema.sql         # Full database schema
├── public/                # Frontend (served as static files)
│   ├── js/app.js          # User-side JS helpers
│   ├── css/style.css      # Design system
│   ├── admin/             # Admin panel pages + JS
│   └── *.html             # User pages
└── uploads/               # File upload directory
```

---

## Security

- All documents encrypted with AES-256-CBC before storage
- Passwords hashed with bcrypt (cost 12)
- JWT tokens expire (8h admin, 24h user)
- SQL injection protection via parameterized queries
- XSS protection via Helmet security headers
- CORS configured for production
- Rate limiting on all API endpoints
- Admin cannot read user document contents
- All admin actions logged in audit trail
