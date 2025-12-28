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
        } catch (err) {
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
  const isApprovedLog = (log) => normalizeStatus(log?.approve) === 'approved';
  const isDeniedLog = (log) => normalizeStatus(log?.approve) === 'denied';
  const isPendingLog = (log) => {
    const status = normalizeStatus(log?.approve);
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

  const getLogHours = (log) => Number(log?.hours_contributed ?? log?.hours ?? log?.hoursLogged ?? 0) || 0;

  const formatDayLabel = (date) => date.toLocaleDateString('en-US', { weekday: 'long' });
  const WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getWeekStart = (date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return start;
  };

  const buildWeekDates = (reference) => {
    const start = getWeekStart(reference);
    return WEEK_LABELS.map((_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
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

  const resolveAdminEmailNode = () => {
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
    const nodes = Array.from(document.querySelectorAll('span, p'))
      .filter((node) => node.textContent.trim() === 'admin@nexolink.app');
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
      const numeric = Number.isFinite(value) ? value : parseFloat(String(value).replace(/[^\d.-]/g, ''));
      if (badge) {
        if (label === 'Active Volunteers' || label === 'Total Hours') {
          badge.classList.add('hidden');
          return;
        }
        if (!Number.isFinite(numeric) || numeric <= 0) {
          badge.classList.add('hidden');
        } else {
          badge.classList.remove('hidden');
        }
      }
    }
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
          <p class="font-semibold text-gray-800 text-theme-sm dark:text-white/90">${volunteerName}</p>
          <span class="text-gray-500 text-theme-xs dark:text-gray-400">${vol.lastTask && vol.lastTask !== 'Joined organization' ? vol.lastTask : ''}</span>`;
      row.appendChild(nameDiv);

      const hoursSpan = document.createElement('span');
      hoursSpan.className = 'text-sm font-semibold text-gray-800 dark:text-white/90';
      hoursSpan.textContent = `${formatHours(vol.totalHours)} hrs`;
      row.appendChild(hoursSpan);

      list.appendChild(row);
    });
  };

  const updateBusiestDay = (busiest) => {
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
      if (!busiest.hours) {
        wowPill.classList.add('hidden');
      } else {
        wowPill.classList.remove('hidden');
      }
    }
    if (bar) {
      bar.style.width = busiest.hours ? '72%' : '0%';
    }
  };

  const updateAvgHours = (avgHours) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (el) => el.textContent.trim() === 'Avg Volunteer Hours / Week'
    );
    if (!heading) return;
    const card = heading.closest('div.rounded-2xl');
    const value = card?.querySelector('p.text-3xl');
    const pill = card?.querySelector('span.rounded-full');
    if (value) value.textContent = `${formatHours(avgHours)} hrs`;
    if (pill) {
      if (!avgHours) {
        pill.classList.add('hidden');
      } else {
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
    const headers = table.querySelectorAll('thead th');
    if (headers.length >= 4) {
      headers[0].textContent = 'Volunteer';
      headers[1].textContent = 'Organization';
      headers[2].textContent = 'Hours';
      headers[3].textContent = 'Status';
    }
    tbody.innerHTML = '';

    if (!logs.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.className = 'px-4 py-6 text-sm text-gray-500';
      cell.colSpan = 4;
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
      const orgName = log.organization_name || log.organization_id || '—';
      const statusMeta = getApprovalStatusMeta(log.approve);

      const nameCell = document.createElement('td');
      nameCell.className = 'px-4 py-4';
      nameCell.innerHTML = `
        <div>
          <p class="font-semibold text-gray-800 dark:text-white/90">${volunteerName}</p>
          <span class="text-gray-500 text-theme-sm dark:text-gray-400">${task}</span>
        </div>`;
      row.appendChild(nameCell);

      const orgCell = document.createElement('td');
      orgCell.className = 'px-4 py-4 text-gray-500 text-theme-sm dark:text-gray-400';
      orgCell.textContent = orgName;
      row.appendChild(orgCell);

      const hoursCell = document.createElement('td');
      hoursCell.className = 'px-4 py-4 text-gray-500 text-theme-sm dark:text-gray-400';
      hoursCell.textContent = `${formatHours(getLogHours(log))} hrs`;
      row.appendChild(hoursCell);

      const statusCell = document.createElement('td');
      statusCell.className = 'px-4 py-4';

      const statusWrapper = document.createElement('div');
      statusWrapper.className = 'flex flex-col gap-2';

      const statusBadge = document.createElement('span');
      statusBadge.className = `inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusMeta.className}`;
      statusBadge.textContent = statusMeta.label;
      statusWrapper.appendChild(statusBadge);

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
      nameCell.innerHTML = `
        <div>
          <p class="font-semibold text-gray-800 dark:text-white/90">${volunteerName}</p>
          <span class="text-gray-500 text-theme-sm dark:text-gray-400">${vol.email}</span>
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
      lastDateCell.textContent = vol.lastDate || '—';
      row.appendChild(lastDateCell);

      tbody.appendChild(row);
    });
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
    if (description) description.textContent = percent ? description.textContent : 'No volunteer activity yet.';

    const pill = card.querySelector('span.rounded-full');
    if (pill) {
      if (!approved) {
        pill.classList.add('hidden');
      } else {
        pill.classList.remove('hidden');
      }
    }

    const valueNodes = card.querySelectorAll('span.font-semibold, p.font-semibold');
    if (valueNodes.length >= 3) {
      valueNodes[0].textContent = `${formatHours(goal)} hrs`;
      valueNodes[1].textContent = `${formatHours(approved)} hrs`;
      valueNodes[2].textContent = `${formatHours(today)} hrs`;
    }

    updateRadialChartInCard('Monthly Impact Goal', percent);

    if (!approved && !goal && !today) {
      const statBlocks = Array.from(card.querySelectorAll('div')).filter((node) => {
        const label = node.querySelector('p');
        return label && ['Goal', 'Approved', 'Today'].includes(label.textContent.trim());
      });
      statBlocks.forEach((block) => {
        block.querySelectorAll('svg').forEach((svg) => svg.classList.add('hidden'));
      });
    }
  };

  const updateChartCardEmptyState = (title, message) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (el) => el.textContent.trim() === title
    );
    if (!heading) return;
    const card = heading.closest('div.rounded-2xl');
    if (!card) return;
    const chartWrapper = card.querySelector('.custom-scrollbar') || card.querySelector('.overflow-x-auto');
    if (!chartWrapper) return;
    const hint = message ? `<div class="text-xs text-gray-400 dark:text-gray-500 mt-2">${message}</div>` : '';
    chartWrapper.innerHTML = `
      <div class="p-4">
        <div class="animate-pulse space-y-3">
          <div class="h-3 w-3/5 rounded-full bg-gray-100 dark:bg-gray-800"></div>
          <div class="h-28 rounded-2xl bg-gray-100 dark:bg-gray-800"></div>
          <div class="flex gap-2">
            <div class="h-2 w-16 rounded-full bg-gray-100 dark:bg-gray-800"></div>
            <div class="h-2 w-24 rounded-full bg-gray-100 dark:bg-gray-800"></div>
            <div class="h-2 w-12 rounded-full bg-gray-100 dark:bg-gray-800"></div>
          </div>
        </div>
        ${hint}
      </div>
    `;
  };

  const getApexChartInCard = (card) => {
    if (!card || !window.ApexCharts?._chartInstances?.length) return null;
    const instances = window.ApexCharts._chartInstances.map((entry) => entry?.chart || entry);
    return instances.find((chart) => chart?.el && card.contains(chart.el)) || null;
  };

  const updateApexChartInCard = (title, series, categories, empty = false) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (el) => el.textContent.trim() === title
    );
    const card = heading?.closest('div.rounded-2xl') || heading?.closest('div');
    const chart = getApexChartInCard(card);
    if (!chart) return false;
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
    if (!chart) return false;
    const safe = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
    try {
      chart.updateSeries([safe], true);
      return true;
    } catch (error) {
      console.warn('Radial chart update failed', title, error);
      return false;
    }
  };

  const scrubDashboardForEmptyState = () => {
    updateImpactGoalCard({ percent: 0, goal: 0, approved: 0, today: 0 });
    updateChartCardEmptyState('Monthly Volunteer Hours', 'Data will appear as volunteers log hours.');
    updateChartCardEmptyState('Volunteer Engagement', 'Engagement trends will appear once sessions are recorded.');
  };

  const updateBillingSummary = ({
    invoiceCount = 0,
    statusText = 'Not active',
    renewsAt = null,
    trialEndsAt = null,
    planName = null,
    amountLabel = null,
    hasSubscription = false,
    cancelAtPeriodEnd = false,
  } = {}) => {
    const invoiceValue = document.querySelector('[data-billing-invoices]');
    if (invoiceValue) invoiceValue.textContent = `${invoiceCount}`;

    const statusValue = document.querySelector('[data-billing-status]');
    if (statusValue) statusValue.textContent = statusText || 'Not active';

    const renewValue = document.querySelector('[data-billing-renew]');
    if (renewValue) renewValue.textContent = renewsAt ? formatDateShort(renewsAt) : '—';

    const trialValue = document.querySelector('[data-billing-trial]');
    const trialRow = document.querySelector('[data-billing-trial-row]');
    if (trialValue) trialValue.textContent = trialEndsAt ? formatDateShort(trialEndsAt) : '—';
    if (trialRow) {
      trialRow.classList.toggle('hidden', !trialEndsAt);
    }

    const planValue = document.querySelector('[data-billing-plan]');
    if (planValue) planValue.textContent = planName || '—';

    const amountValue = document.querySelector('[data-billing-amount]');
    if (amountValue) amountValue.textContent = amountLabel || '—';

    const cancelButton = document.querySelector('[data-cancel-subscription]');
    if (cancelButton) {
      cancelButton.classList.toggle('hidden', !hasSubscription);
      cancelButton.textContent = cancelAtPeriodEnd ? 'Cancellation scheduled' : 'Cancel subscription';
      if (cancelAtPeriodEnd) {
        cancelButton.setAttribute('disabled', 'true');
        cancelButton.classList.add('opacity-60', 'cursor-not-allowed');
      } else {
        cancelButton.removeAttribute('disabled');
        cancelButton.classList.remove('opacity-60', 'cursor-not-allowed');
      }
    }

    const emptyState = document.querySelector('[data-billing-empty]');
    if (emptyState) {
      emptyState.classList.toggle('hidden', hasSubscription);
    }
  };

  const removeSupportPlanRow = () => {
    const row = resolveLabelRow('Support plan');
    if (row) {
      row.remove();
    }
  };

  const updateBillingInvoiceList = (invoices) => {
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

    if (!invoices.length) {
      list.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">No invoices yet.</p>';
      return;
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

  const updateDownloadInvoiceButton = (invoices, portalHandler, hasSubscription) => {
    const button = document.querySelector('[data-invoice-download]');
    if (!button) return;
    const latest = invoices[0];
    const url = latest?.invoicePdf || latest?.hostedInvoiceUrl || null;
    if (url) {
      button.addEventListener('click', () => {
        window.open(url, '_blank', 'noopener');
      });
      return;
    }

    if (hasSubscription && portalHandler) {
      button.textContent = 'View upcoming invoice';
      button.addEventListener('click', portalHandler);
      return;
    }

    button.setAttribute('disabled', 'true');
    button.classList.add('opacity-50', 'cursor-not-allowed');
  };

  const getLogTimestamp = (log) => {
    if (log.created_at?.toDate) return log.created_at.toDate();
    if (log.created_at instanceof Date) return log.created_at;
    if (typeof log.created_at === 'number') return new Date(log.created_at);
    const parsed = parseMDYTime(log.date, log.time);
    return parsed || new Date(0);
  };

  const collectVolunteers = (logs, users = [], options = {}) => {
    const map = new Map();
    const idIndex = new Map();
    const emailIndex = new Map();
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const exclude = typeof options.exclude === 'function' ? options.exclude : null;

    const addEntry = (key, entry) => {
      if (!key || map.has(key)) return;
      map.set(key, entry);
      if (entry.id) idIndex.set(entry.id, entry);
      if (entry.email) emailIndex.set(String(entry.email).toLowerCase(), entry);
    };

    users.forEach((user) => {
      const identity = getUserIdentity(user);
      if (exclude && exclude(identity, user)) return;
      const email = String(user.email || '').toLowerCase();
      const id = user.id || user.uid || user.user_id || '';
      const name = user.firstName || user.name || (email ? email.split('@')[0] : 'Volunteer');
      const role = normalizeRole(user.role || user.accessRole || user.type);
      const joinedAt = resolveTimestamp(
        user.createdAt || user.created_at || user.joined_at || user.joinedAt
      );
      const entry = {
        id: id || undefined,
        email: email || '—',
        name: name || 'Volunteer',
        role,
        totalHours: 0,
        last30Hours: 0,
        lastTask: joinedAt ? 'Joined organization' : '',
        lastDate: joinedAt ? formatDateShort(joinedAt) : '—',
        lastTimestamp: joinedAt || 0,
      };
      const key = id || email || (name ? name.toLowerCase() : 'volunteer');
      addEntry(key, entry);
    });

    logs.forEach((log) => {
      const identity = getVolunteerIdentity(log);
      if (exclude && exclude(identity, log)) return;
      let entry = null;
      if (identity.id && idIndex.has(identity.id)) entry = idIndex.get(identity.id);
      if (!entry && identity.email && emailIndex.has(identity.email)) entry = emailIndex.get(identity.email);
      if (!entry && identity.key && map.has(identity.key)) entry = map.get(identity.key);

      if (!entry) {
        const fallbackName = identity.name
          || (identity.email ? identity.email.split('@')[0] : '')
          || 'Volunteer';
        entry = {
          id: identity.id || undefined,
          email: identity.email || '—',
          name: fallbackName,
          role: normalizeRole(log.role),
          totalHours: 0,
          last30Hours: 0,
          lastTask: '',
          lastDate: '—',
          lastTimestamp: 0,
        };
        addEntry(identity.key || identity.id || identity.email || fallbackName.toLowerCase(), entry);
      }

      const status = normalizeStatus(log.approve);
      const logDate = getLogTimestamp(log);
      const logTimestamp = logDate?.getTime?.() || 0;
      const hours = getLogHours(log);

      if (status === 'approved' && entry.role !== 'org-admin') {
        entry.totalHours += hours;
        if (logTimestamp && logTimestamp >= thirtyDaysAgo) {
          entry.last30Hours += hours;
        }
      }

      if (logTimestamp && logTimestamp > entry.lastTimestamp) {
        entry.lastTimestamp = logTimestamp;
        entry.lastTask = log.site || log.event || log.event_name || entry.lastTask;
        entry.lastDate = log.date || logDate.toLocaleDateString('en-US');
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalHours - a.totalHours);
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
      const status = normalizeStatus(log.approve);
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
        if (normalizeStatus(log.approve) === 'approved' && logTimestamp >= thirtyDaysAgo) {
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
    if (!window.ApexCharts?.exec) return false;
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
        log.approve || 'pending',
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

  const loadDashboard = async ({ auth, db }) => {
    hideLegacyTableRows();
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

      let orgCode = localStorage.getItem('nexolink_org_code');
      let orgId = localStorage.getItem('nexolink_org_id');
      let orgName = localStorage.getItem('nexolink_org_name');

      if (!orgCode || !orgId) {
        try {
          const userDoc = await db.collection('users').doc(user.uid).get();
          const data = userDoc.exists ? userDoc.data() || {} : {};
          orgCode = orgCode || data.accessCode || data.access_code || null;
          orgId = orgId || data.organizationId || data.organization_id || null;
          orgName = orgName || data.organizationName || data.organization_name || null;
        } catch (e) {
          console.warn('Unable to resolve org from users doc', e);
        }
      }
      if (!orgCode || !orgId) {
        try {
          const orgSnap = await db
            .collection('user_organizations')
            .where('user_id', '==', user.uid)
            .limit(1)
            .get();
          if (!orgSnap.empty) {
            const data = orgSnap.docs[0].data() || {};
            orgCode = orgCode || data.access_code || data.organization_code || data.org_code || null;
            orgId = orgId || data.org_id || data.organization_id || null;
            orgName = orgName || data.org_name || data.organization_name || null;
          }
        } catch (e) {
          console.warn('Unable to resolve org from user_organizations', e);
        }
      }
      if (!orgCode || !orgId) {
        try {
          const orgSnap = await db
            .collection('volunteer_organizations')
            .where('admin_id', '==', user.uid)
            .limit(1)
            .get();
          if (!orgSnap.empty) {
            const data = orgSnap.docs[0].data() || {};
            orgCode = orgCode || data.access_code || data.organization_code || data.org_code || null;
            orgId = orgId || data.org_id || data.organization_id || null;
            orgName = orgName || data.org_name || data.organization_name || null;
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
                .limit(1)
                .get();
              if (!orgSnap.empty) {
                const data = orgSnap.docs[0].data() || {};
                orgCode = orgCode || data.access_code || data.organization_code || data.org_code || null;
                orgId = orgId || data.org_id || data.organization_id || orgSnap.docs[0].id || null;
                orgName = orgName || data.org_name || data.organization_name || null;
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
        orgCode = String(orgCode).trim();
        const upper = orgCode.toUpperCase();
        localStorage.setItem('nexolink_org_code', upper);
        orgCode = upper;
      }
      if (orgId) {
        localStorage.setItem('nexolink_org_id', orgId);
      }
      if (orgName) {
        localStorage.setItem('nexolink_org_name', orgName);
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
        const isExcludedLog = (log) => isExcludedVolunteer(getVolunteerIdentity(log), log);
        const approvedLogs = logs.filter((log) => isApprovedLog(log) && !isExcludedLog(log));
        const pendingLogs = logs.filter((log) => isPendingLog(log) && !isExcludedLog(log));
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
        const approvedLast30 = approvedLogs.filter((log) => {
          const date = getLogTimestamp(log);
          return date && date.getTime() >= thirtyDaysAgo;
        });
        const hoursApproved30 = approvedLast30.reduce((sum, log) => sum + getLogHours(log), 0);
        const todayDateKey = new Date().toLocaleDateString('en-US');
        const todayHours = approvedLogs.reduce((sum, log) => {
          const date = getLogTimestamp(log);
          if (!date) return sum;
          return date.toLocaleDateString('en-US') === todayDateKey ? sum + getLogHours(log) : sum;
        }, 0);
        const goalHours = approvedLogs.length ? Math.max(hoursApproved30, todayHours) : 0;
        const percent = goalHours ? Math.round((hoursApproved30 / goalHours) * 100) : 0;

        updateMetricText('Active Volunteers', activeVolunteers.size ? `${activeVolunteers.size}` : '0');
        updateMetricText(['Hours Approved (30d)', 'Total Hours'], `${formatHours(totalApprovedHours)}`);

        const busiest = computeBusiestDay(approvedLast30.length ? approvedLast30 : approvedLogs);
        updateBusiestDay(busiest);

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
        updateAvgHours(avgWeekly || 0);
        updateImpactGoalCard({
          percent,
          goal: goalHours,
          approved: hoursApproved30,
          today: todayHours,
        });

        const weekDates = buildWeekDates(new Date());
        const weekStart = weekDates[0];
        const weekEnd = new Date(
          weekDates[6].getFullYear(),
          weekDates[6].getMonth(),
          weekDates[6].getDate(),
          23,
          59,
          59,
          999
        );
        const weeklyTotals = Array.from({ length: 7 }, () => 0);
        approvedLogs.forEach((log) => {
          const date = getLogTimestamp(log);
          if (!date || date < weekStart || date > weekEnd) return;
          weeklyTotals[date.getDay()] += getLogHours(log);
        });
        const weeklySum = weeklyTotals.reduce((sum, value) => sum + value, 0);
        updateApexChart(
          'weekly-volunteer-hours',
          [{ name: 'Hours', data: weeklyTotals.map((value) => Number(value.toFixed(1))) }],
          WEEK_LABELS,
          weeklySum <= 0
        );

        const monthlyTotals = buildMonthlyTotals(approvedLogs);
        const monthlySum = monthlyTotals.totals.reduce((sum, value) => sum + value, 0);
        updateApexChart(
          'volunteer-engagement',
          [{ name: 'Total Hours', data: monthlyTotals.totals.map((value) => Number(value.toFixed(1))) }],
          monthlyTotals.labels,
          monthlySum <= 0
        );
        updateApexChartInCard(
          'Monthly Volunteer Hours',
          [{ name: 'Volunteer Hours', data: monthlyTotals.totals.map((value) => Number(value.toFixed(1))) }],
          monthlyTotals.labels,
          monthlySum <= 0
        );

        const acceptedDates = Array.from(acceptedRequestsMap.values()).map((req) => (
          req.reviewed_at || req.approved_at || req.accepted_at || req.joined_at || req.created_at || req.requested_at
        ));
        const volunteerJoinDates = latestUsers.map((vol) => (
          vol.createdAt || vol.created_at || vol.joined_at || vol.joinedAt || vol.registrationDate
        ));
        const monthlyVolunteerCounts = buildMonthlyCounts([...volunteerJoinDates, ...acceptedDates]);
        updateApexChartInCard(
          'Volunteer Engagement',
          [
            { name: 'New Volunteers', data: monthlyVolunteerCounts },
            { name: 'Hours Approved', data: monthlyTotals.totals.map((value) => Number(value.toFixed(1))) },
          ],
          monthlyTotals.labels,
          monthlySum <= 0
        );

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

        if (!logs.length || !approvedLogs.length || weeklySum <= 0) {
          updateChartCardEmptyState('Monthly Volunteer Hours', 'Data will appear as volunteers log hours.');
        }
        if (!logs.length || !approvedLogs.length || monthlySum <= 0) {
          updateChartCardEmptyState('Volunteer Engagement', 'Engagement trends will appear once sessions are recorded.');
        }
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

        // Auto-align org context from first available log if missing/mismatched.
        if ((!orgCode || !orgId) && logs.length) {
          const first = logs[0] || {};
          const detectedCode = first.organization_id || first.organization_code || first.org_code || first.org_access_code || null;
          const detectedId = first.linked_org_id || first.org_id || first.organizationId || null;
          const detectedName = first.organization_name || null;
          if (detectedCode && (!orgCode || orgCode !== String(detectedCode).toUpperCase())) {
            orgCode = String(detectedCode).toUpperCase();
            localStorage.setItem('nexolink_org_code', orgCode);
          }
          if (detectedId && (!orgId || orgId !== detectedId)) {
            orgId = detectedId;
            localStorage.setItem('nexolink_org_id', orgId);
          }
          if (detectedName && (!orgName || orgName !== detectedName)) {
            orgName = detectedName;
            localStorage.setItem('nexolink_org_name', orgName);
            insertOrgBadges({ orgName, orgCode });
            updateSidebarOrgName(orgName);
          }
          window.__nexolinkDebug = { ...(window.__nexolinkDebug || {}), orgCode, orgId, orgName, autoDetectedFromLogs: true };
        }

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
        removeSupportPlanRow();
        try {
          const token = await user.getIdToken();
          const headers = { Authorization: `Bearer ${token}` };
          const [invoiceResp, subResp] = await Promise.all([
            fetch('/api/invoices?limit=1', { headers }),
            fetch('/api/subscriptions', { headers }),
          ]);
          const invoiceData = invoiceResp.ok ? await invoiceResp.json() : null;
          const subData = subResp.ok ? await subResp.json() : null;
          const invoices = Array.isArray(invoiceData?.invoices) ? invoiceData.invoices : [];
          const subscription = subData?.subscription || null;
          const hasSubscription = Boolean(subscription);
          const statusRaw = String(subscription?.status || '').replace(/_/g, ' ').trim();
          const statusText = hasSubscription && statusRaw
            ? statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1)
            : 'Not active';
          const renewsAt = resolveTimestamp(
            subscription?.currentPeriodEnd
            || subscription?.current_period_end
            || subscription?.currentPeriodEndMs
            || subscription?.current_period_end_ms
          );
          const trialEndsAt = resolveTimestamp(
            subscription?.trialEnd
            || subscription?.trial_end
            || subscription?.trialEndMs
            || subscription?.trial_end_ms
          );
          const planName =
            subscription?.planNickname
            || subscription?.planName
            || subscription?.plan_key
            || subscription?.planKey
            || subscription?.plan
            || null;
          const amount = typeof subscription?.amount === 'number' ? subscription.amount : null;
          const currencyLabel = subscription?.currency ? String(subscription.currency).toUpperCase() : null;
          const amountLabel = amount != null
            ? `${(amount / 100).toFixed(2)} ${currencyLabel || ''}`.trim()
            : null;
          const cancelAtPeriodEnd = Boolean(subscription?.cancelAtPeriodEnd);
          updateBillingInvoiceList(invoices);
          updateDownloadInvoiceButton(invoices, async () => {
            try {
              const portalResp = await fetch('/api/portal', { headers });
              const portalData = portalResp.ok ? await portalResp.json() : null;
              const portalUrl = portalData?.url || null;
              if (portalUrl) window.open(portalUrl, '_blank', 'noopener');
            } catch (err) {
              console.error('Unable to open billing portal', err);
            }
          }, Boolean(subscription));
          updateBillingSummary({
            invoiceCount: invoices.length,
            statusText,
            renewsAt,
            trialEndsAt,
            planName,
            amountLabel,
            hasSubscription,
            cancelAtPeriodEnd,
          });

          const cancelButton = document.querySelector('[data-cancel-subscription]');
          if (cancelButton && subscription && !cancelAtPeriodEnd) {
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
        } catch (error) {
          console.error('Billing data fetch failed', error);
        }
      }
    });
  };

  runAfterHydration(() => {
    hideLegacyTableRows();
    ensureFirebase()
      .then(loadDashboard)
      .catch((error) => console.error('Admin data init failed', error));
  });
})();
