import { appState } from './state.js';
import { auth } from './firebase.js';
import { showMessage } from './ui.js';

let initialized = false;
let qrLibPromise = null;
let isBusy = false;
const badgeCache = new Map();

const QR_SOURCE_CANDIDATES = [
  { type: 'module', url: 'https://esm.run/qrcode@1.5.3' },
  { type: 'module', url: 'https://esm.sh/qrcode@1.5.3?target=es2020&no-check' },
  { type: 'script', url: '/js/vendor/qrcode-generator.js', global: 'qrcode' }
];

function loadScript(url) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Script loading unavailable in this environment.'));
      return;
    }
    const selector = `script[data-qr-src="${url}"]`;
    const existing = document.querySelector(selector);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error(`Failed to load script: ${url}`)),
          { once: true }
        );
      }
      return;
    }

    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.dataset.qrSrc = url;
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve();
      },
      { once: true }
    );
    script.addEventListener(
      'error',
      () => {
        script.remove();
        reject(new Error(`Failed to load script: ${url}`));
      },
      { once: true }
    );
    document.head.appendChild(script);
  });
}

function drawWithGenerator(generatorFactory, canvas, payload, options = {}) {
  const qr = generatorFactory(0, options.errorCorrectionLevel || 'M');
  qr.addData(String(payload ?? ''));
  qr.make();

  const modules = qr.getModuleCount();
  if (!modules || !canvas) {
    throw new Error('Invalid QR canvas target.');
  }

  const marginSetting = Number.isFinite(options.margin) ? options.margin : 4;
  const safeMargin = Math.max(0, Math.floor(marginSetting));
  const targetSize = Math.max(
    Math.floor(options.width || Number(canvas.getAttribute('width')) || modules + safeMargin * 2),
    modules + safeMargin * 2
  );
  const scale = Math.max(1, Math.floor((targetSize - safeMargin * 2) / modules));
  const renderSize = modules * scale + safeMargin * 2;

  const displayWidthAttr = canvas.getAttribute('width');
  const displayHeightAttr = canvas.getAttribute('height');

  canvas.width = renderSize;
  canvas.height = renderSize;
  if (displayWidthAttr) {
    canvas.style.width = `${displayWidthAttr}px`;
  }
  if (displayHeightAttr) {
    canvas.style.height = `${displayHeightAttr}px`;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to access canvas context.');
  }

  ctx.imageSmoothingEnabled = false;
  const lightColor = options.color?.light || '#ffffff';
  const darkColor = options.color?.dark || '#000000';
  ctx.fillStyle = lightColor;
  ctx.fillRect(0, 0, renderSize, renderSize);

  ctx.fillStyle = darkColor;
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (qr.isDark(row, col)) {
        const x = safeMargin + col * scale;
        const y = safeMargin + row * scale;
        ctx.fillRect(x, y, scale, scale);
      }
    }
  }
}

function createGeneratorAdapter(globalScope, source) {
  const generatorFactory = source?.global
    ? globalScope[source.global]
    : globalScope.qrcode || globalScope.QRCode || globalScope.Qrcode;

  if (typeof generatorFactory !== 'function') {
    throw new Error('QR generator fallback unavailable.');
  }

  return {
    async toCanvas(canvas, payload, options) {
      drawWithGenerator(generatorFactory, canvas, payload, options);
    }
  };
}

function normalizeModuleCandidate(candidate) {
  if (!candidate) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(candidate, 'default')) {
    const defaultExport = candidate.default;
    if (defaultExport && (typeof defaultExport === 'object' || typeof defaultExport === 'function')) {
      return defaultExport;
    }
  }
  return candidate;
}

