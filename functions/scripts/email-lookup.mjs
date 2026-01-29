import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

const emailArg = process.argv[2];
if (!emailArg || !emailArg.includes('@')) {
  console.error('Usage: node functions/scripts/email-lookup.mjs <email>');
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID
  || process.env.GCLOUD_PROJECT
  || process.env.GOOGLE_CLOUD_PROJECT
  || undefined;

initializeApp({
  credential: applicationDefault(),
  projectId,
});

const db = getFirestore();

const queryCollection = async (collection, emails) => {
  const docs = [];
  for (const email of emails) {
    let lastDoc = null;
    while (true) {
      let query = db.collection(collection).where('email', '==', email).limit(200);
      if (lastDoc) query = query.startAfter(lastDoc);
      const snap = await query.get();
      if (snap.empty) break;
      snap.docs.forEach((doc) => {
        docs.push({ path: doc.ref.path, data: doc.data() });
      });
      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < 200) break;
    }
  }
  return { collection, docs };
};

const run = async () => {
  const emails = new Set([emailArg, emailArg.toLowerCase()]);
  const results = [];

  for (const collection of COLLECTIONS) {
    const result = await queryCollection(collection, emails);
    results.push(result);
  }

  let total = 0;
  results.forEach((item) => {
    total += item.docs.length;
    console.log(`\n${item.collection} (${item.docs.length})`);
    if (!item.docs.length) {
      console.log('  - none');
      return;
    }
    item.docs.forEach((doc) => {
      console.log(`  - ${doc.path}`);
      console.log(JSON.stringify(doc.data, null, 2));
    });
  });

  console.log(`\nTotal matches: ${total}`);
  console.log('Done.');
};

run().catch((error) => {
  console.error('Lookup failed:', error?.message || error);
  process.exitCode = 1;
});
