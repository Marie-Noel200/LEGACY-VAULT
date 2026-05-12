#!/usr/bin/env python3
"""
Verify Legacy Vault project completeness
"""
import os

def check_file(path, desc):
    exists = os.path.exists(path)
    size = os.path.getsize(path) if exists else 0
    status = '✅' if exists and size > 100 else '❌'
    print(f'{status} {desc:40} ({size:,} bytes)')
    return exists and size > 100

print('=' * 70)
print('LEGACY VAULT - PROJECT VERIFICATION')
print('=' * 70)

print('\n📦 BACKEND FILES:')
backend_files = [
    ('server.js', 'Express Server'),
    ('config/database.js', 'Database Connection'),
    ('database/schema.sql', 'Database Schema'),
    ('middleware/auth.js', 'JWT Authentication'),
    ('middleware/rateLimiter.js', 'Rate Limiting'),
    ('utils/encryption.js', 'AES Encryption'),
    ('utils/logger.js', 'Activity Logger'),
    ('routes/auth.js', 'Auth Routes'),
    ('routes/documents.js', 'Document Routes'),
    ('routes/contacts.js', 'Contact Routes'),
    ('routes/emergency.js', 'Emergency Routes'),
    ('routes/logs.js', 'Log Routes'),
]

backend_ok = sum(check_file(f, d) for f, d in backend_files)

print('\n🎨 FRONTEND CORE:')
frontend_core = [
    ('public/css/style.css', 'Design System CSS'),
    ('public/js/app.js', 'Core JavaScript'),
    ('public/img/logo.svg', 'Custom Logo'),
]

core_ok = sum(check_file(f, d) for f, d in frontend_core)

print('\n📄 HTML PAGES:')
html_pages = [
    ('public/index.html', 'Landing Page'),
    ('public/login.html', 'Login Page'),
    ('public/register.html', 'Register Page'),
    ('public/dashboard.html', 'Dashboard'),
    ('public/vault.html', 'Document Vault'),
    ('public/contacts.html', 'Trusted Contacts'),
    ('public/security.html', 'Security Settings'),
    ('public/activity.html', 'Activity Monitor'),
    ('public/audit.html', 'Audit Logs'),
    ('public/emergency.html', 'Emergency Access'),
    ('public/profile.html', 'Profile'),
    ('public/404.html', '404 Error Page'),
]

pages_ok = sum(check_file(f, d) for f, d in html_pages)

print('\n📚 DOCUMENTATION:')
docs = [
    ('README.md', 'Main README'),
    ('PROJECT_STATUS.md', 'Project Status'),
    ('.env.example', 'Environment Template'),
    ('package.json', 'NPM Package Config'),
]

docs_ok = sum(check_file(f, d) for f, d in docs)

print('\n' + '=' * 70)
print('SUMMARY:')
print('=' * 70)
print(f'Backend Files:    {backend_ok}/{len(backend_files)} ✅')
print(f'Frontend Core:    {core_ok}/{len(frontend_core)} ✅')
print(f'HTML Pages:       {pages_ok}/{len(html_pages)} {"✅" if pages_ok == len(html_pages) else "⚠️"}')
print(f'Documentation:    {docs_ok}/{len(docs)} ✅')

total = backend_ok + core_ok + pages_ok + docs_ok
total_files = len(backend_files) + len(frontend_core) + len(html_pages) + len(docs)
percentage = (total / total_files) * 100

print(f'\nTotal:            {total}/{total_files} ({percentage:.1f}%)')

if percentage >= 90:
    print('\n🎉 PROJECT IS COMPLETE!')
elif percentage >= 70:
    print('\n⚠️  PROJECT IS MOSTLY COMPLETE')
else:
    print('\n❌ PROJECT NEEDS MORE WORK')

print('\n🚀 NEXT STEPS:')
if pages_ok < len(html_pages):
    print('  1. Run: python finish_pages.py')
    print('  2. Setup database: mysql < database/schema.sql')
    print('  3. Configure .env file')
    print('  4. Run: npm install')
    print('  5. Run: npm start')
else:
    print('  1. Setup database: mysql < database/schema.sql')
    print('  2. Configure .env file')
    print('  3. Run: npm install')
    print('  4. Run: npm start')
    print('  5. Visit: http://localhost:3000')

print('\n📖 Read PROJECT_STATUS.md for detailed information')
print('=' * 70)
