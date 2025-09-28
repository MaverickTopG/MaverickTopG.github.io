import { appState } from './state.js';
import { showMessage } from './ui.js';
import { db, storage } from './firebase.js';
import { doc, onSnapshot, setDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js';

const VERIFICATION_SECTION_ID = 'verificationSection';
const COLLECTION = 'organization_verifications';
const DEFAULT_VERIFICATION = {
  status: 'pending',
  lastSubmittedAt: null,
  lastReviewedAt: null,
  reviewerNotes: [],
  documents: []
};

export function initVerificationModule() {
  renderVerification();
  bindVerificationHandlers();
}

export function subscribeToVerification() {
  detachVerificationListener();

  if (!appState.currentOrgCode) {
    resetVerificationState();
    renderVerification();
    return;
  }

  const docRef = doc(db, COLLECTION, appState.currentOrgCode);

  appState.verificationUnsub = onSnapshot(docRef, async (snapshot) => {
    if (!snapshot.exists()) {
      await setDoc(docRef, {
        ...DEFAULT_VERIFICATION,
        organizationCode: appState.currentOrgCode,
        createdAt: serverTimestamp(),
        timeline: []
      }, { merge: true });
      return;
    }

    const data = snapshot.data() || {};
    hydrateVerificationState(data);
    renderVerification();
  }, (error) => {
    console.error('Verification listener error:', error);
    showMessage('Unable to load verification status right now.', 'error');
    resetVerificationState();
    renderVerification();
  });
}

export function detachVerificationListener() {
  if (appState.verificationUnsub) {
    try { appState.verificationUnsub(); } catch (error) { console.warn('verificationUnsub error', error); }
    appState.verificationUnsub = null;
  }
}

function hydrateVerificationState(data) {
  const convert = (value) => {
    if (!value) return null;
    if (typeof value.toDate === 'function') {
      return value.toDate().toISOString();
    }
    if (typeof value === 'number') {
      return new Date(value).toISOString();
    }
    if (typeof value === 'string') {
      return value;
    }
    try {
      return new Date(value).toISOString();
    } catch (error) {
      return null;
    }
  };

  const documents = (data.documents || []).map((doc) => ({
    ...doc,
    uploadedAt: convert(doc.uploadedAt)
  }));

  const reviewerNotes = (data.reviewerNotes || []).map((note) => ({
    ...note,
    at: convert(note.at)
  }));

  const timeline = (data.timeline || []).map((entry) => ({
    ...entry,
    at: convert(entry.at)
  })).sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));

  appState.verification = {
    status: data.status || 'pending',
    lastSubmittedAt: convert(data.lastSubmittedAt),
    lastReviewedAt: convert(data.lastReviewedAt),
    reviewerNotes,
    documents
  };

  appState.verificationTimeline = timeline;
}

function resetVerificationState() {
  appState.verification = { ...DEFAULT_VERIFICATION };
  appState.verificationTimeline = [];
}

function bindVerificationHandlers() {
  const section = getSection();
  if (!section) return;

  section.addEventListener('change', async (event) => {
    const target = event.target;
    if (target.matches('#verificationUpload')) {
      await handleDocumentUpload(target.files);
      target.value = '';
    }
  });

  section.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.matches('[data-action="submit-verification"]')) {
      await handleSubmitForReview();
      return;
    }

    if (button.matches('[data-action="remove-doc"]')) {
      const index = Number(button.dataset.index);
      await removeDocument(index);
      return;
    }

    if (button.matches('[data-action="review-approve"]')) {
      await handleReviewerAction('approve');
      return;
    }

    if (button.matches('[data-action="review-request"]')) {
      await handleReviewerAction('changes-requested');
      return;
    }

    if (button.matches('[data-action="review-reset"]')) {
      await handleReviewerAction('pending');
    }
  });
}

async function ensureVerificationDoc() {
  if (!appState.currentOrgCode) return null;
  const docRef = doc(db, COLLECTION, appState.currentOrgCode);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) {
    await setDoc(docRef, {
      ...DEFAULT_VERIFICATION,
      organizationCode: appState.currentOrgCode,
      createdAt: serverTimestamp(),
      timeline: []
    }, { merge: true });
  }
  return docRef;
}

