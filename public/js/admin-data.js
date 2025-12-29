(() => {
  const firebaseConfig = {
    apiKey: 'AIzaSyC1kY4dlbg9v38ZkuYVPJGnSulMEouvw58',
    authDomain: 'nexolink-b8eb5.firebaseapp.com',
    projectId: 'nexolink-b8eb5',
    storageBucket: 'nexolink-b8eb5.firebasestorage.app',
    messagingSenderId: '247675121621',
    appId: '1:247675121621:web:98772b2e0cfbe8a381175c',
  };

  const FIREBASE_SDKS = [
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
  ];
  const QR_LIB_URL = '/admin/vendor/qrcode.min.js';
  const QR_LIB_FALLBACKS = [
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  ];
  const QR_TTL_SECONDS = 3153600000;
  const engagementState = {
    period: 'monthly',
    data: null,
  };
  const weeklyChartState = {
    offset: 0,
    totals: Array.from({ length: 7 }, () => 0),
    logs: [],
  };
  const impactGoalState = {
    goal: 0,
    approved: 0,
    today: 0,
    percent: 0,
    orgKey: null,
    orgId: null,
    orgCode: null,
    db: null,
    user: null,
    unsubscribe: null,
  };
  const DEFAULT_IMPACT_GOAL = 20;
  const historyState = {
    active: false,
    name: '',
    id: '',
    email: '',
  };
  let bootingCleared = false;

  const loadScript = (src) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = (event) => {
      const error = new Error(`Failed to load ${src}`);
      error.event = event;
      reject(error);
    };
    document.head.appendChild(script);
  });

  const clearBootingState = () => {
    if (bootingCleared) return;
    bootingCleared = true;
    document.documentElement.classList.remove('nx-booting');
  };

  const ensureFirebase = async () => {
    for (const src of FIREBASE_SDKS) {
      await loadScript(src);
    }
    if (!window.firebase?.apps?.length) {
      window.firebase.initializeApp(firebaseConfig);
    }
    return {
      auth: window.firebase.auth(),
      db: window.firebase.firestore(),
    };
  };

  const ensureQrLib = async () => {
    if (window.QRCode) return window.QRCode;
    try {
      await loadScript(QR_LIB_URL);
    } catch (error) {
      let loaded = false;
      for (const url of QR_LIB_FALLBACKS) {
        try {
          await loadScript(url);
          loaded = true;
          break;
        } catch {
          continue;
        }
      }
      if (!loaded) throw error;
    }
    return window.QRCode;
  };

  const runAfterHydration = (callback) => {
    const run = () => {
      const execute = () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(callback);
        });
      };
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(execute, { timeout: 1200 });
      } else {
        setTimeout(execute, 300);
      }
    };
    if (document.readyState === 'complete') {
      run();
      return;
    }
    window.addEventListener('load', run, { once: true });
  };

  const attachSafeNavigation = () => {
    if (document.body.dataset.safeNavReady) return;
    document.body.dataset.safeNavReady = 'true';
    const lastClickAt = new Map();
    document.addEventListener('click', (event) => {
      const anchor = event.target?.closest?.('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (!href.startsWith('/admin')) return;
      const now = Date.now();
      const last = lastClickAt.get(href) || 0;
      if (now - last < 700) {
        event.preventDefault();
        return;
      }
      lastClickAt.set(href, now);
    }, true);
  };

  const parseMDYTime = (dateStr, timeStr) => {
    if (!dateStr) return null;
    const [m, d, y] = String(dateStr).split('/').map((n) => parseInt(n, 10));
    if (!m || !d || !y) return null;
    let hours = 0;
    let minutes = 0;
    if (timeStr) {
      const [time, modifierRaw] = String(timeStr).split(' ');
      const [hh, mm] = (time || '').split(':').map((n) => parseInt(n, 10));
      const modifier = (modifierRaw || '').toUpperCase();
      hours = (hh || 0) % 12;
      if (modifier === 'PM') hours += 12;
      minutes = mm || 0;
    }
    return new Date(y, m - 1, d, hours, minutes, 0, 0);
  };

  const normalizeStatus = (value) => {
    const raw = String(value || '').toLowerCase().trim();
    if (!raw) return 'pending';
    if (raw === 'accepted' || raw === 'approved' || raw.startsWith('approved') || raw === 'success') return 'approved';
    if (raw === 'denied' || raw === 'rejected' || raw === 'declined' || raw.startsWith('denied')) return 'denied';
    if (raw === 'changes-requested' || raw === 'needs-changes' || raw === 'requested') return 'changes-requested';
    if (raw.includes('awaiting') || raw.includes('pending') || raw.includes('review')) return 'pending';
    return raw;
  };
  const resolveLogStatusValue = (log = {}) => (
    log.approve
    ?? log.approval
    ?? log.approval_status
    ?? log.approvalStatus
    ?? log.status
    ?? null
  );
  const isApprovedLog = (log) => normalizeStatus(resolveLogStatusValue(log)) === 'approved';
  const isPendingLog = (log) => {
    const status = normalizeStatus(resolveLogStatusValue(log));
    return status === 'pending' || status === 'changes-requested';
  };
  const normalizeRole = (role) => {
    const value = String(role || '').toLowerCase();
    if (!value) return 'volunteer';
    if (value === 'admin') return 'org-admin';
    return value;
  };
  const getVolunteerIdentity = (log = {}) => {
    const id = log.user_id || log.userId || log.volunteer_id || log.volunteerId || '';
    const email = String(log.volunteer_email || log.email || log.user_email || log.userEmail || '')
      .toLowerCase();
    const name = log.volunteer_name || log.name || log.firstName || log.user_name || '';
    const key = id || email || (name ? name.toLowerCase() : '');
    return { id, email, name, key };
  };
  const getUserIdentity = (user = {}) => {
    const id = user.id || user.uid || user.user_id || user.userId || '';
    const email = String(user.email || '').toLowerCase();
    const name = user.firstName || user.name || user.displayName || user.user_name || '';
    const key = id || email || (name ? name.toLowerCase() : '');
    return { id, email, name, key };
  };
  const isNonVolunteerRole = (role) => {
    const normalized = normalizeRole(role);
    return ['org-admin', 'admin', 'owner', 'organization', 'org'].includes(normalized);
  };
  const createVolunteerExclusionChecker = ({ adminUser, orgId } = {}) => {
    const adminId = adminUser?.uid || '';
    const adminEmail = String(adminUser?.email || '').toLowerCase();
    return (identity, record = {}) => {
      if (adminId && identity.id === adminId) return true;
      if (adminEmail && identity.email === adminEmail) return true;
      if (orgId && identity.id === orgId) return true;

      if (isNonVolunteerRole(record.role || record.accessRole || record.userRole || record.accountRole)) return true;

      const accountType = String(record.type || record.accountType || record.userType || '').toLowerCase();
      if (['organization', 'org', 'company', 'business'].includes(accountType)) return true;

      return false;
    };
  };

  const formatHours = (value) => {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return '0';
    return num % 1 === 0 ? `${num}` : num.toFixed(1);
  };

  const getLogHours = (log) => {
    const raw = log?.hours_contributed
      ?? log?.hoursLogged
      ?? log?.hours_logged
      ?? log?.hours_contrib
      ?? log?.total_hours
      ?? log?.totalHours
      ?? log?.hours
      ?? 0;
    const parsed = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatDayLabel = (date) => date.toLocaleDateString('en-US', { weekday: 'long' });
  const WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getWeekStart = (date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return start;
  };

  const getWeekStartFromOffset = (offset = 0) => {
    const base = getWeekStart(new Date());
    base.setDate(base.getDate() - offset * 7);
    return base;
  };

  const buildWeeklyTotalsForOffset = (logs = [], offset = 0) => {
    const weekStart = getWeekStartFromOffset(offset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const totals = Array.from({ length: 7 }, () => 0);
    logs.forEach((log) => {
      const date = getLogTimestamp(log);
      if (!date || date < weekStart || date >= weekEnd) return;
      totals[date.getDay()] += getLogHours(log);
    });
    return totals;
  };

  const filterLogsByWeek = (logs = [], offset = 0) => {
    const weekStart = getWeekStartFromOffset(offset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return logs.filter((log) => {
      const date = getLogTimestamp(log);
      return date && date >= weekStart && date < weekEnd;
    });
  };

  const formatWeekRange = (offset = 0) => {
    const start = getWeekStartFromOffset(offset);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${startLabel}–${endLabel}`;
  };

  const resolveElementByLabel = (labelText) => {
    const labels = Array.from(document.querySelectorAll('span'));
    const label = labels.find((node) => node.textContent.trim() === labelText);
    if (!label) return null;
    return label.closest('div')?.querySelector('h4') || null;
  };

  const resolveElementByLabels = (labelTexts = []) => {
    for (const labelText of labelTexts) {
      const node = resolveElementByLabel(labelText);
      if (node) return node;
    }
    return null;
  };

  const updateMetricLabel = (currentLabel, nextLabel) => {
    const spans = Array.from(document.querySelectorAll('span'));
    const label = spans.find((node) => node.textContent.trim() === currentLabel);
    if (label) label.textContent = nextLabel;
  };

  const resolveAdminEmailNode = () => {
    const direct = document.querySelector('[data-admin-email]');
    if (direct) return direct;
    const spans = Array.from(document.querySelectorAll('span'));
    return spans.find((node) => node.textContent.trim() === 'NexoLink Admin') || null;
  };

  const formatDateShort = (value) => {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const resolveTimestamp = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    if (value?.seconds) return value.seconds * 1000;
    if (value?.toDate) return value.toDate().getTime();
    return null;
  };

  const formatDateInputValue = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseDateInputValue = (value) => {
    if (!value) return null;
    const [year, month, day] = String(value).split('-').map((part) => parseInt(part, 10));
    if (!year || !month || !day) return null;
    const parsed = new Date(year, month - 1, day);
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  };

  const initVolunteerHistoryState = () => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('volunteer') || '';
    const id = params.get('id') || '';
    const email = params.get('email') || '';
    historyState.name = name;
    historyState.id = id;
    historyState.email = email;
    historyState.active = Boolean(name || id || email);
  };

  const endOfDay = (date) => {
    if (!date) return null;
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end;
  };

  const resolveLabelRow = (labelText) => {
    const labels = Array.from(document.querySelectorAll('span'));
    const label = labels.find((node) => node.textContent.trim() === labelText);
    return label?.closest('div') || null;
  };

  const updateProfileDropdownEmail = (email) => {
    if (!email) return;
    const nodes = Array.from(document.querySelectorAll('[data-admin-email], span, p'))
      .filter((node) => node.dataset?.adminEmail || node.textContent.trim() === 'admin@nexolink.app');
    nodes.forEach((node) => {
      node.textContent = email;
    });
  };

  const insertOrgBadges = ({ orgName, orgCode }) => {
    if (!orgName && !orgCode) return;
    const header = document.querySelector('header');
    const rightControls = header?.querySelector('div.hidden.items-center.justify-between.w-full.gap-4')
      || header?.querySelector('div.flex.items-center.gap-4')
      || header?.querySelector('div.flex.items-center.gap-3');
    const leftControls = header?.querySelector('div.flex.items-center.justify-between.w-full.gap-2')
      || header?.querySelector('div.flex.items-center.gap-2');
    if (!rightControls && !leftControls) return;

    rightControls?.querySelectorAll('[data-org-download]').forEach((node) => node.remove());
    rightControls?.querySelectorAll('[data-org-qr-trigger]').forEach((node) => node.remove());
    rightControls?.querySelectorAll('[data-org-qr-menu]').forEach((node) => node.remove());
    leftControls?.querySelectorAll('[data-org-name-badge]').forEach((node) => node.remove());
    leftControls?.querySelectorAll('[data-org-code-badge]').forEach((node) => node.remove());

    const sidebarToggle = leftControls?.querySelector('button');
    let lastLeftInsert = sidebarToggle && sidebarToggle.parentElement === leftControls ? sidebarToggle : null;

    if (orgCode && leftControls) {
      const codeWrap = document.createElement('div');
      codeWrap.dataset.orgCodeBadge = 'true';
      codeWrap.className = 'mr-2 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2 dark:border-gray-800 dark:bg-gray-900';
      codeWrap.innerHTML = `
        <span class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Org Code</span>
        <span class="text-lg font-semibold text-gray-900 dark:text-white/90">${orgCode.toUpperCase()}</span>
      `;
      if (lastLeftInsert) {
        lastLeftInsert.after(codeWrap);
      } else {
        leftControls.prepend(codeWrap);
      }
      lastLeftInsert = codeWrap;
    }

    if (!orgCode || !rightControls) return;

    const notificationToggle = resolveNotificationToggle();
    const notificationWrapper = notificationToggle?.parentElement || null;
    const iconGroup = notificationToggle?.closest('div.flex.items-center') || null;

    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.dataset.orgDownload = 'true';
    downloadButton.className = 'relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white';
    downloadButton.setAttribute('aria-label', 'Download hours');
    downloadButton.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path fill="currentColor" d="M12 3a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4.01 4a1 1 0 0 1-1.38 0l-4.01-4a1 1 0 1 1 1.4-1.42L11 12.59V4a1 1 0 0 1 1-1z"/>
        <path fill="currentColor" d="M4 17a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1z"/>
      </svg>
    `;

    const qrButton = document.createElement('button');
    qrButton.type = 'button';
    qrButton.dataset.orgQrTrigger = 'true';
    qrButton.className = 'relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white';
    qrButton.setAttribute('aria-label', 'Show QR code');
    qrButton.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path fill="currentColor" d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10 0h2v2h-2v-2zm0 4h2v2h-2v-2zm2-2h2v2h-2v-2zm2-4h2v2h-2v-2zm0 6h2v2h-2v-2zM15 19h2v2h-2v-2z"/>
      </svg>
    `;

    const safeInsertAfter = (node, anchorNode, container) => {
      if (!node) return;
      if (anchorNode && anchorNode.parentElement === container) {
        container.insertBefore(node, anchorNode.nextSibling);
      } else if (container) {
        container.appendChild(node);
      } else {
        rightControls.appendChild(node);
      }
    };

    const iconContainer = iconGroup || rightControls;
    safeInsertAfter(downloadButton, notificationWrapper, iconContainer);
    safeInsertAfter(qrButton, downloadButton, iconContainer);
  };

  const updateSidebarOrgName = (orgName) => {
    if (!orgName) return;
    const sidebar = document.querySelector('aside');
    if (!sidebar) return;
    const brandLabel = sidebar.querySelector('a span.text-xl, a span.text-2xl, a span.font-semibold');
    if (brandLabel) {
      brandLabel.textContent = orgName;
    }
  };

  const ensureQrMenu = (anchor) => {
    if (!anchor) return null;
    let menu = anchor.parentElement?.querySelector('[data-org-qr-menu]');
    if (menu) return menu;

    anchor.parentElement?.classList?.add('relative');
    if (anchor.parentElement?.style) {
      anchor.parentElement.style.overflow = 'visible';
    }
    const header = document.querySelector('header');
    if (header?.style) {
      header.style.overflow = 'visible';
    }
    menu = document.createElement('div');
    menu.dataset.orgQrMenu = 'true';
    menu.className = [
      'absolute', 'right-0', 'mt-3', 'w-[32rem]', 'max-h-[30rem]', 'rounded-xl', 'border',
      'border-gray-200', 'bg-white', 'p-6', 'shadow-lg', 'dark:border-gray-800',
      'dark:bg-gray-900', 'hidden', 'z-[999999]'
    ].join(' ');
    menu.style.transform = 'translateY(60%)';
    menu.style.transformOrigin = 'top right';
    menu.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <p class="text-sm font-semibold text-gray-800 dark:text-white/90">Organization QR</p>
        <button type="button" class="h-7 w-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800" data-org-qr-close aria-label="Close QR">
          ✕
        </button>
      </div>
      <div class="flex flex-col items-center gap-3">
        <div class="flex h-52 w-52 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40" data-org-qr-body>
          <span class="text-xs text-gray-400">Loading QR…</span>
        </div>
        <button type="button" class="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800" data-org-qr-download>
          Download QR
        </button>
      </div>
    `;
    anchor.parentElement?.appendChild(menu);

    const closeBtn = menu.querySelector('[data-org-qr-close]');
    closeBtn?.addEventListener('click', () => {
      menu.classList.add('hidden');
    });
    document.addEventListener('click', (event) => {
      if (!menu.contains(event.target) && !anchor.contains(event.target)) {
        menu.classList.add('hidden');
      }
    });
    const downloadBtn = menu.querySelector('[data-org-qr-download]');
    downloadBtn?.addEventListener('click', () => {
      const dataUrl = menu.dataset.qrImage;
      if (!dataUrl) return;
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'nexolink-org-qr.png';
      link.click();
    });
    return menu;
  };

  const ensureDownloadMenu = (anchor) => {
    if (!anchor) return null;
    let menu = anchor.parentElement?.querySelector('[data-org-download-menu]');
    if (menu) return menu;

    anchor.parentElement?.classList?.add('relative');
    if (anchor.parentElement?.style) {
      anchor.parentElement.style.overflow = 'visible';
    }
    const header = document.querySelector('header');
    if (header?.style) {
      header.style.overflow = 'visible';
    }
    menu = document.createElement('div');
    menu.dataset.orgDownloadMenu = 'true';
    menu.className = [
      'absolute', 'right-0', 'mt-3', 'w-[32rem]', 'max-h-[30rem]', 'rounded-xl', 'border',
      'border-gray-200', 'bg-white', 'p-6', 'shadow-lg', 'dark:border-gray-800',
      'dark:bg-gray-900', 'hidden', 'z-[999999]'
    ].join(' ');
    menu.style.transform = 'translateY(60%)';
    menu.style.transformOrigin = 'top right';
    menu.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <p class="text-sm font-semibold text-gray-800 dark:text-white/90">Download hours</p>
        <button type="button" class="h-7 w-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800" data-download-close aria-label="Close download">
          ✕
        </button>
      </div>
      <div class="space-y-3">
        <label class="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">From</label>
        <input type="date" class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200" data-download-start />
        <label class="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">To</label>
        <input type="date" class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200" data-download-end />
        <button type="button" class="w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600" data-download-submit>
          Download CSV
        </button>
      </div>
    `;
    anchor.parentElement?.appendChild(menu);

    const closeBtn = menu.querySelector('[data-download-close]');
    closeBtn?.addEventListener('click', () => {
      menu.classList.add('hidden');
    });
    document.addEventListener('click', (event) => {
      if (!menu.contains(event.target) && !anchor.contains(event.target)) {
        menu.classList.add('hidden');
      }
    });
    return menu;
  };

  const configureDownloadMenu = (menu, { orgName, orgCode, logs }) => {
    if (!menu) return;
    menu._orgName = orgName;
    menu._orgCode = orgCode;
    menu._logs = Array.isArray(logs) ? logs : [];
    const startInput = menu.querySelector('[data-download-start]');
    const endInput = menu.querySelector('[data-download-end]');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (endInput) {
      endInput.value = formatDateInputValue(today);
    }
    if (startInput && !startInput.value) {
      const defaultStart = new Date(today);
      defaultStart.setDate(defaultStart.getDate() - 30);
      startInput.value = formatDateInputValue(defaultStart);
    }
    const submitBtn = menu.querySelector('[data-download-submit]');
    if (submitBtn && !submitBtn.dataset.downloadBound) {
      submitBtn.dataset.downloadBound = 'true';
      submitBtn.addEventListener('click', () => {
        const startDate = parseDateInputValue(startInput?.value);
        const endDate = endOfDay(parseDateInputValue(endInput?.value) || today);
        const filtered = filterLogsByRange(menu._logs || [], startDate, endDate);
        downloadOrgHoursCsv(filtered, menu._orgName, menu._orgCode);
        menu.classList.add('hidden');
      });
    }
  };

  const renderOrgQr = async ({ auth, orgCode }) => {
    const user = auth.currentUser;
    if (!user || !orgCode) return;
    const trigger = document.querySelector('[data-org-qr-trigger]');
    const modal = ensureQrMenu(trigger);
    const body = modal?.querySelector('[data-org-qr-body]');
    if (!body) return;
    const normalizedCode = String(orgCode).trim().toUpperCase();
    if (modal.dataset.qrOrgCode === normalizedCode && modal.dataset.qrImage) {
      body.innerHTML = `<img src="${modal.dataset.qrImage}" alt="Organization QR" class="h-52 w-52" />`;
      modal.classList.remove('hidden');
      return;
    }

    body.innerHTML = '<span class="text-xs text-gray-400">Loading QR…</span>';
    modal.classList.remove('hidden');

    try {
      const token = await user.getIdToken();
      const resp = await fetch('/api/issueAdminQr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orgAccessCode: orgCode,
          adminId: user.uid,
          ttlSeconds: QR_TTL_SECONDS,
        }),
      });
      const data = resp.ok ? await resp.json() : null;
      if (!resp.ok || !data?.payload || !data?.sig) {
        throw new Error(data?.message || 'Unable to issue QR code.');
      }
      await ensureQrLib();
      const payload = { ...data.payload, sig: data.sig };
      const qrValue = JSON.stringify(payload);
      let url = null;
      if (typeof window.QRCode?.toDataURL === 'function') {
        url = await window.QRCode.toDataURL(qrValue, {
          width: 360,
          margin: 1,
          color: { dark: '#0F172A', light: '#FFFFFF' },
        });
      } else {
        body.innerHTML = '';
        const qrWrap = document.createElement('div');
        body.appendChild(qrWrap);
        const qrInstance = new window.QRCode(qrWrap, {
          text: qrValue,
          width: 220,
          height: 220,
          colorDark: '#0F172A',
          colorLight: '#FFFFFF',
          correctLevel: window.QRCode.CorrectLevel?.M || window.QRCode.CorrectLevel?.L,
        });
        const canvas = qrWrap.querySelector('canvas');
        url = canvas ? canvas.toDataURL('image/png') : null;
        qrInstance?.clear?.();
      }
      if (!url) throw new Error('QR generation failed.');
      modal.dataset.qrImage = url;
      modal.dataset.qrOrgCode = normalizedCode;
      body.innerHTML = `<img src="${url}" alt="Organization QR" class="h-52 w-52" />`;
    } catch (error) {
      console.error('QR render failed', error);
      const message = error?.message || 'Unable to load QR.';
      body.innerHTML = `<span class="text-xs text-red-500">${message}</span>`;
    }
  };

  const resolveNotificationToggle = () => {
    const header = document.querySelector('header');
    if (!header) return null;
    const toggles = header.querySelectorAll('button.dropdown-toggle');
    return toggles.length ? toggles[0] : null;
  };

  const updateNotificationIndicator = (count) => {
    const toggle = resolveNotificationToggle();
    if (!toggle) return;
    const dot = toggle.querySelector('span.bg-orange-400');
    if (!dot) return;
    if (count > 0) {
      dot.classList.remove('hidden');
    } else {
      dot.classList.add('hidden');
    }
  };

  const resolveProfileToggle = () => {
    const header = document.querySelector('header');
    if (!header) return null;
    const toggles = header.querySelectorAll('button.dropdown-toggle');
    return toggles.length > 1 ? toggles[1] : null;
  };

  const renderProfileMenu = (email, onSignOut) => {
    const toggle = resolveProfileToggle();
    if (!toggle || toggle.dataset.profileMenuReady) return;
    toggle.dataset.profileMenuReady = 'true';
    toggle.classList.add('relative');

    const menu = document.createElement('div');
    menu.className = [
      'absolute', 'right-0', 'mt-3', 'w-64', 'rounded-xl', 'border',
      'border-gray-200', 'bg-white', 'p-4', 'shadow-lg', 'dark:border-gray-800',
      'dark:bg-gray-900', 'hidden', 'z-[999999]'
    ].join(' ');
    menu.dataset.profileMenu = 'true';

    const signOutBtn = document.createElement('button');
    signOutBtn.className = 'w-full rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700';
    signOutBtn.textContent = 'Sign out';
    signOutBtn.addEventListener('click', () => onSignOut?.());
    menu.appendChild(signOutBtn);

    toggle.parentElement?.appendChild(menu);

    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      menu.classList.toggle('hidden');
    });

    document.addEventListener('click', (event) => {
      if (!menu.contains(event.target) && !toggle.contains(event.target)) {
        menu.classList.add('hidden');
      }
    });
  };

  const renderNotificationMenu = (items) => {
    const toggle = resolveNotificationToggle();
    if (!toggle || toggle.dataset.notificationsReady) return;
    toggle.dataset.notificationsReady = 'true';
    toggle.classList.add('relative');

    const menu = document.createElement('div');
    menu.className = [
      'absolute', 'right-0', 'mt-3', 'w-[32rem]', 'max-h-[30rem]', 'rounded-xl', 'border',
      'border-gray-200', 'bg-white', 'p-6', 'shadow-lg', 'dark:border-gray-800',
      'dark:bg-gray-900', 'hidden', 'z-[999999]'
    ].join(' ');
    menu.dataset.notificationsMenu = 'true';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-3';
    header.innerHTML = '<p class="text-sm font-semibold text-gray-800 dark:text-white/90">Join Requests</p>';
    menu.appendChild(header);

    const list = document.createElement('div');
    list.dataset.notificationsList = 'true';
    list.className = 'overflow-y-auto max-h-72 pr-1';
    menu.appendChild(list);

    toggle.parentElement?.appendChild(menu);

    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      menu.classList.toggle('hidden');
    });

    document.addEventListener('click', (event) => {
      if (!menu.contains(event.target) && !toggle.contains(event.target)) {
        menu.classList.add('hidden');
      }
    });

    updateNotificationMenu(items);
    updateNotificationIndicator(items.length);
  };

  const updateNotificationMenu = (items) => {
    const menu = document.querySelector('[data-notifications-menu]');
    const list = menu?.querySelector('[data-notifications-list]');
    if (!menu || !list) return;

    list.innerHTML = '';
    updateNotificationIndicator(items.length);
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'text-sm text-gray-500 dark:text-gray-400';
      empty.textContent = 'No pending join requests.';
      list.appendChild(empty);
      return;
    }

    items.slice(0, 6).forEach((item) => {
      const row = document.createElement('div');
      row.className = 'flex flex-col gap-2 rounded-lg border border-gray-100 p-3 mb-3 last:mb-0 dark:border-gray-800';
      row.innerHTML = `
        <div>
          <p class="text-sm font-semibold text-gray-800 dark:text-white/90">${item.name}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">${item.email}</p>
        </div>
      `;
      const actions = document.createElement('div');
      actions.className = 'flex gap-2';

      const approve = document.createElement('button');
      approve.className = 'flex-1 rounded-lg bg-success-500 px-3 py-2 text-xs font-semibold text-white hover:bg-success-600';
      approve.textContent = 'Approve';
      approve.addEventListener('click', () => item.onApprove?.());

      const deny = document.createElement('button');
      deny.className = 'flex-1 rounded-lg bg-error-500 px-3 py-2 text-xs font-semibold text-white hover:bg-error-600';
      deny.textContent = 'Deny';
      deny.addEventListener('click', () => item.onDeny?.());

      actions.appendChild(approve);
      actions.appendChild(deny);
      row.appendChild(actions);
      list.appendChild(row);
    });
  };

  const updateMetricText = (label, value, fallbacks = []) => {
    const labels = Array.isArray(label) ? label : [label, ...fallbacks];
    const node = resolveElementByLabels(labels);
    if (node) node.textContent = value;
    const card = node?.closest('div.rounded-2xl');
    if (card) {
      const badge = card.querySelector('span.rounded-full');
      if (badge) {
        badge.classList.add('hidden');
      }
    }
  };

  const formatDeltaPercent = (current, previous) => {
    const curr = Number(current) || 0;
    const prev = Number(previous) || 0;
    if (!prev && !curr) return null;
    if (!prev) return 100;
    return ((curr - prev) / Math.abs(prev)) * 100;
  };

  const updateMetricDelta = (label, percent) => {
    const labels = Array.isArray(label) ? label : [label];
    const node = resolveElementByLabels(labels);
    const card = node?.closest('div.rounded-2xl');
    const badge = card?.querySelector('span.rounded-full');
    if (!badge) return;
    if (!Number.isFinite(percent)) {
      badge.classList.add('hidden');
      return;
    }
    const rounded = Math.round(percent * 10) / 10;
    const sign = rounded > 0 ? '+' : '';
    badge.textContent = `${sign}${rounded}%`;
    badge.className = 'rounded-full px-3 py-1 text-sm font-semibold';
    if (rounded > 0) {
      badge.classList.add('bg-success-50', 'text-success-600', 'dark:bg-success-500/15', 'dark:text-success-500');
    } else if (rounded < 0) {
      badge.classList.add('bg-error-50', 'text-error-600', 'dark:bg-error-500/15', 'dark:text-error-500');
    } else {
      badge.classList.add('bg-gray-100', 'text-gray-700', 'dark:bg-gray-800', 'dark:text-gray-200');
    }
    badge.classList.remove('hidden');
  };

  const updateTopVolunteers = (volunteers) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (el) => el.textContent.trim() === 'Top Volunteers'
    );
    if (!heading) return;
    const card = heading.closest('div.rounded-2xl');
    const list = card?.querySelector('div.mt-5');
    if (!list) return;
    list.innerHTML = '';

    if (!volunteers.length) {
      list.innerHTML = `
        <div class="animate-pulse space-y-3">
          <div class="h-3 w-40 rounded-full bg-gray-100 dark:bg-gray-800"></div>
          <div class="h-6 w-full rounded-xl bg-gray-100 dark:bg-gray-800"></div>
          <div class="h-6 w-full rounded-xl bg-gray-100 dark:bg-gray-800"></div>
          <div class="h-6 w-full rounded-xl bg-gray-100 dark:bg-gray-800"></div>
        </div>
      `;
      return;
    }

    volunteers.slice(0, 4).forEach((vol) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/40';

      const volunteerName =
        vol.name ||
        `${vol.firstName || ''} ${vol.lastName || ''}`.trim() ||
        vol.email ||
        'Volunteer';

      const nameDiv = document.createElement('div');
      nameDiv.innerHTML = `
          <p class="font-semibold text-gray-800 text-theme-sm dark:text-white/90">${volunteerName}</p>`;
      row.appendChild(nameDiv);

      const hoursSpan = document.createElement('span');
      hoursSpan.className = 'text-sm font-semibold text-gray-800 dark:text-white/90';
      hoursSpan.textContent = `${formatHours(vol.totalHours)} hrs`;
      row.appendChild(hoursSpan);

      list.appendChild(row);
    });
  };

  const updateBusiestDay = (busiest, wowPercent = null) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (el) => el.textContent.trim() === 'Busiest Day'
    );
    if (!heading) return;
    const card = heading.closest('div.rounded-2xl');
    const title = card?.querySelector('p.text-2xl');
    const subtitle = card?.querySelector('span.text-gray-500');
    const wowPill = card?.querySelector('span.rounded-full');
    const bar = card?.querySelector('div.h-2 > div');
    if (title) title.textContent = busiest.label || '—';
    if (subtitle) subtitle.textContent = `${formatHours(busiest.hours)} hours logged`;
    if (wowPill) {
      if (!Number.isFinite(wowPercent) || wowPercent <= 0) {
        wowPill.classList.add('hidden');
      } else {
        const rounded = Math.round(wowPercent * 10) / 10;
        wowPill.textContent = `+${rounded}% WoW`;
        wowPill.classList.remove('hidden');
      }
    }
    if (bar) {
      bar.style.width = busiest.hours ? '72%' : '0%';
    }
  };

  const updateAvgHours = (avgHours, deltaPercent = null) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (el) => el.textContent.trim() === 'Avg Volunteer Hours / Week'
    );
    if (!heading) return;
    const card = heading.closest('div.rounded-2xl');
    const value = card?.querySelector('p.text-3xl');
    const pill = card?.querySelector('span.rounded-full');
    if (value) value.textContent = `${formatHours(avgHours)} hrs`;
    if (pill) {
      if (!Number.isFinite(deltaPercent)) {
        pill.classList.add('hidden');
      } else {
        const rounded = Math.round(deltaPercent * 10) / 10;
        const sign = rounded > 0 ? '+' : '';
        pill.textContent = `${sign}${rounded}%`;
        pill.className = 'rounded-full px-3 py-1 text-sm font-semibold';
        if (rounded > 0) {
          pill.classList.add('bg-success-50', 'text-success-600', 'dark:bg-success-500/15', 'dark:text-success-500');
        } else if (rounded < 0) {
          pill.classList.add('bg-error-50', 'text-error-600', 'dark:bg-error-500/15', 'dark:text-error-500');
        } else {
          pill.classList.add('bg-gray-100', 'text-gray-700', 'dark:bg-gray-800', 'dark:text-gray-200');
        }
        pill.classList.remove('hidden');
      }
    }
  };

  const toDbApprovalStatus = (status) => {
    const normalized = normalizeStatus(status);
    return normalized === 'approved' ? 'accepted' : normalized;
  };

  const getApprovalStatusMeta = (status) => {
    const normalized = normalizeStatus(status);
    switch (normalized) {
      case 'approved':
        return { label: 'Approved', className: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400' };
      case 'denied':
        return { label: 'Denied', className: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400' };
      case 'changes-requested':
        return { label: 'Needs Changes', className: 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400' };
      default:
        return { label: 'Pending', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' };
    }
  };

  const applyApprovalUpdate = async (db, log, status, user, note = '') => {
    if (!log?.id) return null;
    const normalized = normalizeStatus(status);
    const dbStatus = toDbApprovalStatus(status);
    const fieldValue = window.firebase.firestore.FieldValue;
    const historyEntry = {
      status: dbStatus,
      note: note || '',
      by: user?.email || 'Admin',
      at: new Date().toISOString(),
    };
    const payload = {
      approve: dbStatus,
      approvalNote: note || '',
      approvalUpdatedAt: fieldValue.serverTimestamp(),
      approvalUpdatedBy: user?.uid || null,
      approvalHistory: fieldValue.arrayUnion(historyEntry),
    };
    if (normalized === 'approved') {
      payload.approved_at = fieldValue.serverTimestamp();
      payload.approved_by = user?.email || null;
    } else if (normalized === 'denied') {
      payload.denied_at = fieldValue.serverTimestamp();
      payload.denied_by = user?.email || null;
    }
    await db.collection('volunteer_logs').doc(log.id).set(payload, { merge: true });
    return { normalized, dbStatus, historyEntry, note: note || '' };
  };

  const applyLocalApprovalUpdate = (log, result, user) => {
    if (!log || !result) return;
    log.approve = result.dbStatus;
    if (typeof result.note === 'string') {
      log.approvalNote = result.note;
    }
    log.approvalUpdatedBy = user?.uid || log.approvalUpdatedBy || null;
    log.approvalUpdatedAt = result.historyEntry?.at || log.approvalUpdatedAt || new Date().toISOString();
    if (result.historyEntry) {
      if (Array.isArray(log.approvalHistory)) {
        log.approvalHistory = [...log.approvalHistory, result.historyEntry];
      } else {
        log.approvalHistory = [result.historyEntry];
      }
    }
    if (result.normalized === 'approved') {
      log.approved_at = result.historyEntry?.at || log.approved_at || new Date().toISOString();
      log.approved_by = user?.email || log.approved_by || null;
    } else if (result.normalized === 'denied') {
      log.denied_at = result.historyEntry?.at || log.denied_at || new Date().toISOString();
      log.denied_by = user?.email || log.denied_by || null;
    }
  };

  const resolveTableFromHeading = (heading) => {
    if (!heading) return null;
    const card = heading.closest('div.rounded-2xl') || heading.closest('div[class*="rounded"]');
    return (
      card?.querySelector('table')
      || heading.closest('section')?.querySelector('table')
      || heading.closest('div')?.parentElement?.querySelector('table')
      || document.querySelector('table')
    );
  };

  const updateVolunteerRequestTable = (logs, onApprove, onDeny) => {
    const heading = Array.from(document.querySelectorAll('h3')).find((el) => {
      const text = el.textContent.trim();
      return text === 'Recent Volunteer Requests' || text === 'Volunteer Requests';
    });
    if (!heading) return;
    const table = resolveTableFromHeading(heading);
    const tbody = table?.querySelector('tbody');
    if (!tbody) return;
    const thead = table.querySelector('thead');
    if (thead) {
      thead.classList.remove('border-b', 'border-y', 'border-gray-100', 'dark:border-gray-800', 'dark:border-white/[0.05]');
      thead.style.border = 'none';
    }
    const headers = table.querySelectorAll('thead th');
    if (headers.length >= 3) {
      headers[0].textContent = 'Volunteer';
      headers[1].textContent = 'Hours';
      headers[2].textContent = 'Status';
    }
    tbody.innerHTML = '';

    if (!logs.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.className = 'px-4 py-6 text-sm text-gray-500';
      cell.colSpan = 3;
      cell.textContent = 'No pending requests yet.';
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }

    logs.slice(0, 10).forEach((log) => {
      const row = document.createElement('tr');
      row.className = 'text-gray-700 dark:text-gray-300';

      const volunteerName =
        log.volunteer_name ||
        log.name ||
        `${log.firstName || ''} ${log.lastName || ''}`.trim() ||
        log.email ||
        'Volunteer';
      const task = log.site || 'Volunteer session';
      const statusMeta = getApprovalStatusMeta(resolveLogStatusValue(log));

      const nameCell = document.createElement('td');
      nameCell.className = 'px-4 py-4';
      nameCell.innerHTML = `
        <div>
          <p class="font-semibold text-gray-800 dark:text-white/90">${volunteerName}</p>
          <span class="text-gray-500 text-theme-sm dark:text-gray-400">${task}</span>
        </div>`;
      row.appendChild(nameCell);

      const hoursCell = document.createElement('td');
      hoursCell.className = 'px-4 py-4 text-gray-500 text-theme-sm dark:text-gray-400';
      hoursCell.textContent = `${formatHours(getLogHours(log))} hrs`;
      row.appendChild(hoursCell);

      const statusCell = document.createElement('td');
      statusCell.className = 'px-4 py-4';

      const statusWrapper = document.createElement('div');
      statusWrapper.className = 'flex flex-col gap-2';

      if (statusMeta.label !== 'Pending') {
        const statusBadge = document.createElement('span');
        statusBadge.className = `inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusMeta.className}`;
        statusBadge.textContent = statusMeta.label;
        statusWrapper.appendChild(statusBadge);
      }

      const actionsWrapper = document.createElement('div');
      actionsWrapper.className = 'flex gap-2';

      const approveButton = document.createElement('button');
      approveButton.className = 'rounded-lg bg-success-500 px-3 py-1 text-xs font-semibold text-white hover:bg-success-600';
      approveButton.textContent = 'Approve';
      approveButton.addEventListener('click', () => onApprove(log));
      actionsWrapper.appendChild(approveButton);

      const denyButton = document.createElement('button');
      denyButton.className = 'rounded-lg bg-error-500 px-3 py-1 text-xs font-semibold text-white hover:bg-error-600';
      denyButton.textContent = 'Deny';
      denyButton.addEventListener('click', () => onDeny(log));
      actionsWrapper.appendChild(denyButton);

      statusWrapper.appendChild(actionsWrapper);
      statusCell.appendChild(statusWrapper);
      row.appendChild(statusCell);

      tbody.appendChild(row);
    });
  };

  const updateVolunteersTable = (volunteers) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (el) => el.textContent.trim() === 'Volunteers'
    );
    if (heading) {
      heading.className = 'text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl';
      const titleWrap = heading.closest('div');
      if (titleWrap) {
        titleWrap.classList.add('flex', 'flex-col', 'gap-3', 'sm:flex-row', 'sm:items-center', 'sm:justify-between');
        titleWrap.classList.remove('border-b', 'border-gray-100', 'dark:border-gray-800');
        titleWrap.style.borderBottom = 'none';
      }
    }
    const table = resolveTableFromHeading(heading);
    const tbody = table?.querySelector('tbody');
    if (!tbody) return;

    const headers = table.querySelectorAll('thead th');
    if (headers.length >= 5) {
      headers[0].textContent = 'Volunteer';
      headers[1].textContent = 'Total Hours';
      headers[2].textContent = 'Last 30 Days';
      headers[3].textContent = 'Latest Task';
      headers[4].textContent = 'Last Logged';
    }
    tbody.innerHTML = '';

    if (!volunteers.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.className = 'px-4 py-6 text-sm text-gray-500';
      cell.colSpan = 5;
      cell.textContent = 'No volunteers yet.';
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }

    volunteers.slice(0, 12).forEach((vol) => {
      const row = document.createElement('tr');
      row.className = 'text-gray-700 dark:text-gray-300';
      const volunteerName =
        vol.name ||
        `${vol.firstName || ''} ${vol.lastName || ''}`.trim() ||
        vol.email ||
        'Volunteer';

      const nameCell = document.createElement('td');
      nameCell.className = 'px-4 py-4';
      const historyUrl = `/admin/volunteers/index.html?volunteer=${encodeURIComponent(volunteerName)}`
        + `&id=${encodeURIComponent(vol.id || vol.userId || '')}`
        + `&email=${encodeURIComponent(vol.email || '')}`;
      nameCell.innerHTML = `
        <div>
          <a class="font-semibold text-brand-500 underline underline-offset-2" href="${historyUrl}">
            ${volunteerName}
          </a>
          <span class="block text-gray-500 text-theme-sm dark:text-gray-400">${vol.email}</span>
        </div>`;
      row.appendChild(nameCell);

      const totalHoursCell = document.createElement('td');
      totalHoursCell.className = 'px-4 py-4 text-gray-500 text-theme-sm dark:text-gray-400';
      totalHoursCell.textContent = `${formatHours(vol.totalHours)} hrs`;
      row.appendChild(totalHoursCell);

      const last30HoursCell = document.createElement('td');
      last30HoursCell.className = 'px-4 py-4 text-gray-500 text-theme-sm dark:text-gray-400';
      last30HoursCell.textContent = `${formatHours(vol.last30Hours)} hrs`;
      row.appendChild(last30HoursCell);

      const lastTaskCell = document.createElement('td');
      lastTaskCell.className = 'px-4 py-4 text-gray-500 text-theme-sm dark:text-gray-400';
      lastTaskCell.textContent = vol.lastTask || '—';
      row.appendChild(lastTaskCell);

      const lastDateCell = document.createElement('td');
      lastDateCell.className = 'px-4 py-4 text-gray-500 text-theme-sm dark:text-gray-400';
      lastDateCell.textContent = formatLegacyDate(vol.lastDate);
      row.appendChild(lastDateCell);

      tbody.appendChild(row);
    });
  };

  const formatLegacyDate = (value) => {
    if (!value) return '—';
    const raw = String(value).trim();
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
      return raw;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('en-US');
  };

  const matchesHistoryVolunteer = (log) => {
    if (!historyState.active) return false;
    const identity = getVolunteerIdentity(log);
    const email = String(identity.email || '').toLowerCase();
    const nameKey = String(identity.name || '').toLowerCase();
    if (historyState.id && identity.id === historyState.id) return true;
    if (historyState.email && email === historyState.email.toLowerCase()) return true;
    if (historyState.name && nameKey === historyState.name.toLowerCase()) return true;
    return false;
  };

  const downloadVolunteerHistoryCsv = (logs, label) => {
    const rows = [
      ['Task', 'Hours', 'Date', 'Time', 'Status'],
    ];
    logs.forEach((log) => {
      rows.push([
        log.site || log.event || log.event_name || 'Volunteer session',
        formatHours(getLogHours(log)),
        log.date || formatLegacyDate(getLogTimestamp(log)),
        log.time || '—',
        normalizeStatus(resolveLogStatusValue(log)) || 'pending',
      ]);
    });
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeLabel = (label || 'volunteer').replace(/\s+/g, '-').toLowerCase();
    link.href = url;
    link.download = `nexolink-${safeLabel}-history.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const renderVolunteerHistoryView = (logs = []) => {
    if (!historyState.active) return;
    if (!window.location.pathname.includes('/admin/volunteers')) return;
    const heading = Array.from(document.querySelectorAll('h3')).find((el) => {
      const text = el.textContent.trim();
      return text === 'Volunteers' || text.startsWith('Volunteer History');
    });
    if (!heading) return;
    const card = heading.closest('div.rounded-2xl') || heading.closest('div');
    if (!card) return;
    const name = historyState.name || historyState.email || 'Volunteer';

    if (!card.dataset.volunteerHistory) {
      card.dataset.volunteerHistory = 'true';
      card.innerHTML = `
        <div class="px-6 pt-5 pb-3">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 class="text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">Volunteer History: ${name}</h3>
              <p class="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">Approved hours and tasks for this volunteer.</p>
            </div>
            <div class="flex items-center gap-3">
              <a class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-theme-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03] dark:hover:text-white" href="/admin/volunteers/index.html">
                Back
              </a>
              <button type="button" class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-theme-sm font-semibold text-white shadow-theme-xs hover:bg-brand-600" data-volunteer-history-download>
                Download
              </button>
            </div>
          </div>
        </div>
        <div class="border-t border-gray-100 dark:border-gray-800" style="border-top: none;">
          <div class="px-6 pb-8 pt-2">
            <div class="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03] w-full">
              <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                  <thead class="border-y border-gray-100 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <tr>
                      <th class="px-4 py-4 font-medium w-[45%]">Task</th>
                      <th class="px-4 py-4 font-medium w-[20%]">Hours</th>
                      <th class="px-4 py-4 font-medium w-[20%]">Date</th>
                      <th class="px-4 py-4 font-medium w-[15%]">Status</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 dark:divide-gray-800" data-volunteer-history-body></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    const body = card.querySelector('[data-volunteer-history-body]');
    if (!body) return;
    const filtered = logs.filter(matchesHistoryVolunteer);
    body.innerHTML = '';

    if (!filtered.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.className = 'px-4 py-6 text-sm text-gray-500';
      cell.colSpan = 4;
      cell.textContent = 'No history yet.';
      row.appendChild(cell);
      body.appendChild(row);
    } else {
      filtered
        .sort((a, b) => getLogTimestamp(b) - getLogTimestamp(a))
        .forEach((log) => {
          const row = document.createElement('tr');
          row.className = 'text-gray-700 dark:text-gray-300';

          const taskCell = document.createElement('td');
          taskCell.className = 'px-4 py-4 font-semibold text-gray-800 dark:text-white/90';
          taskCell.textContent = log.site || log.event || log.event_name || 'Volunteer session';
          row.appendChild(taskCell);

          const hoursCell = document.createElement('td');
          hoursCell.className = 'px-4 py-4 text-gray-500 text-theme-sm dark:text-gray-400';
          hoursCell.textContent = `${formatHours(getLogHours(log))} hrs`;
          row.appendChild(hoursCell);

          const dateCell = document.createElement('td');
          dateCell.className = 'px-4 py-4 text-gray-500 text-theme-sm dark:text-gray-400';
          dateCell.textContent = formatLegacyDate(log.date || getLogTimestamp(log));
          row.appendChild(dateCell);

          const statusCell = document.createElement('td');
          statusCell.className = 'px-4 py-4 text-gray-500 text-theme-sm dark:text-gray-400';
          statusCell.textContent = normalizeStatus(resolveLogStatusValue(log)) || 'pending';
          row.appendChild(statusCell);

          body.appendChild(row);
        });
    }

    const downloadBtn = card.querySelector('[data-volunteer-history-download]');
    if (downloadBtn && !downloadBtn.dataset.downloadBound) {
      downloadBtn.dataset.downloadBound = 'true';
      downloadBtn.addEventListener('click', () => {
        const list = logs.filter(matchesHistoryVolunteer);
        downloadVolunteerHistoryCsv(list, name);
      });
    }
  };

  const updateAdminEmail = (email) => {
    const node = resolveAdminEmailNode();
    if (node && email) {
      node.textContent = email;
    }
  };

  const updateImpactGoalCard = ({ percent = 0, goal = 0, approved = 0, today = 0 } = {}) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (el) => el.textContent.trim() === 'Monthly Impact Goal'
    );
    if (!heading) return;
    const card = heading.closest('div.rounded-2xl');
    if (!card) return;

    const percentNode = card.querySelector('p.text-4xl, p.text-3xl, p.text-2xl');
    if (percentNode) percentNode.textContent = `${Math.round(percent)}%`;
    const description = card.querySelector('p.text-gray-500, p.text-sm');
    description?.remove();

    const pill = card.querySelector('span.rounded-full');
    if (pill) {
      pill.classList.add('hidden');
    }

    const valueNodes = card.querySelectorAll('span.font-semibold, p.font-semibold');
    if (valueNodes.length >= 3) {
      valueNodes[0].textContent = `${formatHours(goal)} hrs`;
      valueNodes[1].textContent = `${formatHours(approved)} hrs`;
      valueNodes[2].textContent = `${formatHours(today)} hrs`;
    }

    updateRadialChartInCard('Monthly Impact Goal', percent);

    const statBlocks = Array.from(card.querySelectorAll('div')).filter((node) => {
      const label = node.querySelector('p');
      return label && ['Goal', 'Approved', 'Today'].includes(label.textContent.trim());
    });
    statBlocks.forEach((block) => {
      block.querySelectorAll('svg').forEach((svg) => svg.remove());
    });
  };

  const getApexChartInCard = (card) => {
    if (!card || !window.ApexCharts?._chartInstances?.length) return null;
    const instances = window.ApexCharts._chartInstances.map((entry) => entry?.chart || entry);
    return instances.find((chart) => chart?.el && card.contains(chart.el)) || null;
  };

  const waitForApexChartInCard = (card, callback) => {
    if (!card || card.dataset.apexWait) return;
    card.dataset.apexWait = 'true';
    let attempts = 0;
    const tick = () => {
      const chart = getApexChartInCard(card);
      if (chart) {
        delete card.dataset.apexWait;
        callback(chart);
        return;
      }
      attempts += 1;
      if (attempts >= 30) {
        delete card.dataset.apexWait;
        return;
      }
      setTimeout(tick, 200);
    };
    setTimeout(tick, 200);
  };

  const resolveWeeklyHoursCard = () => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (el) => ['Weekly Volunteer Hours', 'Monthly Volunteer Hours'].includes(el.textContent.trim())
    );
    if (!heading) return null;
    heading.textContent = 'Weekly Volunteer Hours';
    const card = heading.closest('div.rounded-2xl') || heading.closest('div');
    const menuBtn = card?.querySelector('button.dropdown-toggle');
    if (menuBtn) menuBtn.remove();
    return card;
  };

  const ensureWeeklyNav = (card, offset) => {
    const header = card?.querySelector('div.flex.items-center.justify-between');
    if (!header) return;
    if (!header.querySelector('[data-week-nav]')) {
      const nav = document.createElement('div');
      nav.dataset.weekNav = 'true';
      nav.className = 'flex items-center gap-2';
      nav.innerHTML = `
        <span class="text-xs font-semibold text-gray-500 dark:text-gray-400" data-week-range></span>
        <button type="button" class="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300" data-week-prev>
          Back
        </button>
        <button type="button" class="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300" data-week-next>
          Next
        </button>
      `;
      header.appendChild(nav);
    }
    const range = header.querySelector('[data-week-range]');
    if (range) range.textContent = formatWeekRange(offset);
    const prev = header.querySelector('[data-week-prev]');
    const next = header.querySelector('[data-week-next]');
    if (prev && !prev.dataset.bound) {
      prev.dataset.bound = 'true';
      prev.addEventListener('click', () => {
        weeklyChartState.offset += 1;
        weeklyChartState.totals = buildWeeklyTotalsForOffset(
          weeklyChartState.logs,
          weeklyChartState.offset
        );
        updateWeeklyHoursCard(weeklyChartState.totals, weeklyChartState.offset);
      });
    }
    if (next && !next.dataset.bound) {
      next.dataset.bound = 'true';
      next.addEventListener('click', () => {
        weeklyChartState.offset = Math.max(0, weeklyChartState.offset - 1);
        weeklyChartState.totals = buildWeeklyTotalsForOffset(
          weeklyChartState.logs,
          weeklyChartState.offset
        );
        updateWeeklyHoursCard(weeklyChartState.totals, weeklyChartState.offset);
      });
    }
  };

  const updateWeeklyHoursCard = (weeklyTotals, offset = 0, attempt = 0) => {
    const card = resolveWeeklyHoursCard();
    if (!card) return false;
    ensureWeeklyNav(card, offset);
    if (!window.ApexCharts?.exec) {
      renderChartFallback(
        'weekly-volunteer-hours',
        WEEK_LABELS,
        [{ name: 'Hours', data: weeklyTotals.map((value) => Number(value.toFixed(1))) }]
      );
      return true;
    }
    const chart = getApexChartInCard(card);
    if (!chart) {
      if (attempt < 2) {
        setTimeout(() => updateWeeklyHoursCard(weeklyTotals, offset, attempt + 1), 400);
      } else {
        waitForApexChartInCard(card, () => updateWeeklyHoursCard(weeklyTotals, offset));
      }
      return false;
    }
    try {
      chart.updateOptions({
        xaxis: { categories: WEEK_LABELS },
        stroke: { width: 4, colors: ['transparent'] },
      }, false, true, false);
      chart.updateSeries(
        [{ name: 'Volunteer Hours', data: weeklyTotals.map((value) => Number(value.toFixed(1))) }],
        true
      );
      ensureWeeklyNav(card, offset);
      return true;
    } catch (error) {
      console.warn('Weekly hours chart update failed', error);
      return false;
    }
  };

  const updateApexChartInCard = (title, series, categories, empty = false) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (el) => el.textContent.trim() === title
    );
    const card = heading?.closest('div.rounded-2xl') || heading?.closest('div');
    const chart = getApexChartInCard(card);
    if (!chart) {
      waitForApexChartInCard(card, () => {
        updateApexChartInCard(title, series, categories, empty);
      });
      return false;
    }
    try {
      if (categories?.length) {
        chart.updateOptions({
          xaxis: { categories },
          stroke: empty ? { width: 0 } : undefined,
          colors: empty ? ['transparent'] : undefined,
          fill: empty ? { opacity: 0 } : undefined,
          markers: empty ? { size: 0 } : undefined,
        }, false, true, false);
      }
      chart.updateSeries(series, true);
      return true;
    } catch (error) {
      console.warn('Chart update failed', title, error);
      return false;
    }
  };

  const updateRadialChartInCard = (title, percent) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (el) => el.textContent.trim() === title
    );
    const card = heading?.closest('div.rounded-2xl') || heading?.closest('div');
    const chart = getApexChartInCard(card);
    if (!chart) {
      waitForApexChartInCard(card, () => {
        updateRadialChartInCard(title, percent);
      });
      return false;
    }
    const safe = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
    try {
      chart.updateSeries([safe], true);
      return true;
    } catch (error) {
      console.warn('Radial chart update failed', title, error);
      return false;
    }
  };

  const parseImpactGoalValue = (data) => {
    const raw = data?.monthlyImpactGoalHours
      ?? data?.monthly_goal_hours
      ?? data?.monthlyImpactGoal
      ?? data?.impact_goal
      ?? data?.impactGoal
      ?? data?.goalHours
      ?? null;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed);
    }
    return null;
  };

  const resolveOrgSettingsKey = (orgId, orgCode) => {
    if (orgId) return String(orgId);
    if (orgCode) return String(orgCode).toUpperCase();
    return null;
  };

  const registerImpactGoalListener = (db, orgId, orgCode) => {
    const key = resolveOrgSettingsKey(orgId, orgCode);
    if (!db || !key) return null;
    return db.collection('organization_settings').doc(key).onSnapshot((snap) => {
      const data = snap.exists ? snap.data() || {} : {};
      const nextGoal = parseImpactGoalValue(data) ?? DEFAULT_IMPACT_GOAL;
      impactGoalState.goal = nextGoal;
      const percent = nextGoal
        ? Math.round((impactGoalState.approved / nextGoal) * 100)
        : 0;
      impactGoalState.percent = percent;
      updateImpactGoalCard({
        percent,
        goal: nextGoal,
        approved: impactGoalState.approved,
        today: impactGoalState.today,
      });
    }, (error) => {
      console.warn('Impact goal listener failed', error);
    });
  };

  const saveImpactGoalValue = async (value) => {
    if (!Number.isFinite(value) || value < 0) return;
    const db = impactGoalState.db;
    const key = impactGoalState.orgKey;
    if (!db || !key) {
      impactGoalState.goal = Math.round(value);
      return;
    }
    try {
      await db.collection('organization_settings').doc(key).set({
        monthlyImpactGoalHours: Math.round(value),
        orgId: impactGoalState.orgId || null,
        orgCode: impactGoalState.orgCode || null,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: impactGoalState.user?.uid || null,
      }, { merge: true });
    } catch (error) {
      console.warn('Unable to save impact goal', error);
    }
  };

  const bindImpactGoalEditor = () => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (el) => el.textContent.trim() === 'Monthly Impact Goal'
    );
    const card = heading?.closest('div.rounded-2xl') || heading?.closest('div');
    if (!card) return;
    const editButton = card.querySelector('button.dropdown-toggle');
    if (!editButton || editButton.dataset.impactGoalBound) return;
    editButton.dataset.impactGoalBound = 'true';
    editButton.classList.add('relative');

    const ensureMenu = () => {
      let menu = card.querySelector('[data-impact-goal-menu]');
      if (menu) return menu;
      menu = document.createElement('div');
      menu.dataset.impactGoalMenu = 'true';
      menu.className = [
        'absolute', 'right-0', 'mt-3', 'w-96', 'max-h-96', 'rounded-xl', 'border',
        'border-gray-200', 'bg-white', 'p-4', 'shadow-lg', 'dark:border-gray-800',
        'dark:bg-gray-900', 'hidden', 'z-[999999]'
      ].join(' ');
      menu.innerHTML = `
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Set Monthly Goal</p>
        <input type="number" min="0" step="1" inputmode="numeric" class="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200" data-impact-goal-input />
        <button type="button" class="mt-3 w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600" data-impact-goal-save>
          Save
        </button>
      `;
      editButton.parentElement?.appendChild(menu);
      const input = menu.querySelector('[data-impact-goal-input]');
      const saveBtn = menu.querySelector('[data-impact-goal-save]');
      if (saveBtn && input) {
        saveBtn.addEventListener('click', () => {
          const parsed = Number(input.value);
          if (!Number.isFinite(parsed) || parsed < 0) return;
          const nextGoal = Math.round(parsed);
          saveImpactGoalValue(nextGoal);
          impactGoalState.goal = nextGoal;
          const percent = nextGoal
            ? Math.round((impactGoalState.approved / nextGoal) * 100)
            : 0;
          impactGoalState.percent = percent;
          updateImpactGoalCard({
            percent,
            goal: nextGoal,
            approved: impactGoalState.approved,
            today: impactGoalState.today,
          });
          menu.classList.add('hidden');
        });
      }
      document.addEventListener('click', (event) => {
        if (!menu.contains(event.target) && !editButton.contains(event.target)) {
          menu.classList.add('hidden');
        }
      });
      return menu;
    };

    editButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = ensureMenu();
      const input = menu.querySelector('[data-impact-goal-input]');
      if (input) input.value = String(impactGoalState.goal ?? DEFAULT_IMPACT_GOAL);
      menu.classList.toggle('hidden');
    });
  };

  const renderImpactChartsZeroState = () => {
    const weeklyZeros = Array.from({ length: 7 }, () => 0);
    weeklyChartState.logs = [];
    weeklyChartState.totals = weeklyZeros;
    updateApexChart(
      'weekly-volunteer-hours',
      [{ name: 'Hours', data: weeklyZeros }],
      WEEK_LABELS,
      false
    );
    updateWeeklyHoursCard(weeklyZeros, weeklyChartState.offset, 0);
    if (!engagementState.data) {
      const monthly = buildMonthlyTotals([]);
      engagementState.data = {
        monthly: {
          labels: monthly.labels,
          hours: monthly.totals,
          volunteers: monthly.totals.map(() => 0),
        },
        quarterly: {
          labels: buildQuarterlyTotals([]).labels,
          hours: buildQuarterlyTotals([]).totals,
          volunteers: buildQuarterlyTotals([]).totals.map(() => 0),
        },
        annual: {
          labels: buildYearlyTotals([]).labels,
          hours: buildYearlyTotals([]).totals,
          volunteers: buildYearlyTotals([]).totals.map(() => 0),
        },
      };
    }
    const data = engagementState.data[engagementState.period];
    if (data) {
      updateApexChartInCard(
        'Impact Over the Year',
        [
          { name: 'New Volunteers', data: data.volunteers.map(() => 0) },
          { name: 'Hours Approved', data: data.hours.map(() => 0) },
        ],
        data.labels,
        false
      );
    }
  };

  const updateEngagementToggleUi = (period) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (el) => ['Impact Over the Year', 'Volunteer Engagement'].includes(el.textContent.trim())
    );
    const card = heading?.closest('div.rounded-2xl') || heading?.closest('div');
    if (!card) return;
    const buttons = Array.from(card.querySelectorAll('button[data-engagement-toggle]'));
    buttons.forEach((button) => {
      const isActive = button.dataset.engagementToggle === period;
      button.classList.toggle('shadow-theme-xs', isActive);
      button.classList.toggle('text-gray-900', isActive);
      button.classList.toggle('dark:text-white', isActive);
      button.classList.toggle('bg-white', isActive);
      button.classList.toggle('dark:bg-gray-800', isActive);
      if (!isActive) {
        button.classList.add('text-gray-500', 'dark:text-gray-400');
        button.classList.remove('bg-white', 'dark:bg-gray-800');
      }
    });
  };

  const updateEngagementCopy = (period) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (el) => ['Impact Over the Year', 'Volunteer Engagement'].includes(el.textContent.trim())
    );
    if (!heading) return;
    heading.textContent = 'Impact Over the Year';
    const subtitle = heading.parentElement?.querySelector('p');
    if (!subtitle) return;
    const copy = {
      monthly: 'Monthly impact from new volunteers and approved hours.',
      quarterly: 'Quarterly impact from new volunteers and approved hours.',
      annual: 'Annual impact from new volunteers and approved hours.',
    };
    subtitle.textContent = copy[period] || copy.monthly;
  };

  const applyEngagementChart = (period, attempt = 0) => {
    const data = engagementState.data?.[period];
    if (!data) {
      updateEngagementToggleUi(period);
      updateEngagementCopy(period);
      return;
    }
    const isEmpty = false;
    const updatedCard = updateApexChartInCard(
      'Impact Over the Year',
      [
        { name: 'New Volunteers', data: data.volunteers },
        { name: 'Hours Approved', data: data.hours.map((value) => Number(value.toFixed(1))) },
      ],
      data.labels,
      isEmpty
    );
    updateApexChart(
      'volunteer-engagement',
      [
        { name: 'New Volunteers', data: data.volunteers },
        { name: 'Hours Approved', data: data.hours.map((value) => Number(value.toFixed(1))) },
      ],
      data.labels,
      isEmpty
    );
    if (!updatedCard && attempt < 4) {
      setTimeout(() => applyEngagementChart(period, attempt + 1), 400);
    }
    updateEngagementToggleUi(period);
    updateEngagementCopy(period);
  };

  const bindEngagementToggleButtons = () => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (el) => ['Impact Over the Year', 'Volunteer Engagement'].includes(el.textContent.trim())
    );
    const card = heading?.closest('div.rounded-2xl') || heading?.closest('div');
    if (!card) return;
    const buttons = Array.from(card.querySelectorAll('button')).filter((button) => {
      const label = button.textContent.trim().toLowerCase();
      return ['monthly', 'quarterly', 'annually'].includes(label);
    });
    buttons.forEach((button) => {
      const label = button.textContent.trim().toLowerCase();
      const period = label === 'annually' ? 'annual' : label;
      if (button.dataset.engagementToggleBound) return;
      button.dataset.engagementToggle = period;
      button.dataset.engagementToggleBound = 'true';
      button.addEventListener('click', () => {
        engagementState.period = period;
        applyEngagementChart(period);
      });
    });
    updateEngagementToggleUi(engagementState.period);
  };

  const bindEngagementToggleDelegate = () => {
    if (document.body.dataset.engagementToggleReady) return;
    document.body.dataset.engagementToggleReady = 'true';
    document.addEventListener('click', (event) => {
      const button = event.target?.closest?.('button');
      if (!button) return;
      const label = button.textContent?.trim?.().toLowerCase?.();
      if (!label || !['monthly', 'quarterly', 'annually'].includes(label)) return;
      const heading = Array.from(document.querySelectorAll('h3')).find(
        (el) => ['Impact Over the Year', 'Volunteer Engagement'].includes(el.textContent.trim())
      );
      const card = heading?.closest('div.rounded-2xl') || heading?.closest('div');
      if (!card || !card.contains(button)) return;
      const period = label === 'annually' ? 'annual' : label;
      engagementState.period = period;
      applyEngagementChart(period);
    });
  };

  const BILLING_PRICE_SCHOOL = 'price_1SXZMfH9sPZuClpwNAJK5Uj2';
  const BILLING_PRICE_SCHOOL_YEARLY = 'price_1ShyF8HbGg7F5Ky7xTVwCMYk';
  const SUPPORT_EMAIL = 'support@nexolink.app';

  const formatMoney = (amountCents, currency = 'usd') => {
    if (typeof amountCents !== 'number') return '—';
    const dollars = amountCents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency || 'usd').toUpperCase(),
      maximumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    }).format(dollars);
  };

  const normalizeBillingDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value);
    if (value?.toDate) return value.toDate();
    return null;
  };

  const resolvePlanInterval = (subscription) => {
    const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
    const first = items[0] || {};
    return subscription?.plan?.interval
      || subscription?.plan_interval
      || subscription?.interval
      || first?.price?.recurring?.interval
      || first?.plan?.interval
      || null;
  };

  const resolvePlanAmount = (subscription) => {
    const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
    const first = items[0] || {};
    return subscription?.plan?.amount
      ?? subscription?.planAmount
      ?? subscription?.amount
      ?? first?.price?.unit_amount
      ?? null;
  };

  const resolvePlanCurrency = (subscription) => {
    const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
    const first = items[0] || {};
    return subscription?.currency
      || subscription?.plan?.currency
      || first?.price?.currency
      || 'usd';
  };

  const resolveNextBillingDate = (subscription) => {
    const trialEnd = normalizeBillingDate(subscription?.trial_end || subscription?.trialEnd);
    const periodEnd = normalizeBillingDate(subscription?.current_period_end || subscription?.currentPeriodEnd);
    if (trialEnd) return trialEnd;
    return periodEnd;
  };

  const resolvePlanKey = (subscription) => (
    subscription?.planKey
    || subscription?.plan_key
    || subscription?.metadata?.plan_key
    || null
  );

  const resolveSchoolPriceIds = () => ({
    monthly: window.STRIPE_PRICE_SCHOOL || BILLING_PRICE_SCHOOL,
    yearly: window.STRIPE_PRICE_SCHOOL_YEARLY || BILLING_PRICE_SCHOOL_YEARLY,
  });

  const buildCheckoutPayload = (planKey, billing) => {
    if (planKey === 'school') {
      const schoolPrices = resolveSchoolPriceIds();
      if (billing === 'yearly') {
        return { plan: 'school', priceId: schoolPrices.yearly };
      }
      return { plan: 'school', priceId: schoolPrices.monthly };
    }
    if (planKey === 'yearly') return { plan: 'yearly' };
    if (planKey === 'monthly') return { plan: 'monthly' };
    return { plan: planKey || 'monthly' };
  };

  const updateBillingRow = (card, labelText, valueText, newLabel) => {
    const rows = Array.from(card.querySelectorAll('div.flex.items-center.justify-between'));
    const row = rows.find((node) => node.textContent.includes(labelText));
    if (!row) return;
    const label = row.querySelector('span.text-gray-500');
    const value = row.querySelector('span.font-semibold');
    if (label && newLabel) label.textContent = newLabel;
    if (value) value.textContent = valueText;
  };

  const ensureBillingRow = (card, labelText, valueText) => {
    if (!card) return null;
    const container = card.querySelector('.mt-6.space-y-4') || card.querySelector('.space-y-4');
    if (!container) return null;
    const rows = Array.from(container.querySelectorAll('div.flex.items-center.justify-between'));
    let row = rows.find((node) => node.textContent.includes(labelText));
    if (!row) {
      row = document.createElement('div');
      row.className = 'flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/40';
      row.innerHTML = `
        <span class="text-gray-500 text-theme-sm dark:text-gray-400">${labelText}</span>
        <span class="font-semibold text-gray-800 dark:text-white/90">${valueText}</span>
      `;
      container.appendChild(row);
    } else {
      const value = row.querySelector('span.font-semibold');
      if (value) value.textContent = valueText;
    }
    return row;
  };

  const updateBillingPage = ({ subscription, invoices = [] }) => {
    const planCard = Array.from(document.querySelectorAll('h3')).find(
      (el) => el.textContent.trim() === 'Current Plan'
    )?.closest('div.rounded-2xl');
    const summaryCard = Array.from(document.querySelectorAll('h3')).find(
      (el) => el.textContent.trim() === 'Billing Summary'
    )?.closest('div.rounded-2xl');
    if (!planCard || !summaryCard) return;

    const hasSubscription = Boolean(subscription);
    const statusRaw = String(subscription?.status || 'inactive').toLowerCase();
    const cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end || subscription?.cancelAtPeriodEnd);
    const interval = resolvePlanInterval(subscription);
    const amount = resolvePlanAmount(subscription);
    const currency = resolvePlanCurrency(subscription);
    const trialEnd = normalizeBillingDate(subscription?.trial_end || subscription?.trialEnd);
    const periodEnd = normalizeBillingDate(subscription?.current_period_end || subscription?.currentPeriodEnd);
    const nextBilling = resolveNextBillingDate(subscription);
    const paidInvoices = invoices.filter((inv) => inv?.status === 'paid' || inv?.amountPaid > 0).length;

    const planKey = resolvePlanKey(subscription);
    const intervalLabel = planKey === 'school'
      ? interval === 'year'
        ? 'School Annual Plan'
        : 'School Monthly Plan'
      : interval === 'year'
        ? 'Yearly Plan'
        : interval === 'month'
          ? 'Monthly Plan'
          : interval
            ? `${interval.charAt(0).toUpperCase()}${interval.slice(1)} Plan`
            : 'Subscription';
    const planName = !hasSubscription
      ? 'No active plan'
      : statusRaw === 'trialing'
        ? `Trial · ${intervalLabel}`
        : intervalLabel;

    const planNameEl = planCard.querySelector('p.mt-1');
    if (planNameEl) planNameEl.textContent = planName;

    const priceEl = planCard.querySelector('p.text-2xl');
    if (priceEl) {
      if (!hasSubscription) {
        priceEl.textContent = 'Select a plan to get started';
      } else {
        const priceLabel = amount != null
          ? `${formatMoney(amount, currency)} / ${interval === 'year' ? 'year' : interval || 'month'}`
          : '—';
        priceEl.textContent = statusRaw === 'trialing' ? `${priceLabel} after trial` : priceLabel;
      }
    }

    const renewEl = planCard.querySelector('span.text-gray-500');
    if (renewEl) {
      if (!hasSubscription) {
        renewEl.textContent = 'Complete checkout to activate billing.';
      } else if (statusRaw === 'trialing' && trialEnd) {
        const daysLeft = Math.max(0, Math.ceil((trialEnd - Date.now()) / (1000 * 60 * 60 * 24)));
        renewEl.textContent = `Trial ends on ${trialEnd.toLocaleDateString()} (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`;
      } else if (cancelAtPeriodEnd && periodEnd) {
        renewEl.textContent = `Cancels on ${periodEnd.toLocaleDateString()}`;
      } else if (nextBilling) {
        renewEl.textContent = `Auto-renews on ${nextBilling.toLocaleDateString()}`;
      } else {
        renewEl.textContent = 'No renewal scheduled';
      }
    }

    const statusPill = planCard.querySelector('span.rounded-full');
    if (statusPill) {
      let pillText = 'Inactive';
      let pillClass = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200';
      if (!hasSubscription) {
        pillText = 'Inactive';
      } else if (statusRaw === 'trialing') {
        pillText = 'Trial';
        pillClass = 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400';
      } else if (statusRaw === 'active') {
        pillText = 'Active';
        pillClass = 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500';
      } else if (cancelAtPeriodEnd) {
        pillText = 'Cancels Soon';
        pillClass = 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400';
      } else if (statusRaw === 'canceled') {
        pillText = 'Canceled';
        pillClass = 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500';
      }
      statusPill.textContent = pillText;
      statusPill.className = `rounded-full px-3 py-1 text-sm font-semibold ${pillClass}`;
    }

    const actions = planCard.querySelector('.mt-6.flex.flex-wrap');
    if (actions) {
      actions.dataset.billingActionsReady = 'true';
      const intervalKey = interval === 'year' ? 'yearly' : interval === 'month' ? 'monthly' : null;
      const cancelDisabled = cancelAtPeriodEnd;
      const schoolPrices = resolveSchoolPriceIds();
      const schoolMonthlyEnabled = Boolean(schoolPrices.monthly);
      const schoolYearlyEnabled = Boolean(schoolPrices.yearly);
      if (!hasSubscription) {
        actions.innerHTML = `
          <button class="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-theme-xs transition hover:bg-brand-600" data-billing-upgrade="monthly">
            Start Monthly
          </button>
          <button class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]" data-billing-upgrade="yearly">
            Start Yearly
          </button>
          <button class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]" data-billing-plan-key="school" data-billing-plan-billing="monthly" ${schoolMonthlyEnabled ? '' : 'disabled'}>
            Start School Monthly
          </button>
          <button class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]" data-billing-plan-key="school" data-billing-plan-billing="yearly" ${schoolYearlyEnabled ? '' : 'disabled'}>
            Start School Yearly
          </button>
        `;
      } else {
        actions.innerHTML = `
          <button class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]" data-cancel-subscription ${cancelDisabled ? 'disabled' : ''}>
            ${cancelDisabled ? 'Cancellation scheduled' : 'Cancel subscription'}
          </button>
          <button class="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-theme-xs transition hover:bg-brand-600" data-billing-upgrade="yearly" ${intervalKey === 'yearly' && planKey !== 'school' ? 'disabled' : ''}>
            ${intervalKey === 'yearly' && planKey !== 'school' ? 'Current Plan' : 'Switch to Yearly'}
          </button>
          <button class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]" data-billing-upgrade="monthly" ${intervalKey === 'monthly' && planKey !== 'school' ? 'disabled' : ''}>
            ${intervalKey === 'monthly' && planKey !== 'school' ? 'Current Plan' : 'Switch to Monthly'}
          </button>
          <button class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]" data-billing-plan-key="school" data-billing-plan-billing="monthly" ${planKey === 'school' && intervalKey === 'monthly' ? 'disabled' : ''} ${schoolMonthlyEnabled ? '' : 'disabled'}>
            ${planKey === 'school' && intervalKey === 'monthly' ? 'Current Plan' : 'Switch to School Monthly'}
          </button>
          <button class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]" data-billing-plan-key="school" data-billing-plan-billing="yearly" ${planKey === 'school' && intervalKey === 'yearly' ? 'disabled' : ''} ${schoolYearlyEnabled ? '' : 'disabled'}>
            ${planKey === 'school' && intervalKey === 'yearly' ? 'Current Plan' : 'Switch to School Yearly'}
          </button>
        `;
        if (cancelDisabled) {
          const cancelBtn = actions.querySelector('[data-cancel-subscription]');
          cancelBtn?.classList.add('opacity-60', 'cursor-not-allowed');
        }
        actions.querySelectorAll('button[disabled]').forEach((btn) => {
          btn.classList.add('opacity-60', 'cursor-not-allowed');
        });
      }
    }

    updateBillingRow(summaryCard, 'Invoices paid', `${paidInvoices}`, 'Total invoices paid');
    updateBillingRow(summaryCard, 'Billing status', hasSubscription ? (statusRaw === 'trialing' ? 'Trial' : statusRaw || 'Inactive') : 'Inactive');
    updateBillingRow(summaryCard, 'Support plan', SUPPORT_EMAIL, 'Support email');
    ensureBillingRow(summaryCard, 'Total invoices paid', `${paidInvoices}`);
    ensureBillingRow(summaryCard, 'Billing status', hasSubscription ? (statusRaw === 'trialing' ? 'Trial' : statusRaw || 'Inactive') : 'Inactive');
    ensureBillingRow(summaryCard, 'Support email', SUPPORT_EMAIL);
    ensureBillingRow(summaryCard, 'Next billing', nextBilling ? formatDateShort(nextBilling) : '—');
    if (hasSubscription && amount != null && nextBilling) {
      ensureBillingRow(summaryCard, 'Upcoming invoice', `${formatMoney(amount, currency)} on ${formatDateShort(nextBilling)}`);
    } else {
      ensureBillingRow(summaryCard, 'Upcoming invoice', '—');
    }
  };

  const updateBillingInvoiceList = (invoices, upcomingInvoice = null) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (el) => el.textContent.trim() === 'Billing Summary'
    );
    const card = heading?.closest('div.rounded-2xl');
    if (!card) return;

    let list = card.querySelector('[data-invoice-list]');
    if (!list) {
      list = document.createElement('div');
      list.dataset.invoiceList = 'true';
      list.className = 'mt-6 space-y-3';
      card.appendChild(list);
    }
    list.innerHTML = '';

    if (!invoices.length && !upcomingInvoice) {
      list.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">No invoices yet.</p>';
      return;
    }

    if (upcomingInvoice) {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-300';
      row.innerHTML = `
        <div>
          <p class="font-semibold text-gray-800 dark:text-white/90">Upcoming invoice</p>
          <span class="text-xs text-gray-500 dark:text-gray-400">${upcomingInvoice.dateLabel || '—'}</span>
        </div>
        <div class="flex items-center gap-4">
          <span class="font-semibold text-gray-800 dark:text-white/90">${upcomingInvoice.amountLabel || '—'}</span>
          <span class="text-xs font-semibold text-brand-500">Estimated</span>
        </div>
      `;
      list.appendChild(row);
    }

    invoices.forEach((invoice) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-300';
      const amount = invoice.amountPaid || invoice.amountDue || 0;
      const currency = (invoice.currency || 'usd').toUpperCase();
      const dateLabel = formatDateShort(invoice.created);
      const link = invoice.hostedInvoiceUrl || invoice.invoicePdf || '#';
      row.innerHTML = `
        <div>
          <p class="font-semibold text-gray-800 dark:text-white/90">${dateLabel}</p>
          <span class="text-xs text-gray-500 dark:text-gray-400">${invoice.status || 'paid'}</span>
        </div>
        <div class="flex items-center gap-4">
          <span class="font-semibold text-gray-800 dark:text-white/90">${(amount / 100).toFixed(2)} ${currency}</span>
          ${link !== '#' ? `<a class="text-xs font-semibold text-brand-500 hover:text-brand-600" href="${link}" target="_blank" rel="noreferrer">View</a>` : ''}
        </div>
      `;
      list.appendChild(row);
    });
  };

  const getLogTimestamp = (log) => {
    if (log.created_at?.toDate) return log.created_at.toDate();
    if (log.created_at instanceof Date) return log.created_at;
    if (typeof log.created_at === 'number') return new Date(log.created_at);
    if (log.date?.toDate) return log.date.toDate();
    if (log.date instanceof Date) return log.date;
    if (typeof log.date === 'number') return new Date(log.date);
    const parsed = parseMDYTime(log.date, log.time);
    if (parsed) return parsed;
    if (typeof log.date === 'string') {
      const parsedIso = Date.parse(log.date);
      if (!Number.isNaN(parsedIso)) return new Date(parsedIso);
    }
    return new Date(0);
  };

  const syncVolunteerHoursFromActivity = (activityLogs, baseVolunteers = [], options = {}) => {
    const map = new Map();
    const adminId = options.adminId || '';

    baseVolunteers.forEach((volunteer) => {
      map.set(volunteer.id, {
        ...volunteer,
        totalHours: 0,
        lastActivity: null,
        logs: [],
      });
    });

    (activityLogs || []).forEach((log, index) => {
      const userId = log.user_id;
      if (!userId) {
        console.warn(`Activity log missing user_id at index ${index}`, log);
        return;
      }
      if (adminId && userId === adminId) return;

      if (!map.has(userId)) {
        const email = log.volunteer_email || log.email || 'Unknown';
        const name = log.firstName
          || log.volunteer_name
          || (email.includes('@') ? email.split('@')[0] : 'Unknown');
        map.set(userId, {
          id: userId,
          firstName: name,
          email,
          totalHours: 0,
          lastActivity: null,
          logs: [],
          registrationDate: null,
          role: normalizeRole(log.role),
        });
      }

      const entry = map.get(userId);
      const hours = parseFloat(log.hours_contributed ?? log.hours ?? 0) || 0;
      const status = normalizeStatus(resolveLogStatusValue(log));
      if (status === 'approved') {
        entry.totalHours += hours;
      }

      entry.logs.push(log);

      const logDate = getLogTimestamp(log);
      if (logDate && (!entry.lastActivity || new Date(entry.lastActivity) < logDate)) {
        entry.lastActivity = log.date || logDate.toISOString();
      }
    });

    return Array.from(map.values());
  };

  const buildVolunteerSummary = (volunteers = []) => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    return volunteers.map((volunteer) => {
      const logs = Array.isArray(volunteer.logs) ? volunteer.logs : [];
      let lastTimestamp = 0;
      let lastTask = '';
      let lastDate = '';
      let last30Hours = 0;

      logs.forEach((log) => {
        const logDate = getLogTimestamp(log);
        const logTimestamp = logDate?.getTime?.() || 0;
        if (normalizeStatus(resolveLogStatusValue(log)) === 'approved' && logTimestamp >= thirtyDaysAgo) {
          last30Hours += getLogHours(log);
        }
        if (logTimestamp && logTimestamp > lastTimestamp) {
          lastTimestamp = logTimestamp;
          lastTask = log.site || log.event || log.event_name || lastTask;
          lastDate = log.date || logDate.toLocaleDateString('en-US');
        }
      });

      const name = volunteer.firstName || volunteer.name || volunteer.email || 'Volunteer';

      return {
        id: volunteer.id,
        userId: volunteer.id,
        name,
        email: volunteer.email || '—',
        role: volunteer.role,
        totalHours: volunteer.totalHours || 0,
        last30Hours,
        lastTask,
        lastDate: lastDate || '—',
      };
    }).sort((a, b) => b.totalHours - a.totalHours);
  };

  const mergeAcceptedJoinRequests = (volunteers, requests, options = {}) => {
    if (!requests.length) return volunteers;
    const map = new Map(
      volunteers.map((vol) => [vol.email?.toLowerCase?.() || vol.userId || vol.name, vol])
    );
    const exclude = typeof options.exclude === 'function' ? options.exclude : null;
    requests.forEach((req) => {
      const email = (req.user_email || req.userEmail || req.email || req.volunteer_email || req.volunteerEmail || '')
        .toLowerCase();
      const firstName = req.firstName || req.first_name || req.given_name || '';
      const lastName = req.lastName || req.last_name || req.family_name || '';
      const fallbackName = `${firstName} ${lastName}`.trim();
      const name = req.user_name || req.userName || req.name || req.volunteer_name || req.volunteerName || fallbackName || email || 'Volunteer';
      const userId = req.user_id || req.userId || req.uid || '';
      const identity = {
        id: userId || '',
        email,
        name,
        key: userId || email || (name ? name.toLowerCase() : ''),
      };
      if (exclude && exclude(identity, req)) return;
      const joinedAt = resolveTimestamp(
        req.reviewed_at
        || req.approved_at
        || req.accepted_at
        || req.joined_at
        || req.created_at
        || req.requested_at
      );
      if (!email && map.has(name)) return;
      const key = email || userId || name;
      if (map.has(key)) return;
      map.set(key, {
        email: email || '—',
        name,
        userId: userId || undefined,
        totalHours: 0,
        last30Hours: 0,
        lastTask: 'Joined organization',
        lastDate: joinedAt ? formatDateShort(joinedAt) : '—',
      });
    });
    return Array.from(map.values()).sort((a, b) => b.totalHours - a.totalHours);
  };

  const computeBusiestDay = (logs) => {
    const totals = new Map();
    logs.forEach((log) => {
      const date = getLogTimestamp(log);
      if (!date) return;
      const label = formatDayLabel(date);
      totals.set(label, (totals.get(label) || 0) + getLogHours(log));
    });
    let best = { label: '—', hours: 0 };
    totals.forEach((hours, label) => {
      if (hours > best.hours) best = { label, hours };
    });
    return best;
  };

  const updateApexChart = (chartId, series, categories, empty = false) => {
    if (!window.ApexCharts?.exec) {
      renderChartFallback(chartId, categories, series);
      return false;
    }
    try {
      if (categories?.length) {
        window.ApexCharts.exec(chartId, 'updateOptions', {
          xaxis: { categories },
          stroke: empty ? { width: 0 } : undefined,
          colors: empty ? ['transparent'] : undefined,
          fill: empty ? { opacity: 0 } : undefined,
          markers: empty ? { size: 0 } : undefined,
        }, false, true);
      }
      window.ApexCharts.exec(chartId, 'updateSeries', series, true);
      return true;
    } catch (error) {
      console.warn('Chart update failed', chartId, error);
      return false;
    }
  };

  const buildMonthlyTotals = (logs) => {
    const now = new Date();
    const labels = [];
    const totals = Array.from({ length: 12 }, () => 0);
    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(date.toLocaleDateString('en-US', { month: 'short' }));
    }
    logs.forEach((log) => {
      const date = getLogTimestamp(log);
      if (!date) return;
      const monthDiff = (date.getFullYear() - now.getFullYear()) * 12 + (date.getMonth() - now.getMonth());
      const index = 11 + monthDiff;
      if (index >= 0 && index < 12) {
        totals[index] += getLogHours(log);
      }
    });
    return { labels, totals };
  };

  const renderChartFallback = (chartId, labels = [], series = []) => {
    const titleMap = {
      'weekly-volunteer-hours': 'Weekly Volunteer Hours',
      'volunteer-engagement': 'Impact Over the Year',
    };
    const heading = titleMap[chartId]
      ? Array.from(document.querySelectorAll('h3')).find(
        (el) => el.textContent.trim() === titleMap[chartId]
      )
      : null;
    const card = heading?.closest('div.rounded-2xl') || heading?.closest('div');
    const wrapper = card?.querySelector('.custom-scrollbar') || card?.querySelector('.overflow-x-auto');
    if (!wrapper) return;

    const safeLabels = Array.isArray(labels) && labels.length ? labels : [];
    const labelCount = safeLabels.length || 7;
    const dataSeries = Array.isArray(series) && series.length ? series[0]?.data || [] : [];
    const safeData = Array.from({ length: labelCount }, (_, idx) => Number(dataSeries[idx] || 0));
    const maxValue = safeData.reduce((max, value) => (value > max ? value : max), 0);
    const roundedMax = maxValue > 0 ? Math.ceil(maxValue) : 1;
    const tickCount = 5;
    const step = roundedMax / (tickCount - 1);
    const ticks = Array.from({ length: tickCount }, (_, idx) => {
      const raw = step * (tickCount - 1 - idx);
      return Number.isFinite(raw) ? Number(raw.toFixed(1)) : 0;
    });
    const verticalPct = (100 / labelCount).toFixed(4);
    const horizontalPct = (100 / (tickCount - 1)).toFixed(4);
    const minWidth = chartId === 'volunteer-engagement' ? 1000 : 650;
    const labelHtml = safeLabels.map((label) => (
      `<span class="text-xs text-gray-500 dark:text-gray-400 text-center">${label}</span>`
    )).join('');
    const axisHtml = ticks.map((tick) => (
      `<span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">${formatHours(tick)}</span>`
    )).join('');
    const barHtml = safeData.map((value) => {
      const height = roundedMax ? Math.max(0, Math.min(100, (value / roundedMax) * 100)) : 0;
      return `
        <div class="flex-1 flex items-end">
          <div class="w-full rounded-md bg-brand-500/70" style="height:${height}%"></div>
        </div>
      `;
    }).join('');

    wrapper.innerHTML = `
      <div style="min-width:${minWidth}px">
        <div class="flex gap-4">
          <div class="flex h-56 flex-col justify-between">
            ${axisHtml}
          </div>
          <div class="relative flex-1">
            <div class="relative h-56 rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
              style="background-image:
                repeating-linear-gradient(to right, rgba(148,163,184,0.18), rgba(148,163,184,0.18) 1px, transparent 1px, transparent ${verticalPct}%),
                repeating-linear-gradient(to bottom, rgba(148,163,184,0.18), rgba(148,163,184,0.18) 1px, transparent 1px, transparent ${horizontalPct}%);">
              <div class="absolute inset-x-2 bottom-2 top-2 flex items-end gap-2">
                ${barHtml}
              </div>
            </div>
          </div>
        </div>
        <div class="mt-3" style="display:grid;grid-template-columns:repeat(${labelCount},minmax(0,1fr));gap:4px;">
          ${labelHtml}
        </div>
      </div>
    `;
  };

  const buildMonthlyCounts = (timestamps = []) => {
    const now = new Date();
    const counts = Array.from({ length: 12 }, () => 0);
    timestamps.forEach((value) => {
      const ts = resolveTimestamp(value);
      if (!ts) return;
      const date = ts instanceof Date ? ts : new Date(ts);
      if (Number.isNaN(date.getTime())) return;
      const monthDiff = (date.getFullYear() - now.getFullYear()) * 12 + (date.getMonth() - now.getMonth());
      const index = 11 + monthDiff;
      if (index >= 0 && index < 12) {
        counts[index] += 1;
      }
    });
    return counts;
  };

  const buildFirstSeenDates = (logs = []) => {
    const seen = new Map();
    logs.forEach((log) => {
      if (normalizeStatus(resolveLogStatusValue(log)) === 'denied') return;
      const identity = getVolunteerIdentity(log);
      const key = identity.id || identity.email || identity.key;
      if (!key) return;
      const date = getLogTimestamp(log);
      if (!date || Number.isNaN(date.getTime?.())) return;
      const prev = seen.get(key);
      if (!prev || date < prev) {
        seen.set(key, date);
      }
    });
    return Array.from(seen.values());
  };

  const buildQuarterlyTotals = (logs) => {
    const now = new Date();
    const labels = [];
    const totals = [];
    for (let offset = 3; offset >= 0; offset -= 1) {
      const ref = new Date(now.getFullYear(), now.getMonth() - (offset * 3), 1);
      const quarter = Math.floor(ref.getMonth() / 3);
      const year = ref.getFullYear();
      const start = new Date(year, quarter * 3, 1);
      const end = new Date(year, quarter * 3 + 3, 0, 23, 59, 59, 999);
      labels.push(`Q${quarter + 1} ${String(year).slice(-2)}`);
      const sum = logs.reduce((acc, log) => {
        const date = getLogTimestamp(log);
        if (!date || date < start || date > end) return acc;
        return acc + getLogHours(log);
      }, 0);
      totals.push(sum);
    }
    return { labels, totals };
  };

  const buildQuarterlyCounts = (timestamps = []) => {
    const now = new Date();
    const counts = [];
    for (let offset = 3; offset >= 0; offset -= 1) {
      const ref = new Date(now.getFullYear(), now.getMonth() - (offset * 3), 1);
      const quarter = Math.floor(ref.getMonth() / 3);
      const year = ref.getFullYear();
      const start = new Date(year, quarter * 3, 1);
      const end = new Date(year, quarter * 3 + 3, 0, 23, 59, 59, 999);
      const count = timestamps.reduce((acc, value) => {
        const ts = resolveTimestamp(value);
        if (!ts) return acc;
        const date = ts instanceof Date ? ts : new Date(ts);
        if (Number.isNaN(date.getTime())) return acc;
        if (date < start || date > end) return acc;
        return acc + 1;
      }, 0);
      counts.push(count);
    }
    return counts;
  };

  const buildYearlyTotals = (logs) => {
    const now = new Date();
    const labels = [];
    const totals = [];
    for (let offset = 3; offset >= 0; offset -= 1) {
      const year = now.getFullYear() - offset;
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31, 23, 59, 59, 999);
      labels.push(String(year));
      const sum = logs.reduce((acc, log) => {
        const date = getLogTimestamp(log);
        if (!date || date < start || date > end) return acc;
        return acc + getLogHours(log);
      }, 0);
      totals.push(sum);
    }
    return { labels, totals };
  };

  const buildYearlyCounts = (timestamps = []) => {
    const now = new Date();
    const counts = [];
    for (let offset = 3; offset >= 0; offset -= 1) {
      const year = now.getFullYear() - offset;
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31, 23, 59, 59, 999);
      const count = timestamps.reduce((acc, value) => {
        const ts = resolveTimestamp(value);
        if (!ts) return acc;
        const date = ts instanceof Date ? ts : new Date(ts);
        if (Number.isNaN(date.getTime())) return acc;
        if (date < start || date > end) return acc;
        return acc + 1;
      }, 0);
      counts.push(count);
    }
    return counts;
  };

  const downloadOrgHoursCsv = (logs, orgName, orgCode) => {
    const rows = [
      ['Volunteer', 'Email', 'Hours', 'Date', 'Time', 'Task', 'Status'],
    ];
    logs.forEach((log) => {
      const name = log.name
        || `${log.firstName || ''} ${log.lastName || ''}`.trim()
        || log.email
        || 'Volunteer';
      rows.push([
        name,
        log.email || '—',
        formatHours(getLogHours(log)),
        log.date || '—',
        log.time || '—',
        log.site || 'Volunteer session',
        normalizeStatus(resolveLogStatusValue(log)) || 'pending',
      ]);
    });
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const label = (orgName || orgCode || 'org').replace(/\s+/g, '-').toLowerCase();
    link.href = url;
    link.download = `nexolink-${label}-hours.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const filterLogsByRange = (logs, startDate, endDate) => {
    const startMs = startDate ? startDate.getTime() : null;
    const endMs = endDate ? endDate.getTime() : null;
    return (logs || []).filter((log) => {
      const date = getLogTimestamp(log);
      const ts = date?.getTime?.();
      if (!ts || Number.isNaN(ts)) return false;
      if (startMs && ts < startMs) return false;
      if (endMs && ts > endMs) return false;
      return true;
    });
  };

  const hideLegacyTableRows = () => {
    const heading = Array.from(document.querySelectorAll('h3')).find((el) => {
      const text = el.textContent.trim();
      return text === 'Recent Volunteer Requests' || text === 'Volunteer Requests' || text === 'Volunteers';
    });
    const table = heading ? resolveTableFromHeading(heading) : document.querySelector('table');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
  };

  const setImpactOverviewDefaults = () => {
    updateMetricText('Active Volunteers', '0');
    updateMetricText('Hours Approved (30d)', '0');
    updateMetricLabel('Hours Approved (30d)', 'Total Hours');
    updateAvgHours(0);
    const goalValue = Number.isFinite(impactGoalState.goal) && impactGoalState.goal >= 0
      ? impactGoalState.goal
      : DEFAULT_IMPACT_GOAL;
    impactGoalState.goal = goalValue;
    impactGoalState.approved = 0;
    impactGoalState.today = 0;
    impactGoalState.percent = 0;
    updateImpactGoalCard({ percent: 0, goal: goalValue, approved: 0, today: 0 });
    renderImpactChartsZeroState();
  };

  const removeVolunteerRequestActions = () => {
    const heading = Array.from(document.querySelectorAll('h3')).find((el) => {
      const text = el.textContent.trim();
      return text === 'Recent Volunteer Requests' || text === 'Volunteer Requests';
    });
    const card = heading?.closest('div.rounded-2xl') || heading?.closest('div');
    if (!card) return;
    const buttons = Array.from(card.querySelectorAll('button'));
    buttons.forEach((button) => {
      const label = button.textContent.trim().toLowerCase();
      if (label === 'filter' || label === 'see all') {
        button.remove();
      }
    });
  };

  const normalizeOrgRecord = (data = {}, docId = null) => {
    const orgId = data.org_id || data.organization_id || data.orgId || data.organizationId || docId || null;
    const orgCode = data.access_code
      || data.organization_code
      || data.org_code
      || data.orgCode
      || data.organizationCode
      || data.accessCode
      || null;
    const orgName = data.org_name
      || data.organization_name
      || data.orgName
      || data.organizationName
      || data.name
      || null;
    return { orgId, orgCode, orgName };
  };

  const resolveOrgRecordById = async (db, collectionName, orgId) => {
    if (!db || !orgId) return null;
    try {
      const snap = await db.collection(collectionName).doc(orgId).get();
      if (!snap.exists) return null;
      return normalizeOrgRecord(snap.data() || {}, snap.id);
    } catch (error) {
      console.warn(`Unable to resolve org by id from ${collectionName}`, error);
      return null;
    }
  };

  const resolveOrgRecordByCode = async (db, collectionName, orgCode) => {
    if (!db || !orgCode) return null;
    const fields = [
      'access_code',
      'organization_code',
      'org_code',
      'orgCode',
      'organizationCode',
      'accessCode',
    ];
    for (const field of fields) {
      try {
        const snap = await db
          .collection(collectionName)
          .where(field, '==', orgCode)
          .limit(1)
          .get();
        if (!snap.empty) {
          const doc = snap.docs[0];
          return normalizeOrgRecord(doc.data() || {}, doc.id);
        }
      } catch (error) {
        console.warn(`Unable to resolve org by code from ${collectionName}`, error);
      }
    }
    return null;
  };

  const resolveCanonicalOrgContext = async (db, orgId, orgCode, orgName) => {
    const collections = ['organizations', 'orgs', 'volunteer_organizations'];
    let resolved = { orgId, orgCode, orgName, source: null };
    for (const collectionName of collections) {
      if (!resolved.orgId) break;
      const record = await resolveOrgRecordById(db, collectionName, resolved.orgId);
      if (record) {
        resolved = {
          orgId: record.orgId || resolved.orgId,
          orgCode: record.orgCode || resolved.orgCode,
          orgName: record.orgName || resolved.orgName,
          source: collectionName,
        };
        break;
      }
    }
    if (!resolved.source && resolved.orgCode) {
      for (const collectionName of collections) {
        const record = await resolveOrgRecordByCode(db, collectionName, resolved.orgCode);
        if (record) {
          resolved = {
            orgId: record.orgId || resolved.orgId,
            orgCode: record.orgCode || resolved.orgCode,
            orgName: record.orgName || resolved.orgName,
            source: collectionName,
          };
          break;
        }
      }
    }
    if (resolved.orgCode) {
      resolved.orgCode = String(resolved.orgCode).trim().toUpperCase();
    }
    return resolved;
  };

  const persistUserOrgContext = async (db, userId, canonical, existing = {}) => {
    if (!db || !userId || !canonical) return;
    const { orgId, orgCode, orgName } = canonical;
    const payload = {};
    if (orgId && orgId !== existing.organizationId && orgId !== existing.organization_id) {
      payload.organizationId = orgId;
      payload.organization_id = orgId;
    }
    if (orgCode && orgCode !== existing.accessCode && orgCode !== existing.access_code) {
      payload.accessCode = orgCode;
      payload.access_code = orgCode;
    }
    if (orgName && orgName !== existing.organizationName && orgName !== existing.organization_name) {
      payload.organizationName = orgName;
      payload.organization_name = orgName;
    }
    if (!Object.keys(payload).length) return;
    try {
      await db.collection('users').doc(userId).set(payload, { merge: true });
    } catch (error) {
      console.warn('Unable to persist org context to user record', error);
    }
  };

  const pickBestOrgRecord = (docs = []) => {
    let best = null;
    let bestScore = -1;
    let bestTime = 0;
    docs.forEach((doc) => {
      const data = doc.data() || {};
      const record = normalizeOrgRecord(data, doc.id);
      let score = 0;
      const role = normalizeRole(data.role || data.accessRole || data.userRole || data.accountRole);
      if (['org-admin', 'admin', 'owner'].includes(role)) score += 5;
      const status = normalizeStatus(data.status || data.join_status || data.membership_status || data.request_status);
      if (['approved', 'accepted'].includes(status)) score += 3;
      if (data.is_primary || data.primary || data.is_default || data.default) score += 4;
      const ts = resolveTimestamp(
        data.updated_at || data.updatedAt || data.created_at || data.createdAt || data.joined_at || data.joinedAt
      );
      const timeScore = Number.isFinite(ts) ? ts : 0;
      if (!best || score > bestScore || (score === bestScore && timeScore > bestTime)) {
        best = record;
        bestScore = score;
        bestTime = timeScore;
      }
    });
    return best;
  };

  const loadDashboard = async ({ auth, db }) => {
    hideLegacyTableRows();
    removeVolunteerRequestActions();
    bindEngagementToggleButtons();
    bindEngagementToggleDelegate();
    bindImpactGoalEditor();
    setImpactOverviewDefaults();
    initVolunteerHistoryState();
    auth.onAuthStateChanged(async (user) => {
      attachSafeNavigation();
      if (!user) {
        if (!window.location.pathname.includes('/admin/login')) {
          window.location.href = '/admin/login';
        }
        return;
      }

      updateAdminEmail(user.email);
      updateProfileDropdownEmail(user.email);
      renderProfileMenu(user.email, async () => {
        await auth.signOut();
        window.location.href = '/';
      });

      let orgCode = null;
      let orgId = null;
      let orgName = null;
      let userRecord = null;

      if (!orgCode || !orgId) {
        try {
          const userDoc = await db.collection('users').doc(user.uid).get();
          const data = userDoc.exists ? userDoc.data() || {} : {};
          userRecord = data;
          orgCode = orgCode || data.accessCode || data.access_code || null;
          orgId = orgId || data.organizationId || data.organization_id || null;
          orgName = orgName || data.organizationName || data.organization_name || null;
        } catch (e) {
          console.warn('Unable to resolve org from users doc', e);
        }
      }
      try {
        const orgSnap = await db
          .collection('user_organizations')
          .where('user_id', '==', user.uid)
          .get();
        if (!orgSnap.empty) {
          const records = orgSnap.docs.map((doc) => normalizeOrgRecord(doc.data() || {}, doc.id));
          const best = pickBestOrgRecord(orgSnap.docs);
          const hasMatch = orgId
            && records.some((record) => record.orgId && String(record.orgId) === String(orgId));
          if (!orgId || !hasMatch) {
            orgCode = best?.orgCode || orgCode;
            orgId = best?.orgId || orgId;
            orgName = best?.orgName || orgName;
          }
        }
      } catch (e) {
        console.warn('Unable to resolve org from user_organizations', e);
      }

      if (orgId) {
        const orgCheck = await resolveOrgRecordById(db, 'organizations', orgId)
          || await resolveOrgRecordById(db, 'orgs', orgId)
          || await resolveOrgRecordById(db, 'volunteer_organizations', orgId);
        if (!orgCheck) {
          orgId = null;
          orgCode = null;
          orgName = null;
        }
      }
      if (!orgCode || !orgId) {
        try {
          const orgSnap = await db
            .collection('volunteer_organizations')
            .where('admin_id', '==', user.uid)
            .get();
          if (!orgSnap.empty) {
            const best = pickBestOrgRecord(orgSnap.docs);
            if (best) {
              orgCode = orgCode || best.orgCode || null;
              orgId = orgId || best.orgId || null;
              orgName = orgName || best.orgName || null;
            }
          }
        } catch (e) {
          console.warn('Unable to resolve org from volunteer_organizations', e);
        }
      }
      if (!orgCode || !orgId) {
        const orgSources = ['organizations', 'orgs'];
        for (const collectionName of orgSources) {
          try {
            const fields = ['admin_id', 'owner_uid', 'user_id', 'created_by'];
            for (const field of fields) {
              const orgSnap = await db
                .collection(collectionName)
                .where(field, '==', user.uid)
                .get();
              if (!orgSnap.empty) {
                const best = pickBestOrgRecord(orgSnap.docs);
                if (best) {
                  orgCode = orgCode || best.orgCode || null;
                  orgId = orgId || best.orgId || null;
                  orgName = orgName || best.orgName || null;
                }
                break;
              }
            }
          } catch (e) {
            console.warn(`Unable to resolve org from ${collectionName}`, e);
          }
          if (orgCode || orgId) break;
        }
      }

      if (orgCode) {
        orgCode = String(orgCode).trim().toUpperCase();
      }
      const canonicalOrg = await resolveCanonicalOrgContext(db, orgId, orgCode, orgName);
      orgId = canonicalOrg.orgId || orgId;
      orgCode = canonicalOrg.orgCode || orgCode;
      orgName = canonicalOrg.orgName || orgName;
      if (canonicalOrg.source) {
        await persistUserOrgContext(db, user.uid, canonicalOrg, userRecord || {});
      }
      impactGoalState.db = db;
      impactGoalState.user = user;
      impactGoalState.orgId = orgId || null;
      impactGoalState.orgCode = orgCode || null;
      impactGoalState.orgKey = resolveOrgSettingsKey(orgId, orgCode);
      if (impactGoalState.unsubscribe) {
        impactGoalState.unsubscribe();
        impactGoalState.unsubscribe = null;
      }
      if (impactGoalState.orgKey) {
        impactGoalState.unsubscribe = registerImpactGoalListener(db, orgId, orgCode);
      }
      console.info('[nexolink-admin] resolved org context', { orgCode, orgId, orgName });
      const isExcludedVolunteer = createVolunteerExclusionChecker({ adminUser: user, orgId });
      insertOrgBadges({ orgName, orgCode });
      updateSidebarOrgName(orgName);
      const qrTrigger = document.querySelector('[data-org-qr-trigger]');
      if (qrTrigger && !qrTrigger.dataset.qrBound) {
        qrTrigger.dataset.qrBound = 'true';
        qrTrigger.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const menu = ensureQrMenu(qrTrigger);
          if (!menu) return;
          menu.classList.toggle('hidden');
          if (!menu.classList.contains('hidden')) {
            renderOrgQr({ auth, orgCode });
          }
        });
      }
      const banner = document.querySelector('[data-org-code-banner]');
      if (banner) banner.remove();

      const joinRequestsMap = new Map();
      const acceptedRequestsMap = new Map();
      let latestLogs = [];
      let latestVolunteers = [];
      let latestUsers = [];
      const logMapByCode = new Map();
      const logMapById = new Map();
      const debugState = { orgCode, orgId };
      window.__nexolinkDebug = debugState;

      const renderFromLogs = (logs = []) => {
        if (historyState.active && window.location.pathname.includes('/admin/volunteers')) {
          renderVolunteerHistoryView(logs);
          return;
        }
        const isExcludedLog = (log) => isExcludedVolunteer(getVolunteerIdentity(log), log);
        const impactLogs = logs.filter((log) => !isExcludedLog(log));
        const approvedLogs = impactLogs.filter((log) => isApprovedLog(log));
        const pendingLogs = impactLogs.filter((log) => isPendingLog(log));
        const approvedKeys = new Set();
        approvedLogs.forEach((log) => {
          const identity = getVolunteerIdentity(log);
          if (identity.id) approvedKeys.add(identity.id);
          if (identity.email) approvedKeys.add(identity.email);
          if (identity.key) approvedKeys.add(identity.key);
          if (identity.name) approvedKeys.add(identity.name.toLowerCase());
        });
        const activeVolunteers = new Set();
        approvedLogs.forEach((log) => {
          const identity = getVolunteerIdentity(log);
          if (identity.key) activeVolunteers.add(identity.key);
        });
        const totalApprovedHours = approvedLogs.reduce((sum, log) => sum + getLogHours(log), 0);

        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
        const approvedLast30 = approvedLogs.filter((log) => {
          const date = getLogTimestamp(log);
          return date && date.getTime() >= thirtyDaysAgo;
        });
        const approvedPrev30 = approvedLogs.filter((log) => {
          const date = getLogTimestamp(log);
          if (!date) return false;
          const ts = date.getTime();
          return ts >= sixtyDaysAgo && ts < thirtyDaysAgo;
        });
        const hoursApprovedPrev30 = approvedPrev30.reduce((sum, log) => sum + getLogHours(log), 0);
        const nowDate = new Date();
        const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
        const nextMonthStart = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 1);
        const prevMonthStart = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1);
        const prevMonthEnd = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
        const approvedThisMonth = approvedLogs.filter((log) => {
          const date = getLogTimestamp(log);
          return date && date >= monthStart && date < nextMonthStart;
        });
        const approvedPrevMonth = approvedLogs.filter((log) => {
          const date = getLogTimestamp(log);
          return date && date >= prevMonthStart && date < prevMonthEnd;
        });
        const hoursApprovedMonth = approvedThisMonth.reduce((sum, log) => sum + getLogHours(log), 0);
        const hoursApprovedPrevMonth = approvedPrevMonth.reduce((sum, log) => sum + getLogHours(log), 0);
        const todayDateKey = new Date().toLocaleDateString('en-US');
        const todayHours = approvedLogs.reduce((sum, log) => {
          const date = getLogTimestamp(log);
          if (!date) return sum;
          return date.toLocaleDateString('en-US') === todayDateKey ? sum + getLogHours(log) : sum;
        }, 0);
        const goalHours = Number.isFinite(impactGoalState.goal)
          ? Math.max(0, impactGoalState.goal)
          : DEFAULT_IMPACT_GOAL;
        const percent = goalHours ? Math.round((hoursApprovedMonth / goalHours) * 100) : 0;

        updateMetricText('Active Volunteers', activeVolunteers.size ? `${activeVolunteers.size}` : '0');
        updateMetricText(['Hours Approved (30d)', 'Total Hours'], `${formatHours(totalApprovedHours)}`);
        updateMetricLabel('Hours Approved (30d)', 'Total Hours');
        const activeLast30Keys = new Set();
        approvedLast30.forEach((log) => {
          const identity = getVolunteerIdentity(log);
          if (identity.key) activeLast30Keys.add(identity.key);
        });
        const activePrev30Keys = new Set();
        approvedPrev30.forEach((log) => {
          const identity = getVolunteerIdentity(log);
          if (identity.key) activePrev30Keys.add(identity.key);
        });
        updateMetricDelta('Active Volunteers', formatDeltaPercent(activeLast30Keys.size, activePrev30Keys.size));
        updateMetricDelta('Total Hours', formatDeltaPercent(hoursApprovedMonth, hoursApprovedPrevMonth));

        const weeklyLogs = impactLogs.filter(
          (log) => normalizeStatus(resolveLogStatusValue(log)) !== 'denied'
        );
        const currentWeekLogs = filterLogsByWeek(weeklyLogs, 0);
        const busiest = computeBusiestDay(currentWeekLogs);
        const hoursThisWeek = currentWeekLogs.reduce((sum, log) => sum + getLogHours(log), 0);
        const prevWeekLogs = filterLogsByWeek(weeklyLogs, 1);
        const hoursPrevWeek = prevWeekLogs.reduce((sum, log) => sum + getLogHours(log), 0);
        updateBusiestDay(busiest, formatDeltaPercent(hoursThisWeek, hoursPrevWeek));

        const volunteerRoster = syncVolunteerHoursFromActivity(logs, latestUsers, { adminId: user.uid });
        const volunteerSummaries = buildVolunteerSummary(volunteerRoster);
        const visibleVolunteers = volunteerSummaries.filter((vol) => {
          if (normalizeRole(vol.role) === 'org-admin') return false;
          if (vol.totalHours > 0) return true;
          const email = String(vol.email || '').toLowerCase();
          const nameKey = String(vol.name || '').toLowerCase();
          return Boolean(
            (vol.id && approvedKeys.has(vol.id))
            || (vol.userId && approvedKeys.has(vol.userId))
            || (email && approvedKeys.has(email))
            || (nameKey && approvedKeys.has(nameKey))
          );
        });
        latestVolunteers = visibleVolunteers;

        const avgWeekly = visibleVolunteers.length
          ? approvedLast30.reduce((sum, log) => sum + getLogHours(log), 0) / 4 / visibleVolunteers.length
          : 0;
        const avgWeeklyPrev = visibleVolunteers.length
          ? hoursApprovedPrev30 / 4 / visibleVolunteers.length
          : 0;
        updateAvgHours(avgWeekly || 0, formatDeltaPercent(avgWeekly, avgWeeklyPrev));
        impactGoalState.goal = goalHours;
        impactGoalState.approved = hoursApprovedMonth;
        impactGoalState.today = todayHours;
        impactGoalState.percent = percent;
        updateImpactGoalCard({
          percent,
          goal: goalHours,
          approved: hoursApprovedMonth,
          today: todayHours,
        });

        weeklyChartState.logs = weeklyLogs;
        const weeklyTotals = buildWeeklyTotalsForOffset(weeklyLogs, weeklyChartState.offset);
        weeklyChartState.totals = weeklyTotals;
        updateApexChart(
          'weekly-volunteer-hours',
          [{ name: 'Hours', data: weeklyTotals.map((value) => Number(value.toFixed(1))) }],
          WEEK_LABELS,
          false
        );

        const monthlyTotals = buildMonthlyTotals(approvedLogs);
        updateApexChart(
          'volunteer-engagement',
          [{ name: 'Total Hours', data: monthlyTotals.totals.map((value) => Number(value.toFixed(1))) }],
          monthlyTotals.labels,
          false
        );
        updateWeeklyHoursCard(weeklyTotals);

        const firstSeenDates = buildFirstSeenDates(impactLogs);
        const monthlyVolunteerCounts = buildMonthlyCounts(firstSeenDates);
        const quarterlyTotals = buildQuarterlyTotals(approvedLogs);
        const quarterlyVolunteerCounts = buildQuarterlyCounts(firstSeenDates);
        const yearlyTotals = buildYearlyTotals(approvedLogs);
        const yearlyVolunteerCounts = buildYearlyCounts(firstSeenDates);

        engagementState.data = {
          monthly: {
            labels: monthlyTotals.labels,
            hours: monthlyTotals.totals,
            volunteers: monthlyVolunteerCounts,
          },
          quarterly: {
            labels: quarterlyTotals.labels,
            hours: quarterlyTotals.totals,
            volunteers: quarterlyVolunteerCounts,
          },
          annual: {
            labels: yearlyTotals.labels,
            hours: yearlyTotals.totals,
            volunteers: yearlyVolunteerCounts,
          },
        };
        applyEngagementChart(engagementState.period);

        const handleApprovalAction = async (log, status) => {
          try {
            const result = await applyApprovalUpdate(db, log, status, user);
            if (result) {
              applyLocalApprovalUpdate(log, result, user);
              renderFromLogs(latestLogs);
            }
          } catch (error) {
            console.error('Failed to update approval status', error);
          }
        };

        updateVolunteerRequestTable(
          pendingLogs,
          (log) => handleApprovalAction(log, 'approved'),
          (log) => handleApprovalAction(log, 'denied')
        );

      const mergedVolunteers = mergeAcceptedJoinRequests(
          visibleVolunteers,
          Array.from(acceptedRequestsMap.values()),
          { exclude: isExcludedVolunteer }
        );
        updateVolunteersTable(mergedVolunteers);
        updateTopVolunteers(mergedVolunteers);

        clearBootingState();
      };

      const volunteerMap = new Map();
      const buildVolunteerEntry = (docSnap) => {
        const data = docSnap.data() || {};
        const volunteerId = data.user_id || data.userId || docSnap.id;
        const email = data.email || data.user_email || data.volunteer_email || '';
        const rawName = data.volunteer_name || data.user_name || data.name || data.displayName || '';
        const combinedName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
        const name = rawName || combinedName || (email ? email.split('@')[0] : 'Unknown');
        return {
          entry: {
            id: volunteerId,
            name,
            firstName: data.firstName || name,
            lastName: data.lastName || '',
            email,
            totalHours: 0,
            lastActivity: null,
            logs: [],
            registrationDate: data.createdAt || data.created_at || null,
            role: normalizeRole(data.role || data.userRole || data.accountRole || data.accessRole),
          },
          data,
        };
      };
      const handleVolunteerSnapshot = (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') {
            volunteerMap.delete(change.doc.id);
            return;
          }
          const { entry, data } = buildVolunteerEntry(change.doc);
          const identity = getUserIdentity({
            ...data,
            id: entry.id,
            email: entry.email,
            firstName: entry.firstName,
          });
          if (isExcludedVolunteer && isExcludedVolunteer(identity, data)) {
            volunteerMap.delete(change.doc.id);
            return;
          }
          volunteerMap.set(change.doc.id, entry);
        });
        latestUsers = Array.from(volunteerMap.values());
        console.info('[nexolink-admin] volunteer snapshot', { size: snapshot.size });
        renderFromLogs(latestLogs);
      };

      const registerVolunteerListener = (query, label) => (
        query.onSnapshot(
          handleVolunteerSnapshot,
          (err) => console.warn(label, err)
        )
      );

      const mergeLogMaps = () => {
        const merged = new Map();
        logMapByCode.forEach((value, key) => merged.set(key, value));
        logMapById.forEach((value, key) => merged.set(key, value));
        const logs = Array.from(merged.values());
        latestLogs = logs;

        renderFromLogs(logs);
      };

      const handleLogSnapshot = (snapshot, map) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') {
            map.delete(change.doc.id);
          } else {
            map.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
          }
        });
        const lastMeta = debugState.lastLogSnap || {};
        const info = {
          size: snapshot.size,
          field: lastMeta.field || (map === logMapById ? 'linked' : 'code'),
          value: lastMeta.value || null,
          target: snapshot.query?._queryOptions || {},
        };
        console.info('[nexolink-admin] log snapshot', info);
        debugState.lastLogSnap = info;
        mergeLogMaps();
      };

      const logListeners = [];
      const codeCandidates = Array.from(
        new Set(
          [orgCode, orgCode ? orgCode.toLowerCase() : null].filter(Boolean)
        )
      );
      const logCodeFields = [
        'organization_id',
        'organization_code',
        'org_code',
        'orgCode',
        'org_access_code',
        'access_code',
      ];
      const logIdFields = [
        'linked_org_id',
        'org_id',
        'linkedOrgId',
        'organizationId',
        'orgId',
      ];
      codeCandidates.forEach((code) => {
        logCodeFields.forEach((field) => {
          console.info('[nexolink-admin] log listener start', { field, code });
          logListeners.push(
            db.collection('volunteer_logs')
              .where(field, '==', code)
              .onSnapshot(
                (snap) => {
                  debugState.lastLogSnap = { field, value: code, size: snap.size };
                  handleLogSnapshot(snap, logMapByCode);
                },
                (err) => console.warn(`Unable to listen for org code logs (${field}=${code})`, err)
              )
          );
        });
      });
      if (orgId) {
        logIdFields.forEach((field) => {
          console.info('[nexolink-admin] log listener start', { field, id: orgId });
          logListeners.push(
            db.collection('volunteer_logs')
              .where(field, '==', orgId)
              .onSnapshot(
                (snap) => {
                  debugState.lastLogSnap = { field, value: orgId, size: snap.size };
                  handleLogSnapshot(snap, logMapById);
                },
                (err) => console.warn(`Unable to listen for org id logs (${field}=${orgId})`, err)
              )
          );
        });
      }

      const userListeners = [];
      const volunteerCodeFields = [
        'organizationCode',
        'org_access_code',
        'access_code',
        'orgCode',
        'organization_code',
        'org_code',
      ];
      const volunteerIdFields = [
        'organization_id',
        'linked_org_id',
        'org_id',
        'organizationId',
        'linkedOrgId',
        'orgId',
      ];
      if (codeCandidates.length) {
        codeCandidates.forEach((code) => {
          volunteerCodeFields.forEach((field) => {
            userListeners.push(
              registerVolunteerListener(
                db.collection('users')
                  .where(field, '==', code),
                `Unable to listen for volunteers (${field}=${code})`
              )
            );
          });
        });
      }
      if (orgId) {
        volunteerIdFields.forEach((field) => {
          userListeners.push(
            registerVolunteerListener(
              db.collection('users')
                .where(field, '==', orgId),
              `Unable to listen for volunteers (${field})`
            )
          );
        });
      }

      if (!logListeners.length) {
        renderFromLogs([]);
      }
      if (!userListeners.length) {
        latestUsers = [];
        renderFromLogs(latestLogs);
      }

      const downloadTrigger = document.querySelector('[data-org-download]');
      if (downloadTrigger && !downloadTrigger.dataset.downloadBound) {
        downloadTrigger.dataset.downloadBound = 'true';
        downloadTrigger.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const menu = ensureDownloadMenu(downloadTrigger);
          if (!menu) return;
          configureDownloadMenu(menu, { orgName, orgCode, logs: latestLogs });
          menu.classList.toggle('hidden');
        });
      }

      const updateJoinRequestUi = () => {
        const items = Array.from(joinRequestsMap.values());
        const notificationItems = items.map((req) => {
          const name = req.user_name || req.userName || req.user_email || 'Volunteer';
          const email = req.user_email || req.userEmail || '—';
          return {
            name,
            email,
            onApprove: async () => {
              await db.collection('organization_join_requests').doc(req.id).set(
                {
                  status: 'accepted',
                  reviewed_at: window.firebase.firestore.FieldValue.serverTimestamp(),
                  reviewed_by: user.email || null,
                },
                { merge: true }
              );
              joinRequestsMap.delete(req.id);
              updateJoinRequestUi();
            },
            onDeny: async () => {
              await db.collection('organization_join_requests').doc(req.id).set(
                {
                  status: 'denied',
                  reviewed_at: window.firebase.firestore.FieldValue.serverTimestamp(),
                  reviewed_by: user.email || null,
                },
                { merge: true }
              );
              joinRequestsMap.delete(req.id);
              updateJoinRequestUi();
            },
          };
        });
        renderNotificationMenu(notificationItems);
        updateNotificationMenu(notificationItems);
      };

      const refreshAcceptedVolunteers = () => {
        const accepted = Array.from(acceptedRequestsMap.values());
        const merged = mergeAcceptedJoinRequests(latestVolunteers, accepted, { exclude: isExcludedVolunteer });
        updateVolunteersTable(merged);
        updateTopVolunteers(merged);
      };

      const requestListeners = [];
      const joinRequestIdFields = [
        'org_id',
        'organization_id',
        'linked_org_id',
        'orgId',
        'organizationId',
        'linkedOrgId',
      ];
      const joinRequestCodeFields = [
        'org_access_code',
        'organization_code',
        'access_code',
        'org_code',
        'orgCode',
        'organizationCode',
      ];
      const handleJoinRequestSnapshot = (snap, targetMap, onUpdate) => {
        snap.docChanges().forEach((change) => {
          if (change.type === 'removed') {
            targetMap.delete(change.doc.id);
          } else {
            targetMap.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
          }
        });
        onUpdate();
      };
      const registerJoinRequestListener = (query, targetMap, onUpdate, label) => {
        requestListeners.push(
          query.onSnapshot(
            (snap) => handleJoinRequestSnapshot(snap, targetMap, onUpdate),
            (err) => console.warn(label, err)
          )
        );
      };
      if (orgId) {
        joinRequestIdFields.forEach((field) => {
          registerJoinRequestListener(
            db.collection('organization_join_requests')
              .where(field, '==', orgId)
              .where('status', '==', 'pending'),
            joinRequestsMap,
            updateJoinRequestUi,
            `Unable to listen for pending join requests (${field})`
          );
        });
      }
      if (orgCode) {
        joinRequestCodeFields.forEach((field) => {
          registerJoinRequestListener(
            db.collection('organization_join_requests')
              .where(field, '==', orgCode)
              .where('status', '==', 'pending'),
            joinRequestsMap,
            updateJoinRequestUi,
            `Unable to listen for pending join requests (${field})`
          );
        });
      }

      renderNotificationMenu([]);
      updateNotificationMenu([]);

      if (orgId) {
        joinRequestIdFields.forEach((field) => {
          registerJoinRequestListener(
            db.collection('organization_join_requests')
              .where(field, '==', orgId)
              .where('status', 'in', ['accepted', 'approved']),
            acceptedRequestsMap,
            refreshAcceptedVolunteers,
            `Unable to listen for accepted join requests (${field})`
          );
        });
      }
      if (orgCode) {
        joinRequestCodeFields.forEach((field) => {
          registerJoinRequestListener(
            db.collection('organization_join_requests')
              .where(field, '==', orgCode)
              .where('status', 'in', ['accepted', 'approved']),
            acceptedRequestsMap,
            refreshAcceptedVolunteers,
            `Unable to listen for accepted join requests (${field})`
          );
        });
      }

      if (window.location.pathname.includes('/admin/billing')) {
        try {
          const token = await user.getIdToken();
          const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          };
          const [invoiceResp, subResp] = await Promise.all([
            fetch('/api/invoices?limit=10', { headers }),
            fetch('/api/subscriptions', { headers }),
          ]);
          const invoiceData = invoiceResp.ok ? await invoiceResp.json() : null;
          const subData = subResp.ok ? await subResp.json() : null;
          const invoiceList = Array.isArray(invoiceData?.invoices) ? invoiceData.invoices : [];
          const invoiceHistory = Array.isArray(subData?.invoiceHistory) ? subData.invoiceHistory : [];
          const subscription = subData?.subscription || null;
          const hasSubscription = Boolean(subscription);
          const mergedInvoicesMap = new Map();
          [...invoiceList, ...invoiceHistory].forEach((inv) => {
            const key = inv?.id || inv?.invoiceId || inv?.hostedInvoiceUrl || JSON.stringify(inv || {});
            if (!mergedInvoicesMap.has(key)) mergedInvoicesMap.set(key, inv);
          });
          const mergedInvoices = Array.from(mergedInvoicesMap.values())
            .sort((a, b) => (resolveTimestamp(b?.created) || 0) - (resolveTimestamp(a?.created) || 0));

          const amount = resolvePlanAmount(subscription);
          const currency = resolvePlanCurrency(subscription);
          const nextBilling = resolveNextBillingDate(subscription);
          const upcomingInvoice = amount != null && nextBilling
            ? {
              amountLabel: formatMoney(amount, currency),
              dateLabel: formatDateShort(nextBilling),
            }
            : null;

          updateBillingPage({ subscription, invoices: mergedInvoices });
          updateBillingInvoiceList(mergedInvoices, upcomingInvoice);

          const cancelButton = document.querySelector('[data-cancel-subscription]');
          if (cancelButton && subscription && !cancelButton.disabled) {
            cancelButton.addEventListener('click', async () => {
              try {
                cancelButton.setAttribute('disabled', 'true');
                const resp = await fetch('/api/cancelSubscription', {
                  method: 'POST',
                  headers,
                });
                if (!resp.ok) throw new Error('Cancel request failed.');
                window.location.reload();
              } catch (err) {
                console.error('Cancel subscription failed', err);
                cancelButton.removeAttribute('disabled');
              }
            });
          }

          document.querySelectorAll('[data-billing-upgrade], [data-billing-plan-key]').forEach((button) => {
            if (button.dataset.checkoutBound === 'true' || button.disabled) return;
            button.dataset.checkoutBound = 'true';
            button.addEventListener('click', async () => {
              const planKey = button.dataset.billingPlanKey || button.dataset.billingUpgrade;
              const billing = button.dataset.billingPlanBilling
                || (planKey === 'yearly' ? 'yearly' : planKey === 'monthly' ? 'monthly' : null);
              if (!planKey) return;
              try {
                button.setAttribute('disabled', 'true');
                const payload = buildCheckoutPayload(planKey, billing);
                const resp = await fetch('/api/checkout', {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    ...payload,
                    email: user?.email || null,
                    uid: user?.uid || null,
                    trial: !hasSubscription,
                  }),
                });
                if (!resp.ok) {
                  throw new Error('Checkout request failed.');
                }
                const data = await resp.json();
                const url = data?.url || data?.checkoutUrl || null;
                if (url) {
                  window.location.assign(url);
                } else {
                  throw new Error('Checkout URL missing.');
                }
              } catch (err) {
                console.error('Checkout failed', err);
                button.removeAttribute('disabled');
              }
            });
          });
        } catch (error) {
          console.error('Billing data fetch failed', error);
        }
      }
    });
  };

  runAfterHydration(() => {
    hideLegacyTableRows();
    removeVolunteerRequestActions();
    bindEngagementToggleButtons();
    bindEngagementToggleDelegate();
    setImpactOverviewDefaults();
    initVolunteerHistoryState();
    setTimeout(() => {
      updateWeeklyHoursCard(weeklyChartState.totals, weeklyChartState.offset, 0);
      applyEngagementChart(engagementState.period);
    }, 800);
    ensureFirebase()
      .then(loadDashboard)
      .catch((error) => console.error('Admin data init failed', error));
  });
})();
