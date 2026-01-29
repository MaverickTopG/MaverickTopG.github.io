import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const EMAIL = 'teens@beltilibrary.org';
const COLLECTIONS = [
  'badges',
  'organization_join_requests',
  'organization_settings',
  'organization_shared_logs',
  'organizations',
  'orgs',
  'pendingSubscriptions',
  'stripe_events',
  'stripe_handoff',
  'user_organizations',
  'users',
  'volunteer_funfacts',
  'volunteer_logs',
  'volunteer_organizations',
];

const projectId = process.env.FIREBASE_PROJECT_ID
  || process.env.GCLOUD_PROJECT
  || process.env.GOOGLE_CLOUD_PROJECT
  || undefined;

initializeApp({
  credential: applicationDefault(),
  projectId,
});

const db = getFirestore();
const auth = getAuth();

const deleteEmailDocs = async (collectionName, emails) => {
  let deleted = 0;
  for (const email of emails) {
    while (true) {
      const snap = await db.collection(collectionName).where('email', '==', email).limit(200).get();
      if (snap.empty) break;
      await Promise.all(snap.docs.map((doc) => doc.ref.delete()));
      deleted += snap.size;
      if (snap.size < 200) break;
    }
  }
  return deleted;
};

const run = async () => {
  const emails = new Set([EMAIL, EMAIL.toLowerCase()]);
  const results = {};
  let total = 0;

  for (const collection of COLLECTIONS) {
    try {
      const count = await deleteEmailDocs(collection, emails);
      results[collection] = count;
      total += count;
    } catch (error) {
      results[collection] = 0;
      console.error(`[purge] Failed in ${collection}:`, error?.message || error);
    }
  }

  let authDeleted = false;
  try {
    const userRecord = await auth.getUserByEmail(EMAIL);
    await auth.deleteUser(userRecord.uid);
    authDeleted = true;
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') {
      console.error('[purge] Failed to delete auth user:', error?.message || error);
    }
  }

  console.log('Summary:', { totalDeleted: total, perCollection: results, authDeleted });
  console.log('Done.');
};

run().catch((error) => {
  console.error('Purge failed:', error?.message || error);
  process.exitCode = 1;
});
