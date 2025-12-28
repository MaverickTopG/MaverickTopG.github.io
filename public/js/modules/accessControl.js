const DEMO_ACCOUNTS = [
  {
    email: 'x@gmail.com',
    label: 'Demo Account',
    description: 'This shared login is for demos only. Billing is disabled.',
  },
];

const LEGACY_ACCESS_LOCK_TIMESTAMP = Date.UTC(2024, 10, 4, 0, 0, 0); // Nov 4, 2024 UTC

function normalizeEmail(value) {
  return (value || '').trim().toLowerCase();
}

function resolveEmail(target) {
  if (!target) return '';
  if (typeof target === 'string') return target;
  if (typeof target.email === 'string') return target.email;
  if (typeof target.emailNormalized === 'string') return target.emailNormalized;
  if (typeof target.userEmail === 'string') return target.userEmail;
  const claimsEmail = target?.claims?.email;
  return typeof claimsEmail === 'string' ? claimsEmail : '';
}

export function getDemoAccountConfig(target) {
  const normalized = normalizeEmail(resolveEmail(target));
  if (!normalized) return null;
  return DEMO_ACCOUNTS.find(
    (entry) => normalizeEmail(entry.email) === normalized,
  ) || null;
}

export function isDemoAccount(target) {
  return Boolean(getDemoAccountConfig(target));
}

export function getDemoAccountDescription(target) {
  return getDemoAccountConfig(target)?.description || null;
}

export function getDemoAccountLabel(target) {
  return getDemoAccountConfig(target)?.label || null;
}

export function shouldHonorLegacyPaidFlag(legacyPaid) {
  if (!legacyPaid) return false;
  return Date.now() < LEGACY_ACCESS_LOCK_TIMESTAMP;
}

export function hasLegacyAccessExpired() {
  return Date.now() >= LEGACY_ACCESS_LOCK_TIMESTAMP;
}

export const LEGACY_ACCESS_LOCK_DATE = new Date(LEGACY_ACCESS_LOCK_TIMESTAMP);

export function formatLegacyAccessDeadline() {
  return LEGACY_ACCESS_LOCK_DATE.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export const DEMO_ACCOUNT_BANNER_ID = 'demoAccountBanner';
