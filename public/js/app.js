// ============================================
// LEGACY VAULT - Core Application JS
// ============================================

const API_BASE = '/api';

// ---- AUTH HELPERS ----
const Auth = {
    getToken: () => localStorage.getItem('lv_token'),
    getUser: () => {
        const u = localStorage.getItem('lv_user');
        return u ? JSON.parse(u) : null;
    },
    setSession: (token, user) => {
        localStorage.setItem('lv_token', token);
        localStorage.setItem('lv_user', JSON.stringify(user));
    },
    clearSession: () => {
        localStorage.removeItem('lv_token');
        localStorage.removeItem('lv_user');
    },
    isLoggedIn: () => !!localStorage.getItem('lv_token'),
    requireAuth: () => {
        if (!Auth.isLoggedIn()) {
            window.location.href = '/login';
            return false;
        }
        return true;
    },
    requireGuest: () => {
        if (Auth.isLoggedIn()) {
            const user = Auth.getUser();
            window.location.href = (user && user.role === 'admin') ? '/admin/dashboard' : '/dashboard';
            return false;
        }
        return true;
    }
};

// ---- API HELPER ----
const API = {
    request: async (method, endpoint, data = null, isFormData = false) => {
        const headers = {};
        const token = Auth.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (!isFormData) headers['Content-Type'] = 'application/json';

        const config = { method, headers };
        if (data) config.body = isFormData ? data : JSON.stringify(data);

        try {
            const res = await fetch(`${API_BASE}${endpoint}`, config);
            if (res.status === 401) {
                Auth.clearSession();
                window.location.href = '/login';
                return null;
            }
            const json = await res.json();
            return { status: res.status, ...json };
        } catch (err) {
            console.error('API Error:', err);
            return { success: false, message: 'Network error. Please check your connection.' };
        }
    },
    get: (endpoint) => API.request('GET', endpoint),
    post: (endpoint, data) => API.request('POST', endpoint, data),
    put: (endpoint, data) => API.request('PUT', endpoint, data),
    delete: (endpoint) => API.request('DELETE', endpoint),
    upload: (endpoint, formData) => API.request('POST', endpoint, formData, true),
};

// ---- TOAST NOTIFICATIONS ----
const Toast = {
    container: null,
    init: () => {
        if (!document.getElementById('toast-container-vault')) {
            const c = document.createElement('div');
            c.id = 'toast-container-vault';
            c.className = 'toast-container-vault';
            document.body.appendChild(c);
            Toast.container = c;
        } else {
            Toast.container = document.getElementById('toast-container-vault');
        }
    },
    show: (message, type = 'info', duration = 4000) => {
        if (!Toast.container) Toast.init();
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
        const colors = { success: '#2ecc71', error: '#e74c3c', warning: '#f39c12', info: '#3498db' };

        const toast = document.createElement('div');
        toast.className = `toast-vault toast-${type}`;
        toast.innerHTML = `
            <i class="fas ${icons[type] || icons.info}" style="color:${colors[type]};font-size:1.2rem;flex-shrink:0"></i>
            <span style="flex:1;font-size:0.875rem;font-weight:500">${message}</span>
            <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:rgba(175,140,243,.5);font-size:1rem;padding:0;margin-left:8px">
                <i class="fas fa-times"></i>
            </button>`;
        Toast.container.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },
    success: (msg) => Toast.show(msg, 'success'),
    error: (msg) => Toast.show(msg, 'error'),
    warning: (msg) => Toast.show(msg, 'warning'),
    info: (msg) => Toast.show(msg, 'info'),
};

// ---- LOADING ----
const Loader = {
    show: () => {
        let overlay = document.getElementById('loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `<div class="spinner-vault"></div>`;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    },
    hide: () => {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'none';
    }
};

// ---- PASSWORD TOGGLE ----
const initPasswordToggles = () => {
    document.querySelectorAll('.password-toggle').forEach(btn => {
        // Remove old listener to prevent duplicates
        btn.replaceWith(btn.cloneNode(true));
    });
    document.querySelectorAll('.password-toggle').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const input = this.closest('.input-group').querySelector('input[type="password"], input[type="text"]');
            const icon = this.querySelector('i');
            if (!input) return;
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    });
};

// ---- PASSWORD STRENGTH ----
const checkPasswordStrength = (password) => {
    let score = 0;
    const checks = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /\d/.test(password),
        special: /[@$!%*?&]/.test(password),
        long: password.length >= 12
    };
    score = Object.values(checks).filter(Boolean).length;
    const levels = ['', 'Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    const colors = ['', '#e74c3c', '#e74c3c', '#f39c12', '#f39c12', '#2ecc71', '#2ecc71'];
    return { score, level: levels[score] || 'Very Weak', color: colors[score] || '#e74c3c', checks };
};

// ---- SIDEBAR TOGGLE ----
const initSidebar = () => {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (toggle && sidebar) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            if (overlay) overlay.classList.toggle('show');
        });
    }
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('show');
        });
    }

    // Set active nav link
    const currentPath = window.location.pathname;
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        }
    });
};

