export type PlanTier = 'orbit' | 'nebula' | 'cosmos' | 'unknown';
export type MembershipSource = 'user_organizations' | 'users';

export type VolunteerMembership = {
  key: string;
  id: string;
  code: string;
  name: string;
  planTier: PlanTier;
  source: MembershipSource;
  docId: string;
};

const ORG_CODE_FIELDS = [
  'accessCode',
  'access_code',
  'organization_code',
  'orgCode',
  'org_code',
  'organizationCode',
  'org_access_code',
];

const ORG_ID_FIELDS = [
  'orgId',
  'org_id',
  'organizationId',
  'organization_id',
  'linked_org_id',
  'linkedOrgId',
];

const ORG_NAME_FIELDS = [
  'name',
  'org_name',
  'orgName',
  'organizationName',
  'organization_name',
  'schoolName',
  'school_name',
];

const PLAN_HINT_FIELDS = [
  'plan_tier',
  'planTier',
  'plan',
  'planKey',
  'plan_key',
  'subscription_plan_key',
  'subscriptionPlanKey',
  'pending_plan_tier',
  'pendingPlanTier',
  'tier',
];

const PRODUCT_HINT_FIELDS = [
  'product',
  'product_id',
  'productId',
  'products',
  'product_ids',
  'productIds',
  'subscription_products',
  'subscription_product_ids',
  'subscriptionProductIds',
  'subscriptionProducts',
];

const ORG_COLLECTIONS = ['organizations', 'orgs', 'volunteer_organizations', 'users'] as const;
const ORG_CODE_LOOKUP_FIELDS = [
  'accessCode',
  'access_code',
  'org_access_code',
  'orgCode',
  'org_code',
  'organizationCode',
  'organization_code',
  'email',
];

const planResolutionCache = new Map<string, PlanTier>();

const normalizeCode = (value: unknown) => String(value || '').trim().toUpperCase();
const normalizeText = (value: unknown) => String(value || '').trim();
const normalizeLower = (value: unknown) => String(value || '').trim().toLowerCase();

const isDeclinedJoinStatus = (status: string) =>
  ['rejected', 'declined', 'denied', 'canceled', 'cancelled', 'revoked', 'removed'].some((token) =>
    status.includes(token),
  );

const isArchivedMembershipRecord = (data: Record<string, unknown>) => {
  const status = normalizeLower(data.status);
  return Boolean(
    data.removed_by_user ||
      data.archived_by_user ||
      data.removed_at ||
      data.archived_at ||
      ['archived', 'inactive', 'revoked', 'deleted', 'removed'].some((token) => status.includes(token)),
  );
};

const isAcceptedMembershipStatus = (status: string) => {
  if (!status) return true;
  return ['active', 'accepted', 'approved', 'connected', 'granted', 'confirmed'].some((token) =>
    status.includes(token),
  );
};

const isPersonalRecord = (data: Record<string, unknown>, id: string, code: string, name: string) => {
  const rawId = id.toLowerCase();
  const rawCode = code.toLowerCase();
  const rawName = name.toLowerCase();
  return Boolean(
    data.is_personal ||
      rawId.startsWith('personal-') ||
      rawCode.startsWith('personal-') ||
      rawName === 'personal',
  );
};

const inferPlanTierFromHint = (value: unknown): PlanTier => {
  const hint = normalizeLower(value);
  if (!hint) return 'unknown';
  if (hint.includes('cosmos') || hint.includes('enterprise')) return 'cosmos';
  if (hint.includes('nebula') || hint.includes('pro')) return 'nebula';
  if (hint.includes('orbit') || hint.includes('basic') || hint.includes('free')) return 'orbit';
  return 'unknown';
};

const collectProductHints = (data: Record<string, unknown>) => {
  const hints: string[] = [];
  PRODUCT_HINT_FIELDS.forEach((field) => {
    const value = data[field];
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (!item) return;
        if (typeof item === 'string') {
          hints.push(item);
          return;
        }
        if (typeof item === 'object') {
          const record = item as Record<string, unknown>;
          if (record.product) hints.push(String(record.product));
          if (record.product_id) hints.push(String(record.product_id));
          if (record.price && typeof record.price === 'object') {
            const product = (record.price as Record<string, unknown>).product;
            if (product) hints.push(String(product));
          }
        }
      });
      return;
    }
    hints.push(String(value));
  });
  const metadata = (data.metadata || {}) as Record<string, unknown>;
  if (metadata.product) hints.push(String(metadata.product));
  if (metadata.product_id) hints.push(String(metadata.product_id));
  if (metadata.productId) hints.push(String(metadata.productId));
  return hints;
};

export const inferMembershipPlanTier = (data: Record<string, unknown>): PlanTier => {
  const metadata = (data.metadata || {}) as Record<string, unknown>;
  const subscription = (data.subscription || {}) as Record<string, unknown>;
  const candidates: unknown[] = [
    ...PLAN_HINT_FIELDS.map((field) => data[field]),
    ...PLAN_HINT_FIELDS.map((field) => metadata[field]),
    ...PLAN_HINT_FIELDS.map((field) => subscription[field]),
  ];

  for (const candidate of candidates) {
    const tier = inferPlanTierFromHint(candidate);
    if (tier !== 'unknown') return tier;
  }

  const productHints = collectProductHints(data);
  for (const hint of productHints) {
    const tier = inferPlanTierFromHint(hint);
    if (tier !== 'unknown') return tier;
  }

  return 'unknown';
};

