// ============================================
// LEGACY VAULT - Admin Panel Core JS
// ============================================

const AdminAPI_BASE = '/api/admin';

const AdminAuth = {
    getToken: () => localStorage.getItem('lv_token'),
    getAdmin: () => { const a = localStorage.getItem('lv_user'); return a ? JSON.parse(a) : null; },
    setSession: (token, admin) => { localStorage.setItem('lv_token', token); localStorage.setItem('lv_user', JSON.stringify(admin)); },
    clearSession: () => { localStorage.removeItem('lv_token'); localStorage.removeItem('lv_user'); },
    isLoggedIn: () => {
        const token = localStorage.getItem('lv_token');
        const user = localStorage.getItem('lv_user');
        if (!token || !user) return false;
        try { return JSON.parse(user).role === 'admin'; } catch(e) { return false; }
    },
    requireAuth: () => {
        const token = localStorage.getItem('lv_token');
        const user = localStorage.getItem('lv_user');
        if (!token || !user) { window.location.href = '/login'; return false; }
        try {
            const parsed = JSON.parse(user);
            if (parsed.role !== 'admin') { window.location.href = '/dashboard'; return false; }
        } catch(e) { window.location.href = '/login'; return false; }
        return true;
    },
    requireGuest: () => {
        const token = localStorage.getItem('lv_token');
        const user = localStorage.getItem('lv_user');
        if (token && user) {
            try {
                const parsed = JSON.parse(user);
                if (parsed.role === 'admin') { window.location.href = '/admin/dashboard'; return false; }
                else { window.location.href = '/dashboard'; return false; }
            } catch(e) {}
        }
        return true;
    }
};

const AdminAPI = {
    request: async (method, endpoint, data = null) => {
        const headers = { 'Content-Type': 'application/json' };
        const token = AdminAuth.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const config = { method, headers };
        if (data) config.body = JSON.stringify(data);
        try {
            const res = await fetch(`${AdminAPI_BASE}${endpoint}`, config);
            if (res.status === 401 || res.status === 403) { AdminAuth.clearSession(); window.location.href = '/login'; return null; }
            return await res.json();
        } catch (err) {
            console.error('Admin API Error:', err);
            return { success: false, message: 'Network error' };
        }
    },
    get: (ep) => AdminAPI.request('GET', ep),
    post: (ep, data) => AdminAPI.request('POST', ep, data),
    put: (ep, data) => AdminAPI.request('PUT', ep, data),
    delete: (ep) => AdminAPI.request('DELETE', ep)
};

const AdminToast = {
    show: (msg, type = 'info', duration = 4000) => {
        let container = document.getElementById('admin-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'admin-toast-container';
            container.className = 'admin-toast-container';
            document.body.appendChild(container);
        }
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
        const colors = { success: '#22C55E', error: '#EF4444', warning: '#F59E0B', info: '#3B82F6' };
        const toast = document.createElement('div');
        toast.className = `admin-toast ${type}`;
        toast.innerHTML = `<i class="fas ${icons[type]}" style="color:${colors[type]};font-size:1.1rem;flex-shrink:0"></i><span style="flex:1;font-size:.875rem;font-weight:500;color:var(--atext)">${msg}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:var(--at3);padding:0;margin-left:8px"><i class="fas fa-times"></i></button>`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.animation = 'slideIn .3s ease reverse'; setTimeout(() => toast.remove(), 300); }, duration);
    },
    success: (m) => AdminToast.show(m, 'success'),
    error: (m) => AdminToast.show(m, 'error'),
    warning: (m) => AdminToast.show(m, 'warning'),
    info: (m) => AdminToast.show(m, 'info')
};

const AdminLoader = {
    show: () => { let o = document.getElementById('admin-loader'); if (!o) { o = document.createElement('div'); o.id = 'admin-loader'; o.style.cssText = 'position:fixed;inset:0;background:rgba(248,250,252,.85);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px)'; o.innerHTML = '<div style="width:44px;height:44px;border:4px solid #E2E8F0;border-top-color:#4F46E5;border-radius:50%;animation:spin .8s linear infinite"></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>'; document.body.appendChild(o); } o.style.display = 'flex'; },
    hide: () => { const o = document.getElementById('admin-loader'); if (o) o.style.display = 'none'; }
};

