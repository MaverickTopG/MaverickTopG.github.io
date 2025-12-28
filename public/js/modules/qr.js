import { appState } from './state.js';

const QR_SOURCES = [
  { type: 'module', url: 'https://esm.run/qrcode@1.5.3' },
  { type: 'module', url: 'https://esm.sh/qrcode@1.5.3?target=es2020&no-check' },
];

const storageKeys = {
  orgName: 'nx_admin_org_name',
  orgCode: 'nx_admin_org_code',
  adminId: 'nx_admin_id',
};

let qrLibPromise = null;

function normalize(value) {
  return String(value || '').trim();
}

function normalizeOrgCode(value) {
  return normalize(value).toUpperCase();
}

function prefer(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
}

export function getOrgProfile() {
  const admin = appState.currentAdmin || {};
  return {
    orgName: prefer(admin.organizationName, admin.orgName, ''),
    orgCode: normalizeOrgCode(prefer(appState.currentOrgCode, admin.organizationCode, admin.organization_id, '')),
    adminId: prefer(admin.uid, admin.id, admin.email, admin.adminId, ''),
  };
}

export function cacheOrgProfile(profile = getOrgProfile()) {
  try {
    if (!profile) return;
    if (profile.orgName !== undefined) {
      localStorage.setItem(storageKeys.orgName, profile.orgName || '');
    }
    if (profile.orgCode !== undefined) {
      localStorage.setItem(storageKeys.orgCode, profile.orgCode || '');
    }
    if (profile.adminId !== undefined) {
      localStorage.setItem(storageKeys.adminId, profile.adminId || '');
    }
  } catch {
    // ignore storage failures (private mode or blocked)
  }
}

export function syncOrgProfileFromState() {
  const profile = getOrgProfile();
  cacheOrgProfile(profile);
  return profile;
}

export function loadCachedProfile() {
  try {
    return {
      orgName: localStorage.getItem(storageKeys.orgName) || '',
      orgCode: normalizeOrgCode(localStorage.getItem(storageKeys.orgCode) || ''),
      adminId: localStorage.getItem(storageKeys.adminId) || '',
    };
  } catch {
    return { orgName: '', orgCode: '', adminId: '' };
  }
}

async function ensureQrLib() {
  if (!qrLibPromise) {
    qrLibPromise = (async () => {
      let lastError = null;
      for (const source of QR_SOURCES) {
        try {
          if (source.type === 'module') {
            const imported = await import(source.url);
            const candidate = imported?.default || imported;
            if (candidate?.toCanvas) return candidate;
          }
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error('Unable to load QR library');
    })();
  }
  return qrLibPromise;
}

export function buildQrPayload(context = {}) {
  const profile = {
    ...getOrgProfile(),
    ...context,
  };
  const issuedAt = typeof context.issuedAt === 'number' ? context.issuedAt : Date.now();

  return {
    kind: 'nexolink-hours-qr',
    version: 1,
    orgName: profile.orgName || 'NexoLink',
    orgCode: normalizeOrgCode(profile.orgCode || 'ORG'),
    adminId: profile.adminId || '',
    hoursDownloadUrl: context.hoursDownloadUrl || null,
    issuedAt,
  };
}

export async function renderQrToCanvas(canvas, context = {}, options = {}) {
  if (!canvas) throw new Error('QR canvas target missing');
  const payload = buildQrPayload(context);
  const lib = await ensureQrLib();
  await lib.toCanvas(canvas, JSON.stringify(payload), {
    errorCorrectionLevel: 'M',
    margin: 1,
    color: {
      dark: options.darkColor || '#0f172a',
      light: options.lightColor || '#ffffff',
    },
    width: options.width || 320,
  });
  return payload;
}

export function downloadCanvasAsPng(canvas, orgCode = 'nexolink') {
  if (!canvas) throw new Error('No QR canvas available to download');
  const normalized = normalizeOrgCode(orgCode) || 'nexolink';
  const link = document.createElement('a');
  link.download = `${normalized}-qr.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function sanitizeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function deriveHoursFromState() {
  if (!Array.isArray(appState.activityData)) return [];
  return appState.activityData.map((log) => ({
    volunteer: prefer(log.volunteer_name, log.volunteer, log.name, 'Volunteer'),
    email: prefer(log.volunteer_email, log.email, ''),
    date: log.date || '',
    hours: Number(log.hours_contributed ?? log.hours ?? log.total_hours ?? 0) || 0,
    activity: prefer(log.site, log.task, log.campaign, log.event, 'Activity'),
  }));
}

export function downloadHoursCsv(entries = null, context = {}) {
  const data = Array.isArray(entries) && entries.length ? entries : deriveHoursFromState();
  const rows = data.length
    ? data
    : [
        {
          volunteer: 'Volunteer Name',
          email: 'email@example.com',
          date: new Date().toISOString().slice(0, 10),
          hours: 0,
          activity: 'Activity',
        },
      ];

  const header = ['Volunteer', 'Email', 'Date', 'Hours', 'Activity'];
  const csv = [
    header.join(','),
    ...rows.map((row) =>
      [
        sanitizeCsv(row.volunteer),
        sanitizeCsv(row.email),
        sanitizeCsv(row.date),
        sanitizeCsv(row.hours),
        sanitizeCsv(row.activity),
      ].join(','),
    ),
  ].join('\n');

  const orgCode = normalizeOrgCode(context.orgCode || getOrgProfile().orgCode || 'nexolink');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${orgCode || 'nexolink'}-hours.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);

  return { count: rows.length, filename: link.download };
}

export { storageKeys };