export const hasPremiumFeaturesForTier = (tier: PlanTier) =>
  tier === 'nebula' || tier === 'cosmos';

export const hasPremiumAccessForMembership = (membership: VolunteerMembership) =>
  hasPremiumFeaturesForTier(membership.planTier)
  || membership.planTier === 'unknown';

const getPlanRank = (tier: PlanTier) => {
  if (tier === 'cosmos') return 3;
  if (tier === 'nebula') return 2;
  if (tier === 'orbit') return 1;
  return 0;
};

export const extractVolunteerMembership = (
  data: Record<string, unknown>,
  docId: string,
  source: MembershipSource,
): VolunteerMembership | null => {
  const code = normalizeCode(ORG_CODE_FIELDS.map((field) => data[field]).find(Boolean));
  const id = normalizeText(ORG_ID_FIELDS.map((field) => data[field]).find(Boolean) || docId);
  const name = normalizeText(ORG_NAME_FIELDS.map((field) => data[field]).find(Boolean) || code || 'Organization');
  const status = normalizeLower(data.status);

  if (isDeclinedJoinStatus(status)) return null;
  if (!isAcceptedMembershipStatus(status)) return null;
  if (isArchivedMembershipRecord(data)) return null;
  if (isPersonalRecord(data, id, code, name)) return null;
  if (!id && !code) return null;

  const planTier = inferMembershipPlanTier(data);
  return {
    key: code || id || `${source}:${docId}`,
    id,
    code,
    name,
    planTier,
    source,
    docId,
  };
};

export const mergeVolunteerMemberships = (memberships: VolunteerMembership[]) => {
  const merged = new Map<string, VolunteerMembership>();
  memberships.forEach((membership) => {
    const existing = merged.get(membership.key);
    if (!existing) {
      merged.set(membership.key, membership);
      return;
    }
    const existingRank = getPlanRank(existing.planTier);
    const nextRank = getPlanRank(membership.planTier);
    if (nextRank > existingRank) {
      merged.set(membership.key, {
        ...existing,
        ...membership,
        name: membership.name || existing.name,
      });
      return;
    }
    if (nextRank === existingRank) {
      merged.set(membership.key, {
        ...existing,
        id: existing.id || membership.id,
        code: existing.code || membership.code,
        name: existing.name || membership.name,
      });
    }
  });

  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
};

type FirestoreLike = {
  collection: (...args: unknown[]) => unknown;
};

const getFirestoreFns = async () => {
  const module = await import('firebase/firestore');
  return {
    collection: module.collection,
    doc: module.doc,
    getDoc: module.getDoc,
    getDocs: module.getDocs,
    query: module.query,
    where: module.where,
    limit: module.limit,
  };
};

const normalizeCacheKeys = (membership: VolunteerMembership) => {
  const keys = new Set<string>();
  if (membership.key) keys.add(`key:${membership.key}`);
  if (membership.id) keys.add(`id:${membership.id}`);
  if (membership.code) keys.add(`code:${membership.code.toUpperCase()}`);
  return Array.from(keys);
};

const readPlanFromOrgDoc = (data: Record<string, unknown>) => inferMembershipPlanTier(data);

const resolvePlanTierFromOrgSources = async (
  db: FirestoreLike,
  membership: VolunteerMembership,
): Promise<PlanTier> => {
  const { collection, doc, getDoc, getDocs, query, where, limit } = await getFirestoreFns();

  if (membership.id) {
    for (const collName of ORG_COLLECTIONS) {
      try {
        const snap = await getDoc(doc(db as any, collName, membership.id));
        if (!snap.exists()) continue;
        const tier = readPlanFromOrgDoc((snap.data() || {}) as Record<string, unknown>);
        if (tier !== 'unknown') return tier;
      } catch {
        // ignore and continue
      }
    }
  }

  if (membership.code) {
    const codeValues = Array.from(
      new Set([String(membership.code).toUpperCase(), String(membership.code).toLowerCase()]),
    );
    for (const collName of ORG_COLLECTIONS) {
      for (const field of ORG_CODE_LOOKUP_FIELDS) {
        for (const codeValue of codeValues) {
          try {
            const snap = await getDocs(
              query(collection(db as any, collName), where(field, '==', codeValue), limit(1)),
            );
            if (snap.empty) continue;
            const tier = readPlanFromOrgDoc((snap.docs[0].data() || {}) as Record<string, unknown>);
            if (tier !== 'unknown') return tier;
          } catch {
            // ignore and continue
          }
        }
      }
    }
  }

  return 'unknown';
};

export const hydrateVolunteerMembershipPlans = async (
  db: FirestoreLike,
  memberships: VolunteerMembership[],
) => {
  const resolved = await Promise.all(
    memberships.map(async (membership) => {
      if (hasPremiumFeaturesForTier(membership.planTier)) return membership;

      const cacheKeys = normalizeCacheKeys(membership);
      const cached = cacheKeys
        .map((key) => planResolutionCache.get(key))
        .find((tier): tier is PlanTier => Boolean(tier && tier !== 'unknown'));
      if (cached) {
        return { ...membership, planTier: cached };
      }

      const resolvedTier = await resolvePlanTierFromOrgSources(db, membership);
      if (resolvedTier !== 'unknown') {
        cacheKeys.forEach((key) => planResolutionCache.set(key, resolvedTier));
        return { ...membership, planTier: resolvedTier };
      }

      return membership;
    }),
  );

  return mergeVolunteerMemberships(resolved);
};