// ---- USER INFO IN NAVBAR ----
const initUserInfo = () => {
    const user = Auth.getUser();
    if (!user) return;

    const nameEls = document.querySelectorAll('.user-name-display');
    const emailEls = document.querySelectorAll('.user-email-display');
    const avatarEls = document.querySelectorAll('.user-avatar-display');

    nameEls.forEach(el => el.textContent = user.full_name || 'User');
    emailEls.forEach(el => el.textContent = user.email || '');
    avatarEls.forEach(el => {
        el.textContent = (user.full_name || 'U').charAt(0).toUpperCase();
    });
};

// ---- LOGOUT ----
const logout = async () => {
    await API.post('/auth/logout');
    Auth.clearSession();
    Toast.success('Logged out successfully');
    setTimeout(() => window.location.href = '/login', 500);
};

// ---- FORMAT HELPERS ----
const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
};

const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getCategoryIcon = (category) => {
    const icons = {
        will: 'fa-scroll', property: 'fa-home', financial: 'fa-chart-line',
        insurance: 'fa-shield-alt', personal: 'fa-user', other: 'fa-file'
    };
    return icons[category] || 'fa-file';
};

const getCategoryColor = (category) => {
    const colors = {
        will: '#AB8F7B', property: '#3498db', financial: '#2ecc71',
        insurance: '#9b59b6', personal: '#e67e22', other: '#95a5a6'
    };
    return colors[category] || '#95a5a6';
};

const getRiskBadge = (level) => {
    const badges = {
        low: '<span class="badge-vault badge-low">Low</span>',
        medium: '<span class="badge-vault badge-medium">Medium</span>',
        high: '<span class="badge-vault badge-high">High</span>',
        critical: '<span class="badge-vault badge-critical">Critical</span>'
    };
    return badges[level] || badges.low;
};

// ---- CONFIRM DIALOG ----
const confirm = (message, onConfirm) => {
    const modal = document.createElement('div');
    modal.style.cssText = `position:fixed;inset:0;background:rgba(2,7,16,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)`;
    modal.innerHTML = `
        <div style="background:#081120;border:1px solid rgba(175,140,243,.18);border-radius:18px;padding:2rem;max-width:400px;width:90%;box-shadow:0 24px 64px rgba(2,7,16,.8)">
            <div style="text-align:center;margin-bottom:1.5rem">
                <div style="width:60px;height:60px;background:rgba(231,76,60,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem">
                    <i class="fas fa-exclamation-triangle" style="color:#ff6b6b;font-size:1.5rem"></i>
                </div>
                <h5 style="font-family:'Playfair Display',serif;color:#f0eeff;margin-bottom:0.5rem">Confirm Action</h5>
                <p style="color:rgba(175,140,243,.6);font-size:0.9rem;margin:0">${message}</p>
            </div>
            <div style="display:flex;gap:10px;justify-content:center">
                <button id="confirm-cancel" class="btn-vault-secondary" style="padding:0.5rem 1.5rem">Cancel</button>
                <button id="confirm-ok" class="btn-vault-danger" style="padding:0.5rem 1.5rem">Confirm</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('confirm-cancel').onclick = () => modal.remove();
    document.getElementById('confirm-ok').onclick = () => { modal.remove(); onConfirm(); };
};

// ---- THEME TOGGLE ----
const initTheme = () => {
    const saved = localStorage.getItem('lv_theme') || 'light';
    if (saved === 'dark') document.body.classList.add('dark-mode');
    updateThemeIcons();
};

const toggleTheme = () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('lv_theme', isDark ? 'dark' : 'light');
    updateThemeIcons();
};

const updateThemeIcons = () => {
    const isDark = document.body.classList.contains('dark-mode');
    document.querySelectorAll('.theme-toggle i').forEach(i => {
        i.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    });
    document.querySelectorAll('.theme-toggle').forEach(btn => {
        btn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    });
};

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
    Toast.init();
    initPasswordToggles();
    initSidebar();
    initUserInfo();
    initTheme();

    // Logout buttons
    document.querySelectorAll('.logout-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); logout(); });
    });

    // Theme toggle buttons
    document.querySelectorAll('.theme-toggle').forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });
});

// Export for use in other scripts
window.LV = { Auth, API, Toast, Loader, formatDate, formatFileSize, getCategoryIcon, getCategoryColor, getRiskBadge, confirm, checkPasswordStrength };

// Also expose as globals so inline page scripts can call them directly
window.initSidebar = initSidebar;
window.initUserInfo = initUserInfo;
window.logout = logout;
window.initPasswordToggles = initPasswordToggles;
window.toggleTheme = toggleTheme;
window.initTheme = initTheme;
window.checkPasswordStrength = checkPasswordStrength;
window.formatDate = formatDate;
window.formatFileSize = formatFileSize;
window.initTheme = initTheme;
