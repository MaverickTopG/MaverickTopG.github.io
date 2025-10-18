import { appState } from './state.js';
import { auth } from './firebase.js';
import { showMessage } from './ui.js';

let initialized = false;
let qrLibPromise = null;
let currentDataUrl = '';
let isBusy = false;

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

function formatBadgeStatus() {
  if (!lastIssuedPayload) {
    return 'Ready to scan.';
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const exp = typeof lastIssuedPayload.exp === 'number' ? lastIssuedPayload.exp : null;
  const issuedAt = typeof lastIssuedPayload.issuedAt === 'number' ? lastIssuedPayload.issuedAt : null;

  if (exp && nowSec >= exp) {
    return 'Expired — refresh the QR badge.';
  }

  if (exp) {
    const remaining = Math.max(0, exp - nowSec);
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    const secLabel = seconds.toString().padStart(2, '0');
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
  const downloadBtn = document.getElementById('downloadCheckInBadge');
  if (downloadBtn) {
    downloadBtn.disabled = !currentDataUrl || isBusy;
  }
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

function setBadgeBusy(state) {
  isBusy = state;
  const modal = getModal();
  if (modal) {
    modal.classList.toggle('loading', state);
    modal.setAttribute('aria-busy', state ? 'true' : 'false');
  }
  const rotateBtn = document.getElementById('rotateCheckInToken');
  if (rotateBtn) {
    rotateBtn.disabled = state;
  }
  const downloadBtn = document.getElementById('downloadCheckInBadge');
  if (downloadBtn) {
    downloadBtn.disabled = state || !currentDataUrl;
  }
}

async function requestSignedBadge({ rotate = false } = {}) {
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
      rotate: rotate || undefined,
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
  currentDataUrl = canvas.toDataURL('image/png');
}

async function prepareBadge({ rotate = false } = {}) {
  if (isBusy) {
    return;
  }
  if (!appState.currentAdmin || !appState.currentAdmin.uid) {
    showMessage('Sign in to access your check-in badge.', 'error');
    return;
  }

  setBadgeBusy(true);
  try {
    const { payload, sig } = await requestSignedBadge({ rotate });
    const orgAccessCode = String(payload?.orgAccessCode || '').trim().toUpperCase();
    const adminId = String(payload?.adminId || '').trim();
    const qrPayload = {
      ...payload,
      sig,
      orgId: orgAccessCode,
      qrToken: sig,
      qrVersion: payload?.v,
      qrIssuedAt: payload?.issuedAt,
      qrExpiresAt: payload?.exp,
      adminId,
      orgAccessCode,
    };
    lastIssuedPayload = qrPayload;
    await renderQr(JSON.stringify(qrPayload));
    updateModalFieldsFromState();
    if (isModalOpen()) {
      startExpiryTimer();
    } else {
      updateBadgeNote();
    }
    if (rotate) {
      showMessage('Check-in badge refreshed.', 'success');
    }
  } catch (error) {
    console.error('Unable to prepare check-in badge', error);
    const message = error?.message || 'Unable to prepare your check-in badge. Please try again.';
    showMessage(message, 'error');
  } finally {
    setBadgeBusy(false);
  }
}

function handleDownload() {
  if (!currentDataUrl) {
    showMessage('QR code is still generating. Please try again in a moment.', 'info');
    return;
  }
  const { adminId } = getIdentifiers();
  const link = document.createElement('a');
  link.href = currentDataUrl;
  link.download = `nexolink-checkin-${adminId || 'badge'}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function handleRotate() {
  clearExpiryTimer();
  prepareBadge({ rotate: true });
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
    const downloadBtn = document.getElementById('downloadCheckInBadge');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', handleDownload);
    }
    const rotateBtn = document.getElementById('rotateCheckInToken');
    if (rotateBtn) {
      rotateBtn.addEventListener('click', handleRotate);
    }
    document.addEventListener('keydown', handleKeyDown);
    initialized = true;
  }
  currentDataUrl = '';
  setBadgeBusy(false);
  setTriggerState();
  lastIssuedPayload = null;
  clearExpiryTimer();
  updateModalFieldsFromState();
}

export function refreshCheckInBadge() {
  setTriggerState();
  updateModalFieldsFromState();
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
