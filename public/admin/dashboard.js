const THEME_KEY = 'theme';

const applyTheme = (theme) => {
    const html = document.documentElement;
    if (theme === 'dark') {
        html.classList.add('dark');
    } else {
        html.classList.remove('dark');
    }
};

const getStoredTheme = () => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme) {
        return savedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const normalizeAdminLinks = () => {
    const currentPath = window.location.pathname;
    const adminIndex = currentPath.indexOf('/admin/');
    const basePath = adminIndex === -1 ? '/admin/' : `${currentPath.slice(0, adminIndex)}/admin/`;

    document.querySelectorAll('a[href^="/admin/"]').forEach((anchor) => {
        const href = anchor.getAttribute('href');
        if (!href) {
            return;
        }
        const trimmed = href.replace(/^\/admin\//, '');
        anchor.setAttribute('href', `${basePath}${trimmed}`);
    });
};

const normalizePath = (path) => {
    if (!path) return '/';
    let next = path.replace(/\/index\.html$/, '/');
    if (!next.endsWith('/')) {
        next += '/';
    }
    return next;
};

const setActiveAdminNav = () => {
    const currentPath = normalizePath(window.location.pathname);
    document.querySelectorAll('.menu-item').forEach((item) => {
        const href = item.getAttribute('href');
        if (!href) return;
        const targetPath = normalizePath(new URL(href, window.location.origin).pathname);
        const isActive = targetPath === currentPath;
        item.classList.toggle('menu-item-active', isActive);
        item.classList.toggle('menu-item-inactive', !isActive);
        const icon = item.querySelector('.menu-item-icon-active, .menu-item-icon-inactive');
        if (icon) {
            icon.classList.toggle('menu-item-icon-active', isActive);
            icon.classList.toggle('menu-item-icon-inactive', !isActive);
        }
    });
};

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('theme-toggle');
    const savedTheme = getStoredTheme();

    applyTheme(savedTheme);

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const isDark = document.documentElement.classList.contains('dark');
            const nextTheme = isDark ? 'light' : 'dark';
            applyTheme(nextTheme);
            localStorage.setItem(THEME_KEY, nextTheme);
        });
    }

    window.addEventListener('storage', (event) => {
        if (event.key === THEME_KEY) {
            applyTheme(event.newValue || 'light');
        }
    });

    normalizeAdminLinks();
    setActiveAdminNav();

    // Display User Email
    const userEmail = localStorage.getItem('email');
    const emailElement = document.querySelector('[data-admin-email]');
    if (userEmail && emailElement) {
        emailElement.textContent = userEmail;
    }
});