const AdminConfirm = (msg, onConfirm) => {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
    modal.innerHTML = `<div style="background:var(--acard);border-radius:16px;padding:2rem;max-width:400px;width:90%;box-shadow:var(--shadow-lg);border:1px solid var(--abdr)"><div style="text-align:center;margin-bottom:1.5rem"><div style="width:56px;height:56px;background:#FEF2F2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem"><i class="fas fa-exclamation-triangle" style="color:var(--adanger);font-size:1.4rem"></i></div><h5 style="font-family:Playfair Display,serif;color:var(--atext);margin-bottom:.5rem">Confirm Action</h5><p style="color:var(--at2);font-size:.9rem;margin:0">${msg}</p></div><div style="display:flex;gap:10px;justify-content:center"><button id="ac-cancel" class="btn-admin btn-admin-outline" style="padding:.5rem 1.5rem">Cancel</button><button id="ac-ok" class="btn-admin btn-admin-danger" style="padding:.5rem 1.5rem">Confirm</button></div></div>`;
    document.body.appendChild(modal);
    document.getElementById('ac-cancel').onclick = () => modal.remove();
    document.getElementById('ac-ok').onclick = () => { modal.remove(); onConfirm(); };
};

const adminFormatDate = (d) => {
    if (!d) return 'Never';
    const date = new Date(d);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' hrs ago';
    if (diff < 2592000) return Math.floor(diff / 86400) + ' days ago';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const adminFormatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024, sizes = ['B','KB','MB','GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const initAdminNav = () => {
    const admin = AdminAuth.getAdmin();
    if (admin) {
        const initials = (admin.full_name || 'A').charAt(0).toUpperCase();
        document.querySelectorAll('.admin-name').forEach(el => el.textContent = admin.full_name || 'Administrator');
        document.querySelectorAll('.admin-avatar-text').forEach(el => el.textContent = initials);
        document.querySelectorAll('.admin-avatar').forEach(el => { if (el.textContent.trim() === 'A') el.textContent = initials; });
    }
    const path = window.location.pathname;
    document.querySelectorAll('.admin-nav-link').forEach(link => {
        if (link.getAttribute('href') === path) link.classList.add('active');
    });
    document.querySelectorAll('.admin-logout').forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); AdminAuth.clearSession(); window.location.href = '/login'; });
    });
    const toggle = document.getElementById('admin-sidebar-toggle');
    const sidebar = document.getElementById('admin-sidebar');
    if (toggle && sidebar) {
        toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    }
};

// Shared sidebar HTML
const ADMIN_SIDEBAR = `
<div id="admin-sidebar" class="admin-sidebar">
  <div class="admin-sidebar-logo">
    <div class="admin-logo-icon">LV</div>
    <div>
      <div class="admin-brand">Legacy<span>Vault</span> <span class="admin-badge">ADMIN</span></div>
      <div class="admin-role-badge">Control Panel</div>
    </div>
  </div>
  <nav class="admin-nav">
    <div class="admin-nav-section">Overview</div>
    <a href="/admin/dashboard" class="admin-nav-link"><i class="fas fa-tachometer-alt"></i>Dashboard</a>
    <div class="admin-nav-section">Management</div>
    <a href="/admin/users" class="admin-nav-link"><i class="fas fa-users"></i>All Users</a>
    <a href="/admin/documents" class="admin-nav-link"><i class="fas fa-file-alt"></i>Documents</a>
    <a href="/admin/requests" class="admin-nav-link"><i class="fas fa-key"></i>Access Requests</a>
    <div class="admin-nav-section">Security</div>
    <a href="/admin/logs" class="admin-nav-link"><i class="fas fa-clipboard-list"></i>Audit Logs</a>
    <a href="/admin/flags" class="admin-nav-link"><i class="fas fa-flag"></i>Flagged Activity</a>
    <div class="admin-nav-section">Account</div>
    <a href="#" class="admin-nav-link admin-logout"><i class="fas fa-sign-out-alt"></i>Logout</a>
  </nav>
  <div class="admin-sidebar-footer">
    <div style="display:flex;align-items:center;gap:10px">
      <div class="admin-avatar admin-avatar-text" style="width:32px;height:32px;font-size:.8rem">A</div>
      <div><div class="admin-name" style="color:var(--atext);font-size:.8rem;font-weight:600">Admin</div><div style="color:var(--at3);font-size:.7rem">System Administrator</div></div>
    </div>
  </div>
</div>`;

const ADMIN_TOPBAR = (title) => `
<div class="admin-topbar">
  <div style="display:flex;align-items:center;gap:12px">
    <button id="admin-sidebar-toggle" class="btn-admin btn-admin-outline btn-admin-sm d-lg-none"><i class="fas fa-bars"></i></button>
    <span class="admin-topbar-title">${title}</span>
  </div>
  <div class="admin-topbar-right">
    <div style="display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--at2)">
      <span class="security-dot green"></span>System Secure
    </div>
    <div class="admin-avatar admin-avatar-text">A</div>
  </div>
</div>`;
