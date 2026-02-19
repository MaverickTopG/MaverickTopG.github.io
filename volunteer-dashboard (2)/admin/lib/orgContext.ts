import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type Firestore,
  type WhereFilterOp,
  type QueryConstraint,
  onSnapshot,
} from 'firebase/firestore';

export type OrgContext = {
  orgId: string | null;
  orgCode: string | null;
  orgName: string | null;
  planTier: string | null;
};

export type OrgAdmins = {
  adminIds: string[];
  adminEmails: string[];
};

type OrgRecord = {
  orgId: string | null;
  orgCode: string | null;
  orgName: string | null;
  planTier: string | null;
};

const ORG_CODE_FIELDS = [
  'accessCode',
  'access_code',
  'org_access_code',
  'orgCode',
  'org_code',
  'organizationCode',
  'organization_code',
];

const ORG_ID_FIELDS = [
  'organizationId',
  'organization_id',
  'orgId',
  'org_id',
  'linked_org_id',
  'linkedOrgId',
];

const ORG_NAME_FIELDS = [
  'organizationName',
  'organization_name',
  'orgName',
  'org_name',
  'name',
  'schoolName',
  'school_name',
];

const PLAN_TIER_FIELDS = ['plan_tier', 'planTier', 'tier', 'plan_key', 'planKey'];
const SUBADMIN_SESSION_STORAGE_KEY = 'nexolink_active_sub_admin_session';
const GROUP_SCOPE_FIELDS = ['target_group_id', 'targetGroupId', 'sub_admin_group_id', 'subAdminGroupId', 'groupId', 'group_id'];
const GROUP_SCOPED_COLLECTIONS = new Set([
  'organization_join_requests',
  'user_organizations',
  'volunteer_logs',
  'kiosk_sessions',
]);

export type ActiveSubAdminSession = {
  subAdminId: string;
  email?: string;
  displayName?: string;
  groupId: string;
  groupName?: string;
  startedAt?: unknown;
};

const normalizeOrgRecord = (data: Record<string, unknown>, docId?: string): OrgRecord => {
  const orgId = (ORG_ID_FIELDS.map((field) => data[field] as string | undefined).find(Boolean) || docId || null);
  const orgCode = (ORG_CODE_FIELDS.map((field) => data[field] as string | undefined).find(Boolean) || null);
  const orgName = (ORG_NAME_FIELDS.map((field) => data[field] as string | undefined).find(Boolean) || null);
  const planTier = (PLAN_TIER_FIELDS.map((field) => data[field] as string | undefined).find(Boolean) || null);
  return {
    orgId: orgId ? String(orgId) : null,
    orgCode: orgCode ? String(orgCode) : null,
    orgName: orgName ? String(orgName) : null,
    planTier: planTier ? String(planTier).toLowerCase() : null,
  };
};

const normalizeOrgCode = (value: string | null) => (value ? String(value).trim().toUpperCase() : null);
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeGroupScope = (value: unknown) => String(value || '').trim();

export const getActiveSubAdminSession = (): ActiveSubAdminSession | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SUBADMIN_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveSubAdminSession;
    if (!parsed?.groupId) return null;
    return parsed;
  } catch (error) {
    return null;
  }
};

const resolveRecordGroupScope = (data: Record<string, unknown>) => {
  for (const field of GROUP_SCOPE_FIELDS) {
    const value = normalizeGroupScope(data[field]);
    if (value) return value;
  }
  return '';
};

const shouldApplyGroupScope = (collectionName: string) => GROUP_SCOPED_COLLECTIONS.has(collectionName);

const filterRowsBySubAdminScope = (
  collectionName: string,
  rows: Array<{ id: string; data: Record<string, unknown> }>,
) => {
  const session = getActiveSubAdminSession();
  if (!session?.groupId) return rows;
  if (!shouldApplyGroupScope(collectionName)) return rows;
  const targetGroupId = normalizeGroupScope(session.groupId);
  if (!targetGroupId) return rows;
  return rows.filter((row) => resolveRecordGroupScope(row.data) === targetGroupId);
};

const resolveOrgRecordById = async (db: Firestore, collectionName: string, orgId: string) => {
  try {
    const snap = await getDoc(doc(db, collectionName, orgId));
    if (!snap.exists()) return null;
    return normalizeOrgRecord(snap.data() as Record<string, unknown>, snap.id);
  } catch (error) {
    console.warn(`Unable to resolve org by id from ${collectionName}`, error);
    return null;
  }
};

const resolveOrgRecordByCode = async (db: Firestore, collectionName: string, orgCode: string) => {
  for (const field of ORG_CODE_FIELDS) {
    try {
      const snap = await getDocs(query(collection(db, collectionName), where(field, '==', orgCode)));
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        return normalizeOrgRecord(docSnap.data() as Record<string, unknown>, docSnap.id);
      }
    } catch (error) {
      console.warn(`Unable to resolve org by code from ${collectionName}`, error);
    }
  }
  return null;
};