async function handleDocumentUpload(fileList) {
  if (!fileList || !fileList.length) return;

  if (!appState.currentAdmin) {
    showMessage('Sign in to upload verification documents.', 'error');
    return;
  }

  const docRef = await ensureVerificationDoc();
  if (!docRef) return;

  const uploads = Array.from(fileList).map(async (file) => {
    const storagePath = `orgVerification/${appState.currentOrgCode}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    const uploadedAt = new Date().toISOString();
    const documentEntry = {
      name: file.name,
      size: file.size,
      contentType: file.type || 'application/octet-stream',
      storagePath,
      url,
      uploadedAt,
      uploadedBy: {
        uid: appState.currentAdmin.uid || '',
        email: appState.currentAdmin.email || ''
      }
    };

    const timelineEntry = {
      type: 'upload',
      message: `${file.name} uploaded`,
      at: uploadedAt,
      by: appState.currentAdmin.email || 'Admin'
    };

    const draftStatuses = ['pending', 'documents-submitted', 'changes-requested'];
    const updatePayload = {
      documents: arrayUnion(documentEntry),
      timeline: arrayUnion(timelineEntry)
    };

    if (draftStatuses.includes(appState.verification.status)) {
      updatePayload.status = 'documents-submitted';
    }

    await updateDoc(docRef, updatePayload);
  });

  try {
    await Promise.all(uploads);
    showMessage('Verification documents uploaded.', 'success');
  } catch (error) {
    console.error('Upload failed:', error);
    showMessage('Failed to upload one or more documents.', 'error');
  }
}

async function removeDocument(index) {
  const docRef = await ensureVerificationDoc();
  if (!docRef) return;

  const documentEntry = appState.verification.documents[index];
  if (!documentEntry) {
    showMessage('Document not found.', 'error');
    return;
  }

  try {
    const currentAdmin = appState.currentAdmin || {};

    await updateDoc(docRef, {
      documents: arrayRemove(documentEntry),
      timeline: arrayUnion({
        type: 'remove',
        message: `Removed ${documentEntry.name}`,
        at: new Date().toISOString(),
        by: currentAdmin.email || 'Admin'
      })
    });

    if (documentEntry.storagePath) {
      try {
        await deleteObject(ref(storage, documentEntry.storagePath));
      } catch (storageError) {
        console.warn('Storage delete failed', storageError);
      }
    }

    showMessage('Document removed from packet.', 'info');
  } catch (error) {
    console.error('Remove document failed:', error);
    showMessage('Could not remove document right now.', 'error');
  }
}

async function handleSubmitForReview() {
  if (!appState.currentOrgCode) {
    showMessage('Sign in to submit verification.', 'error');
    return;
  }

  if (!appState.verification.documents.length) {
    showMessage('Upload at least one document before submitting.', 'error');
    return;
  }

  const docRef = await ensureVerificationDoc();
  if (!docRef) return;

  const submittedAt = new Date().toISOString();

  try {
    const currentAdmin = appState.currentAdmin || {};

    await updateDoc(docRef, {
      status: 'in-review',
      lastSubmittedAt: serverTimestamp(),
      timeline: arrayUnion({
        type: 'submitted',
        message: 'Verification packet submitted for review.',
        at: submittedAt,
        by: currentAdmin.email || 'Admin'
      })
    });

    showMessage('Verification submitted. A reviewer will take a look shortly.', 'success');
  } catch (error) {
    console.error('Submit verification failed:', error);
    showMessage('Unable to submit verification right now.', 'error');
  }
}

async function handleReviewerAction(nextStatus) {
  const currentAdmin = appState.currentAdmin || {};
  const currentRole = (currentAdmin.role || '').toLowerCase();
  if (currentRole !== 'super-admin') {
    showMessage('Only super-admins can update verification status.', 'error');
    return;
  }

  const docRef = await ensureVerificationDoc();
  if (!docRef) return;

  let note = '';
  if (nextStatus === 'changes-requested') {
    note = window.prompt('Let the organization know what needs to change.') || '';
    if (!note.trim()) {
      showMessage('Please provide details before requesting changes.', 'error');
      return;
    }
  }

  if (nextStatus === 'pending') {
    note = window.prompt('Optional: share why the packet is being reset (optional).') || '';
  }

  const statusMessages = {
    approved: 'Verification approved.',
    'changes-requested': 'Changes requested by reviewer.',
    pending: 'Verification reset to draft.'
  };

  const reviewerNote = {
    at: new Date().toISOString(),
    reviewer: {
      uid: currentAdmin.uid || '',
      email: currentAdmin.email || ''
    },
    status: nextStatus,
    note
  };

  try {
    await updateDoc(docRef, {
      status: nextStatus,
      lastReviewedAt: serverTimestamp(),
      reviewerNotes: arrayUnion(reviewerNote),
      timeline: arrayUnion({
        type: 'status-change',
        message: statusMessages[nextStatus] || 'Verification status updated.',
        at: reviewerNote.at,
        by: reviewerNote.reviewer.email || 'Reviewer'
      })
    });

    showMessage('Verification status updated.', 'success');
  } catch (error) {
    console.error('Reviewer update failed:', error);
    showMessage('Unable to update verification status.', 'error');
  }
}

function getSection() {
  return document.getElementById(VERIFICATION_SECTION_ID);
}

function renderVerification() {
  const section = getSection();
  if (!section) return;

  const { status, documents, lastSubmittedAt, reviewerNotes } = appState.verification;
  const statusCopy = {
    pending: { label: 'Not Submitted', description: 'Upload required documents to start the verification process.' },
    'documents-submitted': { label: 'Draft', description: 'Documents attached. Submit when you are ready for a human review.' },
    'in-review': { label: 'In Review', description: 'A compliance reviewer is evaluating your documentation.' },
    approved: { label: 'Approved', description: 'Organization verified. Partners will see your trusted badge.' },
    'changes-requested': { label: 'Changes Requested', description: 'Reviewer flagged items that need attention before approval.' }
  };

  const currentStatus = statusCopy[status] || statusCopy.pending;
  const submitDisabled = !documents.length || status === 'in-review';
  const onboardingTip = `
    <div class="onboarding-tip">
      <i class="fas fa-lightbulb"></i>
      <div>Collect your nonprofit documentation here. Once submitted, our reviewers will keep the status and notes updated in this panel.</div>
    </div>
  `;

  const reviewerControls = renderReviewerControls(status);

  section.innerHTML = `
    <div class="card-block">
      <div class="section-header">
        <h3><i class="fas fa-shield-check"></i> Organization Verification</h3>
        <span class="status-pill status-${status}">${currentStatus.label}</span>
      </div>
      <p class="section-description">${currentStatus.description}</p>
      ${onboardingTip}
      <div class="verification-grid">
        <div class="verification-box">
          <h4>Verification Packet</h4>
          <p class="subtle-text">Upload proof of nonprofit status, liability coverage, and leadership identification.</p>
          <label class="upload-tile">
            <input type="file" id="verificationUpload" accept="application/pdf,image/*" multiple hidden>
            <i class="fas fa-cloud-upload-alt"></i>
            <span>Upload Documents</span>
          </label>
          ${documents.length ? renderDocumentList(documents) : '<div class="empty-state">No documents attached yet. Upload files to build your packet.</div>'}
        </div>
        <div class="verification-box">
          <h4>Timeline</h4>
          ${renderTimeline()}
          ${renderReviewerNotes(reviewerNotes)}
        </div>
      </div>
      <div class="verification-footer">
        <div class="last-update">${lastSubmittedAt ? `Last submitted ${new Date(lastSubmittedAt).toLocaleString()}` : 'Not submitted yet.'}</div>
        <div class="verification-actions">
          <button class="btn-outline" data-action="submit-verification" ${submitDisabled ? 'disabled' : ''}>Submit for Review</button>
        </div>
      </div>
      ${reviewerControls}
    </div>
  `;
}

function renderDocumentList(documents) {
  return `
    <ul class="document-list">
      ${documents.map((doc, index) => `
        <li>
          <div>
            <strong>${doc.name}</strong>
            <span>${formatFileSize(doc.size)} | ${doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString() : 'N/A'}</span>
            ${doc.url ? `<a href="${doc.url}" target="_blank" rel="noopener" class="subtle-text">View document</a>` : ''}
          </div>
          <button class="btn-icon" data-action="remove-doc" data-index="${index}" title="Remove">
            <i class="fas fa-times"></i>
          </button>
        </li>
      `).join('')}
    </ul>
  `;
}

function renderTimeline() {
  if (!appState.verificationTimeline.length) {
    return '<div class="empty-state">No activity yet. Upload a document or submit for review to build your timeline.</div>';
  }

  return `
    <ul class="timeline">
      ${appState.verificationTimeline.slice().reverse().map((item) => `
        <li>
          <span class="timeline-dot"></span>
          <div>
            <p>${item.message}</p>
            <time>${item.at ? new Date(item.at).toLocaleString() : ''}${item.by ? ` | ${item.by}` : ''}</time>
          </div>
        </li>
      `).join('')}
    </ul>
  `;
}

function renderReviewerNotes(notes) {
  if (!Array.isArray(notes) || !notes.length) return '';

  return `
    <div class="reviewer-notes">
      <h5>Reviewer Notes</h5>
      <ul>
        ${notes.slice().reverse().map((note) => `
          <li>
            <strong>${note.status === 'changes-requested' ? 'Changes Requested' : note.status === 'approved' ? 'Approved' : 'Note'}</strong>
            <span>${note.at ? new Date(note.at).toLocaleString() : ''}${note.reviewer && note.reviewer.email ? ` | ${note.reviewer.email}` : ''}</span>
            ${note.note ? `<p>${note.note}</p>` : ''}
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

function renderReviewerControls(status) {
  const currentAdmin = appState.currentAdmin || {};
  const isReviewer = (currentAdmin.role || '').toLowerCase() === 'super-admin';
  if (!isReviewer) return '';

  const disabledApprove = status === 'approved';
  const disabledRequest = status === 'changes-requested';

  return `
    <div class="reviewer-controls">
      <h4><i class="fas fa-user-check"></i> Reviewer Actions</h4>
      <div class="reviewer-buttons">
        <button class="btn-success" data-action="review-approve" ${disabledApprove ? 'disabled' : ''}>Mark Approved</button>
        <button class="btn-outline" data-action="review-request" ${disabledRequest ? 'disabled' : ''}>Request Changes</button>
        <button class="btn-outline" data-action="review-reset">Reset to Draft</button>
      </div>
    </div>
  `;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}