function loadQrLib() {
  if (!qrLibPromise) {
    qrLibPromise = (async () => {
      let lastError = null;
      for (const source of QR_SOURCE_CANDIDATES) {
        try {
          if (source.type === 'module') {
            const imported = await import(source.url);
            const normalized = normalizeModuleCandidate(imported);
            if (normalized?.toCanvas) {
              return normalized;
            }
            throw new Error('QR module missing toCanvas export.');
          }
          if (source.type === 'script') {
            await loadScript(source.url);
            if (typeof window === 'undefined') {
              throw new Error('QR generator fallback requires a browser environment.');
            }
            return createGeneratorAdapter(window, source);
          }
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error('Unable to load QR code module.');
    })();
  }
  return qrLibPromise;
}

function getTrigger() {
  return document.getElementById('checkInBadgeBtn');
}

function getModal() {
  return document.getElementById('checkInBadgeModal');
}

function getIdentifiers() {
  const admin = appState.currentAdmin || {};
  const orgId = admin.organizationId
    || admin.organization_id
    || appState.currentOrgCode
    || admin.organizationCode
    || '—';
  const adminId = admin.uid
    || admin.adminId
    || admin.id
    || admin.email
    || '—';
  return { admin, orgId, adminId };
}

let lastIssuedPayload = null;
let expiryTimer = null;

function clearExpiryTimer() {
  if (expiryTimer) {
    clearInterval(expiryTimer);
    expiryTimer = null;
  }
}

function normalizeOrgCode(value) {
  return String(value || '').trim().toUpperCase();
}

function getCurrentOrgCode() {
  return normalizeOrgCode(appState.currentOrgCode || getIdentifiers().orgId || '');
}

function isPayloadExpired(payload) {
  if (!payload) return true;
  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  if (!exp) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return nowSec >= exp;
}

function getCachedBadgePayload(orgCode) {
  const normalized = normalizeOrgCode(orgCode);
  if (!normalized) return null;
  return badgeCache.get(normalized) || null;
}

function cacheBadgePayload(orgCode, payload) {
  const normalized = normalizeOrgCode(orgCode);
  if (!normalized || !payload) return;
  badgeCache.set(normalized, payload);
}

function formatBadgeStatus() {
  if (!lastIssuedPayload) {
    return 'Ready to scan.';
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const exp = typeof lastIssuedPayload.exp === 'number' ? lastIssuedPayload.exp : null;
  const issuedAt = typeof lastIssuedPayload.issuedAt === 'number' ? lastIssuedPayload.issuedAt : null;

  if (exp && nowSec >= exp) {
    return 'Expired — close and reopen this badge to refresh.';
  }

  if (exp) {
    const remaining = Math.max(0, exp - nowSec);
    const seconds = remaining % 60;
    const minutes = Math.floor(remaining / 60) % 60;
    const hours = Math.floor(remaining / 3600) % 24;
    const days = Math.floor(remaining / 86400);
    const secLabel = seconds.toString().padStart(2, '0');
    const YEAR_SECONDS = 365.2425 * 86400;
    const approxYears = remaining / YEAR_SECONDS;

    if (approxYears >= 1) {
      const roundedYears = approxYears >= 10
        ? Math.round(approxYears)
        : Math.round(approxYears * 10) / 10;
      const expirationDate = new Date(exp * 1000).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      return `Valid for ~${roundedYears} year${roundedYears === 1 ? '' : 's'} (expires ${expirationDate})`;
    }

    if (days >= 1) {
      const dayLabel = days === 1 ? '1 day' : `${days} days`;
      if (hours > 0) {
        return `Expires in ${dayLabel} ${hours}h`;
      }
      return `Expires in ${dayLabel}`;
    }

    if (hours > 0) {
      const hourLabel = hours === 1 ? '1 hour' : `${hours} hours`;
      if (minutes > 0) {
        return `Expires in ${hourLabel} ${minutes}m`;
      }
      return `Expires in ${hourLabel}`;
    }

    if (minutes > 0) {
      return `Expires in ${minutes}m ${secLabel}s`;
    }

    return `Expires in ${secLabel}s`;
  }

  if (issuedAt) {
    const issuedDate = new Date(issuedAt * 1000);
    if (!Number.isNaN(issuedDate.getTime())) {
      return `Issued ${issuedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
  }

  return 'Badge ready to scan.';
}

function updateBadgeNote() {
  const noteEl = document.getElementById('checkInBadgeUpdatedAt');
  if (noteEl) {
    noteEl.textContent = formatBadgeStatus();
  }
}

function startExpiryTimer() {
  clearExpiryTimer();
  updateBadgeNote();
  if (!lastIssuedPayload) return;
  expiryTimer = setInterval(updateBadgeNote, 1000);
}

function setTriggerState() {
  const trigger = getTrigger();
  const hasAdmin = Boolean(appState.currentAdmin && appState.currentAdmin.uid);
  if (trigger) {
    trigger.disabled = !hasAdmin;
    trigger.setAttribute('aria-disabled', hasAdmin ? 'false' : 'true');
    trigger.title = hasAdmin
      ? 'View check-in badge'
      : 'Sign in to access your check-in badge';
  }
}

function updateModalFieldsFromState() {
  const { orgId, adminId } = getIdentifiers();
  const orgEl = document.getElementById('checkInBadgeOrgId');
  if (orgEl) {
    orgEl.textContent = orgId || '—';
  }
  const adminEl = document.getElementById('checkInBadgeAdminId');
  if (adminEl) {
    adminEl.textContent = adminId || '—';
  }
  updateBadgeNote();
}

function setModalVisibility(visible) {
  const modal = getModal();
  if (!modal) {
    return;
  }
  modal.style.display = visible ? 'flex' : 'none';
  modal.setAttribute('aria-hidden', visible ? 'false' : 'true');
  if (visible) {
    modal.scrollTop = 0;
  }
}

function updateDownloadButtonState() {
  const downloadBtn = document.getElementById('downloadCheckInBadgeBtn');
  if (!downloadBtn) {
    return;
  }
  const canDownload = Boolean(lastIssuedPayload) && !isBusy;
  downloadBtn.disabled = !canDownload;
  downloadBtn.setAttribute('aria-disabled', canDownload ? 'false' : 'true');
}

function updateRefreshButtonState() {
  const refreshBtn = document.getElementById('refreshCheckInBadgeBtn');
  if (!refreshBtn) {
    return;
  }
  refreshBtn.disabled = isBusy;
  refreshBtn.setAttribute('aria-disabled', isBusy ? 'true' : 'false');
}

function setBadgeBusy(state) {
  isBusy = state;
  const modal = getModal();
  if (modal) {
    modal.classList.toggle('loading', state);
    modal.setAttribute('aria-busy', state ? 'true' : 'false');
  }
  updateDownloadButtonState();
  updateRefreshButtonState();
}

async function requestSignedBadge() {
  const { orgId, adminId } = getIdentifiers();
  const cleanedOrg = String(orgId || '').trim().toUpperCase();
  const cleanedAdmin = String(adminId || '').trim();

  if (!cleanedOrg) {
    throw new Error('No organization access code found. Link an organization first.');
  }
  if (!cleanedAdmin) {
    throw new Error('Admin identifier unavailable.');
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sign in to issue a check-in badge.');
  }

  const idToken = await user.getIdToken();

  const response = await fetch('/api/issueAdminQr', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      orgAccessCode: cleanedOrg,
      adminId: cleanedAdmin,
    }),
  });

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error('Invalid response from badge service.');
  }

  if (!response.ok || !data?.ok) {
    const message = data?.message || `Unable to issue QR badge (${response.status})`;
    throw new Error(message);
  }

  return {
    payload: data.payload,
    sig: data.sig,
    meta: {
      orgDocId: data.orgDocId || null,
      orgName: data.orgName || null,
      linkedOrgId: data.linkedOrgId || null,
      adminValid: data.adminValid !== false,
    },
  };
}

async function renderQr(payload) {
  const canvas = document.getElementById('checkInBadgeCanvas');
  if (!canvas) {
    throw new Error('Canvas not available');
  }
  const qrModule = await loadQrLib();
  const qrApi = qrModule?.default && typeof qrModule.default === 'object'
    ? qrModule.default
    : qrModule;
  const toCanvas = qrApi && typeof qrApi.toCanvas === 'function'
    ? qrApi.toCanvas
    : null;
  if (!toCanvas) {
    throw new Error('QR generator unavailable');
  }
  await toCanvas(canvas, payload, {
    width: 240,
    margin: 2,
    color: {
      dark: '#2b1800',
      light: '#ffffff'
    }
  });
}

async function applyBadgePayload(payload) {
  if (!payload) return;
  lastIssuedPayload = payload;
  await renderQr(JSON.stringify(payload));
  updateDownloadButtonState();
  updateModalFieldsFromState();
  if (isModalOpen()) {
    startExpiryTimer();
  } else {
    updateBadgeNote();
  }
}

async function prepareBadge(options = {}) {
  const { forceRefresh = false } = options;
  if (isBusy) {
    return;
  }
  if (!appState.currentAdmin || !appState.currentAdmin.uid) {
    showMessage('Sign in to access your check-in badge.', 'error');
    return;
  }

  const orgAccessCode = getCurrentOrgCode();
  if (!orgAccessCode) {
    showMessage('No organization access code found. Link an organization first.', 'error');
    return;
  }

  if (!forceRefresh) {
    const cached = getCachedBadgePayload(orgAccessCode);
    if (cached && !isPayloadExpired(cached)) {
      await applyBadgePayload(cached);
      return;
    }
  }

  setBadgeBusy(true);
  try {
    const { payload, sig } = await requestSignedBadge();
    const normalizedOrg = normalizeOrgCode(payload?.orgAccessCode);
    const adminId = String(payload?.adminId || '').trim();
    const qrPayload = {
      ...payload,
      sig,
      orgId: normalizedOrg,
      qrToken: sig,
      qrVersion: payload?.v,
      qrIssuedAt: payload?.issuedAt,
      qrExpiresAt: payload?.exp,
      adminId,
      orgAccessCode: normalizedOrg,
    };
    cacheBadgePayload(normalizedOrg, qrPayload);
    await applyBadgePayload(qrPayload);
  } catch (error) {
    console.error('Unable to prepare check-in badge', error);
    const message = error?.message || 'Unable to prepare your check-in badge. Please try again.';
    showMessage(message, 'error');
  } finally {
    setBadgeBusy(false);
  }
}

function isModalOpen() {
  const modal = getModal();
  return Boolean(modal && modal.style.display !== 'none');
}

function openBadgeModal() {
  if (!appState.currentAdmin || !appState.currentAdmin.uid) {
    showMessage('Sign in to access your check-in badge.', 'error');
    return;
  }
  setModalVisibility(true);
  clearExpiryTimer();
  updateModalFieldsFromState();
  prepareBadge();
}

function closeBadgeModal() {
  clearExpiryTimer();
  setModalVisibility(false);
}

function refreshBadgeManually() {
  if (isBusy) return;
  const orgCode = getCurrentOrgCode();
  if (orgCode) {
    badgeCache.delete(orgCode);
  }
  prepareBadge({ forceRefresh: true });
}

function downloadBadgeImage() {
  const canvas = document.getElementById('checkInBadgeCanvas');
  if (!canvas) {
    showMessage('Open your check-in badge first.', 'info');
    return;
  }
  if (!lastIssuedPayload) {
    showMessage('Generate a fresh badge to download.', 'info');
    return;
  }

  const filenameParts = ['nexolink-checkin-badge'];
  if (appState.currentOrgCode) {
    filenameParts.push(String(appState.currentOrgCode).toLowerCase());
  }
  const filename = `${filenameParts.join('-')}.png`;

  const triggerDownload = (url, cleanup) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (typeof cleanup === 'function') {
      cleanup();
    }
  };

  if (typeof canvas.toBlob === 'function') {
    canvas.toBlob((blob) => {
      if (!blob) {
        showMessage('Unable to download the badge right now. Please try again.', 'error');
        return;
      }
      const url = URL.createObjectURL(blob);
      triggerDownload(url, () => URL.revokeObjectURL(url));
    }, 'image/png');
    return;
  }

  const dataUrl = canvas.toDataURL('image/png');
  if (!dataUrl) {
    showMessage('Unable to download the badge right now. Please try again.', 'error');
    return;
  }
  triggerDownload(dataUrl);
}

function handleOverlayClick(event) {
  if (event.target === getModal()) {
    closeBadgeModal();
  }
}

function handleKeyDown(event) {
  if (event.key === 'Escape' && isModalOpen()) {
    closeBadgeModal();
  }
}

export function initCheckInBadge() {
  const trigger = getTrigger();
  const modal = getModal();
  if (!trigger || !modal) {
    return;
  }
  if (!initialized) {
    trigger.addEventListener('click', openBadgeModal);
    modal.addEventListener('click', handleOverlayClick);
    const closeBtn = modal.querySelector('[data-action="close-badge-modal"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeBadgeModal);
    }
    const refreshBtn = document.getElementById('refreshCheckInBadgeBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.addEventListener('click', refreshBadgeManually);
      refreshBtn.dataset.bound = 'true';
    }
    const downloadBtn = document.getElementById('downloadCheckInBadgeBtn');
    if (downloadBtn && !downloadBtn.dataset.bound) {
      downloadBtn.addEventListener('click', downloadBadgeImage);
      downloadBtn.dataset.bound = 'true';
    }
    document.addEventListener('keydown', handleKeyDown);
    initialized = true;
  }
  setBadgeBusy(false);
  setTriggerState();
  lastIssuedPayload = null;
  clearExpiryTimer();
  updateModalFieldsFromState();
  updateDownloadButtonState();
  updateRefreshButtonState();
}

export function refreshCheckInBadge() {
  setTriggerState();
  updateModalFieldsFromState();
  updateRefreshButtonState();
  if (!appState.currentAdmin || !appState.currentAdmin.uid) {
    if (isModalOpen()) {
      closeBadgeModal();
    }
    return;
  }
  if (isModalOpen()) {
    clearExpiryTimer();
    prepareBadge();
  }
}