const pickBestOrgRecord = (records: OrgRecord[]) => {
  if (!records.length) return null;
  return records.sort((a, b) => {
    const score = (record: OrgRecord) => 
      (record.orgId ? 4 : 0) + 
      (record.orgCode ? 4 : 0) + 
      (record.orgName ? 2 : 0) + 
      (record.planTier ? 10 : 0); // Heavily weight records with plan tier info
    return score(b) - score(a);
  })[0];
};

export const resolveOrgContext = async (db: Firestore, userId: string, userEmail?: string | null): Promise<OrgContext> => {
  let orgId: string | null = null;
  let orgCode: string | null = null;
  let orgName: string | null = null;
  let planTier: string | null = null;

  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    const data = (userSnap.data() || {}) as Record<string, unknown>;
    const record = normalizeOrgRecord(data, userSnap.id);
    orgId = record.orgId || orgId;
    orgCode = record.orgCode || orgCode;
    orgName = record.orgName || orgName;
    planTier = record.planTier || planTier;
  } catch (error) {
    console.warn('Unable to resolve org from users doc', error);
  }

  try {
    const orgSnap = await getDocs(query(collection(db, 'user_organizations'), where('user_id', '==', userId)));
    if (!orgSnap.empty) {
      const records = orgSnap.docs.map((docSnap) => normalizeOrgRecord(docSnap.data() as Record<string, unknown>, docSnap.id));
      const best = pickBestOrgRecord(records);
      orgId = best?.orgId || orgId;
      orgCode = best?.orgCode || orgCode;
      orgName = best?.orgName || orgName;
      planTier = best?.planTier || planTier;
    }
  } catch (error) {
    console.warn('Unable to resolve org from user_organizations', error);
  }

  if (!orgCode || !orgId) {
    const orgSources = ['volunteer_organizations', 'organizations', 'orgs'];
    for (const collectionName of orgSources) {
      if (!orgId) {
        try {
          const ownerFields = ['admin_id', 'owner_uid', 'user_id', 'created_by'];
          for (const field of ownerFields) {
            const snap = await getDocs(query(collection(db, collectionName), where(field, '==', userId)));
            if (!snap.empty) {
              const record = normalizeOrgRecord(snap.docs[0].data() as Record<string, unknown>, snap.docs[0].id);
              orgId = record.orgId || orgId;
              orgCode = record.orgCode || orgCode;
              orgName = record.orgName || orgName;
              planTier = record.planTier || planTier;
              break;
            }
          }
        } catch (error) {
          console.warn(`Unable to resolve org from ${collectionName}`, error);
        }
      }
      if (!orgId && orgCode) {
        const record = await resolveOrgRecordByCode(db, collectionName, orgCode);
        if (record) {
          orgId = record.orgId || orgId;
          orgCode = record.orgCode || orgCode;
          orgName = record.orgName || orgName;
          planTier = record.planTier || planTier;
        }
      }
      if (orgId) {
        const record = await resolveOrgRecordById(db, collectionName, orgId);
        if (record) {
          orgId = record.orgId || orgId;
          orgCode = record.orgCode || orgCode;
          orgName = record.orgName || orgName;
          planTier = record.planTier || planTier;
        }
      }
      if (orgId || orgCode) break;
    }
  }

  orgCode = normalizeOrgCode(orgCode);

  return {
    orgId,
    orgCode,
    orgName,
    planTier,
  };
};

const ADMIN_ID_FIELDS = ['admin_id', 'owner_uid', 'user_id', 'created_by', 'adminId', 'ownerId'];
const ADMIN_EMAIL_FIELDS = ['admin_email', 'owner_email', 'created_by_email', 'email', 'ownerEmail', 'adminEmail'];

const extractAdminIdentifiers = (data: Record<string, unknown>) => {
  const adminIds = ADMIN_ID_FIELDS.map((field) => data[field]).filter(Boolean).map((value) => String(value));
  const adminEmails = ADMIN_EMAIL_FIELDS.map((field) => data[field]).filter(Boolean).map(normalizeEmail).filter(Boolean);
  return { adminIds, adminEmails };
};

export const resolveOrgAdmins = async (
  db: Firestore,
  orgId?: string | null,
  orgCode?: string | null,
): Promise<OrgAdmins> => {
  const adminIds = new Set<string>();
  const adminEmails = new Set<string>();
  const orgSources = ['volunteer_organizations', 'organizations', 'orgs'];

  for (const collectionName of orgSources) {
    if (orgId) {
      const record = await resolveOrgRecordById(db, collectionName, orgId);
      if (record?.orgId) {
        const snap = await getDoc(doc(db, collectionName, record.orgId));
        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          const extracted = extractAdminIdentifiers(data);
          extracted.adminIds.forEach((id) => adminIds.add(id));
          extracted.adminEmails.forEach((email) => adminEmails.add(email));
        }
      }
    }
    if (orgCode) {
      const record = await resolveOrgRecordByCode(db, collectionName, orgCode);
      if (record?.orgId) {
        const snap = await getDoc(doc(db, collectionName, record.orgId));
        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          const extracted = extractAdminIdentifiers(data);
          extracted.adminIds.forEach((id) => adminIds.add(id));
          extracted.adminEmails.forEach((email) => adminEmails.add(email));
        }
      }
    }
  }

  return {
    adminIds: Array.from(adminIds),
    adminEmails: Array.from(adminEmails),
  };
};

export type OrgSubscriptionOptions = {
  db: Firestore;
  collectionName: string;
  orgCode?: string | null;
  orgId?: string | null;
  codeFields?: string[];
  idFields?: string[];
  filters?: Array<[string, WhereFilterOp, unknown]>;
  onData: (rows: Array<{ id: string; data: Record<string, unknown> }>) => void;
  onError?: (error: unknown) => void;
};

export const subscribeToOrgCollection = (options: OrgSubscriptionOptions) => {
  const {
    db,
    collectionName,
    orgCode,
    orgId,
    codeFields = ORG_CODE_FIELDS,
    idFields = ORG_ID_FIELDS,
    filters = [],
    onData,
    onError,
  } = options;

  const listeners: Array<() => void> = [];
  const maps = new Map<string, Map<string, Record<string, unknown>>>();

  const updateCombined = () => {
    const combined = new Map<string, Record<string, unknown>>();
    maps.forEach((map) => {
      map.forEach((value, key) => {
        combined.set(key, value);
      });
    });
    const rows = Array.from(combined.entries()).map(([id, data]) => ({ id, data }));
    onData(filterRowsBySubAdminScope(collectionName, rows));
  };

  const buildConstraints = () =>
    filters.map(([field, op, value]) => where(field, op, value) as QueryConstraint);

  const subscribe = (key: string, queryRef: ReturnType<typeof query>) => {
    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) => {
        const map = new Map<string, Record<string, unknown>>();
        snapshot.forEach((docSnap) => {
          map.set(docSnap.id, docSnap.data() as Record<string, unknown>);
        });
        maps.set(key, map);
        updateCombined();
      },
      (error) => {
        console.warn('Org collection listener failed', error);
        onError?.(error);
      },
    );
    listeners.push(unsubscribe);
  };

  if (orgCode) {
    const codeValues = Array.from(
      new Set([String(orgCode), String(orgCode).toLowerCase()]),
    );
    codeFields.forEach((field) => {
      codeValues.forEach((value) => {
        const q = query(collection(db, collectionName), where(field, '==', value), ...buildConstraints());
        subscribe(`code:${field}:${value}`, q);
      });
    });
  }

  if (orgId) {
    idFields.forEach((field) => {
      const q = query(collection(db, collectionName), where(field, '==', orgId), ...buildConstraints());
      subscribe(`id:${field}:${orgId}`, q);
    });
  }

  if (!orgCode && !orgId) {
    onData([]);
  }

  return () => {
    listeners.forEach((unsub) => unsub());
  };
};

export const fetchOrgCollectionDocs = async (
  db: Firestore,
  collectionName: string,
  orgCode: string | null,
  orgId: string | null,
  filters: Array<[string, WhereFilterOp, unknown]> = [],
) => {
  const results = new Map<string, Record<string, unknown>>();
  const buildConstraints = () => filters.map(([field, op, value]) => where(field, op, value) as QueryConstraint);

  const codeFields = ORG_CODE_FIELDS;
  const idFields = ORG_ID_FIELDS;

  if (orgCode) {
    const codeValues = Array.from(new Set([String(orgCode), String(orgCode).toLowerCase()]));
    for (const field of codeFields) {
      for (const value of codeValues) {
        const snap = await getDocs(query(collection(db, collectionName), where(field, '==', value), ...buildConstraints()));
        snap.forEach((docSnap) => {
          results.set(docSnap.id, docSnap.data() as Record<string, unknown>);
        });
      }
    }
  }

  if (orgId) {
    for (const field of idFields) {
      const snap = await getDocs(query(collection(db, collectionName), where(field, '==', orgId), ...buildConstraints()));
      snap.forEach((docSnap) => {
        results.set(docSnap.id, docSnap.data() as Record<string, unknown>);
      });
    }
  }

  const rows = Array.from(results.entries()).map(([id, data]) => ({ id, data }));
  return filterRowsBySubAdminScope(collectionName, rows);
};

export const getOrgCodeValue = (data: Record<string, unknown>) => {
  const code = ORG_CODE_FIELDS.map((field) => data[field] as string | undefined).find(Boolean);
  return normalizeOrgCode(code ? String(code) : null);
};
