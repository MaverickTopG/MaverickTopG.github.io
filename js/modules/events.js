import { db, auth } from './firebase.js';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  runTransaction,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { appState } from './state.js';
import { showMessage, triggerListAnimation } from './ui.js';
import { setActiveView } from './dashboard.js';

let eventsUpdateHandler = () => {};
let editingEventId = null;
let currentDraftId = null;
let currentDetailEventId = null;
const DAY_LABELS = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  unspecified: 'Date specific',
};
const DAY_FALLBACK = [{ value: 'unspecified', label: 'Date specific' }];

function generateSlotId() {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatSlotTimeLabel(raw) {
  if (!raw) return '';
  const [hourStr, minuteStr] = String(raw).split(':');
  const hours = Number(hourStr);
  const minutes = Number(minuteStr || 0);
  if (!Number.isFinite(hours)) return raw;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function buildSlotFallbackLabel(slot = {}, index = 0) {
  const dayLabel = slot.day ? DAY_LABELS[slot.day] || capitalize(slot.day) : '';
  const start = formatSlotTimeLabel(slot.startTime || slot.start);
  const end = formatSlotTimeLabel(slot.endTime || slot.end);
  const windowLabel = start && end ? `${start} – ${end}` : start || end || '';
  const parts = [dayLabel, windowLabel].filter(Boolean);
  return parts.length ? parts.join(' • ') : `Slot ${index + 1}`;
}

export function registerEventsUpdateHandler(handler) {
  eventsUpdateHandler = typeof handler === 'function' ? handler : () => {};
}

export function notifyEventsUpdate() {
  if (typeof eventsUpdateHandler === 'function') {
    eventsUpdateHandler();
  }
  renderDraftsList();
  refreshEventDetail();
}

export function initEventsView() {
  const form = document.getElementById('eventCreateForm');
  const toggleBtn = document.getElementById('eventToggleFormBtn');
  const slotsContainer = document.getElementById('eventTimeSlots');
  const addSlotBtn = document.getElementById('eventAddSlotBtn');
  const draftsBtn = document.getElementById('eventDraftsBtn');
  const draftsCloseBtn = document.getElementById('eventDraftsCloseBtn');
  const draftsPanel = document.getElementById('eventDraftsPanel');
  if (form && !form.dataset.bound) {
    form.addEventListener('submit', handleEventSubmit);
    form.dataset.bound = 'true';
    form.addEventListener('input', markFormDirty, { passive: true });
    form.addEventListener('change', markFormDirty, { passive: true });
    form.dataset.dirty = 'false';
  }

  const resetBtn = document.getElementById('eventResetBtn');
  if (resetBtn && !resetBtn.dataset.bound) {
    resetBtn.addEventListener('click', (event) => {
      event.preventDefault();
      resetEventForm({ collapse: false });
    });
    resetBtn.dataset.bound = 'true';
  }

  const saveDraftBtn = document.getElementById('eventSaveDraftBtn');
  if (saveDraftBtn && !saveDraftBtn.dataset.bound) {
    saveDraftBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      await handleSaveDraftClick(saveDraftBtn);
    });
    saveDraftBtn.dataset.bound = 'true';
  }

  document.querySelectorAll('[data-event-day]').forEach((btn) => {
    if (!btn.dataset.bound) {
      btn.addEventListener('click', () => {
        toggleSelectable(btn, 'is-active');
        updateSlotDayOptions();
      });
      btn.dataset.bound = 'true';
    }
  });

  document.querySelectorAll('[data-event-cause]').forEach((btn) => {
    if (!btn.dataset.bound) {
      btn.addEventListener('click', () => handleCauseChipClick(btn));
      btn.dataset.bound = 'true';
    }
  });

  if (toggleBtn && !toggleBtn.dataset.bound) {
    toggleBtn.addEventListener('click', () => toggleEventFormVisibility());
    toggleBtn.dataset.bound = 'true';
    toggleBtn.setAttribute('aria-expanded', 'false');
  }

  if (draftsBtn && !draftsBtn.dataset.bound) {
    draftsBtn.addEventListener('click', openDraftsPanel);
    draftsBtn.dataset.bound = 'true';
  }

  if (draftsCloseBtn && !draftsCloseBtn.dataset.bound) {
    draftsCloseBtn.addEventListener('click', closeDraftsPanel);
    draftsCloseBtn.dataset.bound = 'true';
  }

  if (draftsPanel && !draftsPanel.dataset.bound) {
    draftsPanel.addEventListener('click', (event) => {
      if (event.target === draftsPanel) {
        closeDraftsPanel();
      }
    });
    draftsPanel.dataset.bound = 'true';
  }

  const detailBackBtn = document.getElementById('eventDetailBackBtn');
  if (detailBackBtn && !detailBackBtn.dataset.bound) {
    detailBackBtn.addEventListener('click', (event) => {
      event.preventDefault();
      closeEventDetail();
    });
    detailBackBtn.dataset.bound = 'true';
  }

  if (!document.body.dataset.eventDetailEsc) {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeEventDetail();
      }
    });
    document.body.dataset.eventDetailEsc = 'true';
  }

  if (form) {
    form.classList.add('is-collapsed');
    toggleEventFormVisibility(false, { skipDraft: true, skipReset: true });
  }

  if (slotsContainer && !slotsContainer.dataset.ready) {
    renderSlotRows();
    slotsContainer.dataset.ready = 'true';
  }

  if (addSlotBtn && !addSlotBtn.dataset.bound) {
    addSlotBtn.addEventListener('click', () => addSlotRow());
    addSlotBtn.dataset.bound = 'true';
  }

  closeEventDetail();
}

export function resetEventsListener() {
  if (appState.eventsUnsub) {
    try {
      appState.eventsUnsub();
    } catch (error) {
      console.warn('eventsUnsub error', error);
    }
    appState.eventsUnsub = null;
  }
}

export function resetEventSlotRequestsListener() {
  if (appState.eventSlotRequestsUnsub) {
    try {
      appState.eventSlotRequestsUnsub();
    } catch (error) {
      console.warn('eventSlotRequestsUnsub error', error);
    }
    appState.eventSlotRequestsUnsub = null;
  }
}

export function resetEventSignupsListener() {
  if (appState.eventSignupsUnsub) {
    try {
      appState.eventSignupsUnsub();
    } catch (error) {
      console.warn('eventSignupsUnsub error', error);
    }
    appState.eventSignupsUnsub = null;
  }
}

export function loadEventSlotRequests() {
  resetEventSlotRequestsListener();

  if (!appState.currentOrgCode) {
    appState.eventSlotRequests = {};
    notifyEventsUpdate();
    return;
  }

  const orgCode = String(appState.currentOrgCode || '').toUpperCase();
  if (!orgCode) {
    appState.eventSlotRequests = {};
    notifyEventsUpdate();
    return;
  }

  const requestsQuery = query(
    collection(db, 'event_slot_requests'),
    where('organizationCode', '==', orgCode)
  );

  appState.eventSlotRequestsUnsub = onSnapshot(
    requestsQuery,
    (snapshot) => {
      const byEvent = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const status = (data.status || 'pending').toString().toLowerCase();
        if (status !== 'pending') return;
        const eventId = data.eventId || data.event_id || null;
        if (!eventId) return;

        const slotIndexRaw = data.slotIndex ?? data.slot_index ?? null;
        const slotIndex = Number.isInteger(slotIndexRaw)
          ? slotIndexRaw
          : (slotIndexRaw != null && Number.isFinite(Number(slotIndexRaw)))
            ? Number(slotIndexRaw)
            : null;
        const requestedAt = data.requestedAt || data.requested_at || data.createdAt || data.created_at || null;

        const request = {
          id: docSnap.id,
          eventId,
          slotIndex,
          slotId: data.slotId || data.slot_id || null,
          slotLabel: data.slotLabel || data.slot_label || '',
          signupId: data.signupId || data.signup_id || null,
          volunteerName: data.volunteerName || data.volunteer_name || data.displayName || data.name || data.volunteer || 'Volunteer',
          volunteerEmail: data.volunteerEmail || data.volunteer_email || data.email || '',
          message: data.message || data.note || '',
          requestedAt,
          requestedAtLabel: requestedAt ? formatTimestampLabel(requestedAt) : '',
          status,
        };

        if (!Array.isArray(byEvent[eventId])) {
          byEvent[eventId] = [];
        }
        byEvent[eventId].push(request);
      });

      Object.values(byEvent).forEach((requests = []) => {
        requests.sort((a, b) => (toMillis(b.requestedAt) || 0) - (toMillis(a.requestedAt) || 0));
      });

      appState.eventSlotRequests = byEvent;
      notifyEventsUpdate();
    },
    (error) => {
      console.error('event slot requests onSnapshot error:', error);
      showMessage(`Error loading volunteer slot requests: ${error.message || error}`, 'error');
    }
  );
}

export function loadEventSignups() {
  resetEventSignupsListener();

  if (!appState.currentOrgCode) {
    appState.eventSignups = {};
    notifyEventsUpdate();
    return;
  }

  const orgCode = String(appState.currentOrgCode || '').toUpperCase();
  if (!orgCode) {
    appState.eventSignups = {};
    notifyEventsUpdate();
    return;
  }

  const signupsQuery = query(
    collection(db, 'event_signups'),
    where('organizationCode', '==', orgCode)
  );

  appState.eventSignupsUnsub = onSnapshot(
    signupsQuery,
    (snapshot) => {
      const byEvent = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const eventId = data.eventId || data.event_id || null;
        if (!eventId) return;
        const record = {
          id: docSnap.id,
          eventId,
          slotId: data.slotId || data.slot_id || null,
          slotLabel: data.slotLabel || data.slot_label || '',
          volunteerId: data.volunteerId || data.volunteer_id || null,
          volunteerEmail: data.volunteerEmail || data.volunteer_email || '',
          volunteerName: data.volunteerName || data.volunteer_name || '',
          status: (data.status || 'pending').toString().toLowerCase(),
          createdAt: data.createdAt || data.created_at || null,
        };
        if (!Array.isArray(byEvent[eventId])) {
          byEvent[eventId] = [];
        }
        byEvent[eventId].push(record);
      });

      Object.values(byEvent).forEach((records = []) => {
        records.sort((a, b) => (toMillis(a.createdAt) || 0) - (toMillis(b.createdAt) || 0));
      });

      appState.eventSignups = byEvent;
      notifyEventsUpdate();
    },
    (error) => {
      console.error('event signups onSnapshot error:', error);
      showMessage(`Error loading volunteer signups: ${error.message || error}`, 'error');
    }
  );
}

export function loadEvents() {
  resetEventsListener();

  if (!appState.currentOrgCode) {
    appState.events = [];
    appState.eventDrafts = [];
    appState.eventSlotRequests = {};
    appState.eventSignups = {};
    resetEventSlotRequestsListener();
    resetEventSignupsListener();
    notifyEventsUpdate();
    return;
  }

  const eventsQuery = query(
    collection(db, 'events'),
    where('organizationCode', '==', appState.currentOrgCode)
  );

  appState.eventsUnsub = onSnapshot(
    eventsQuery,
    (snapshot) => {
      const events = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        events.push({
          id: docSnap.id,
          ...normalizeEventData(data),
        });
      });

      events.sort((a, b) => compareByDateKey(a, b));

      const published = [];
      const drafts = [];
      events.forEach((event) => {
        const status = (event.status || 'published').toLowerCase();
        if (status === 'draft') {
          drafts.push(event);
        } else if (status !== 'archived') {
          published.push(event);
        }
      });

      drafts.sort((a, b) => compareByUpdatedAt(b, a));

      autoArchiveExpiredEvents(published);

      appState.events = published;
      appState.eventDrafts = drafts;
      notifyEventsUpdate();
    },
    (error) => {
      console.error('events onSnapshot error:', error);
      showMessage(`Error loading events: ${error.message || error}`, 'error');
    }
  );

  loadEventSlotRequests();
  loadEventSignups();
}

export function displayEvents() {
  const list = document.getElementById('eventsList');
  if (!list) return;

  const listCard = document.getElementById('eventsListCard');
  const events = Array.isArray(appState.events) ? appState.events : [];

  if (!events.length) {
    list.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-calendar-plus"></i>
        <h3>No events yet</h3>
        <p>Create your first opportunity to help volunteers find their next shift.</p>
      </div>
    `;
    if (listCard) listCard.hidden = true;
    closeEventDetail();
    return;
  }

  const today = startOfToday();
  const activeEvents = events.filter((event) => isEventActive(event, today));
  const activeIds = new Set(activeEvents.map((event) => event.id));
  const remainingEvents = events.filter((event) => !activeIds.has(event.id));
  const displayed = activeEvents.length ? [...activeEvents, ...remainingEvents] : events;

  if (listCard) listCard.hidden = false;

  const cards = displayed.map((event, index) => {
    const dateRange = formatDateRange(event.startDate, event.endDate);
    const daysLabel = formatDaysLabel(event.days);
    const locationLabel = formatLocation(event);
    const contactLabel = formatContact(event);
    const overview = truncateText(event.overview || '', 260);
    const causes = Array.isArray(event.causes) ? event.causes : [];
    const status = (event.status || 'published').toLowerCase();
    const slotChips = renderEventSlots(event);
    const totalSlots = Array.isArray(event.timeSlots) ? event.timeSlots.length : 0;
    const perSlotValue = Number.isFinite(event.peoplePerSlot) ? Number(event.peoplePerSlot) : null;
    const openSlotsLabel = Number.isFinite(event.capacity)
      ? `${Math.max(Number(event.capacity) - Number(event.spotsTaken || 0), 0)} open / ${event.capacity} spots`
      : '';
    const slotCountLabel = totalSlots > 1 ? `${totalSlots} time slots` : '';
    const totalCapacityLabel = formatCapacity(event.capacity);

    const metaChipEntries = [
      dateRange ? `<span class="event-meta-chip"><i class="fas fa-calendar-day"></i>${escapeHtml(dateRange)}</span>` : '',
      daysLabel ? `<span class="event-meta-chip"><i class="fas fa-sync-alt"></i>${escapeHtml(daysLabel)}</span>` : '',
      slotCountLabel ? `<span class="event-meta-chip"><i class="fas fa-layer-group"></i>${escapeHtml(slotCountLabel)}</span>` : '',
      totalCapacityLabel ? `<span class="event-meta-chip"><i class="fas fa-user-friends"></i>${escapeHtml(totalCapacityLabel)}</span>` : '',
      openSlotsLabel ? `<span class="event-meta-chip"><i class="fas fa-door-open"></i>${escapeHtml(openSlotsLabel)}</span>` : '',
      perSlotValue != null ? `<span class="event-meta-chip"><i class="fas fa-users"></i>${escapeHtml(`${perSlotValue} per slot`)}</span>` : '',
    ];

    if (Array.isArray(slotChips) && slotChips.length) {
      metaChipEntries.push(...slotChips);
    }

    const metaChips = metaChipEntries.filter(Boolean).join('');

    const cardVariant = (index % 3) + 1;
    const pendingRequests = Array.isArray((appState.eventSlotRequests || {})[event.id])
      ? appState.eventSlotRequests[event.id].filter((request) => {
          const status = (request.status || request.state || 'pending').toString().toLowerCase();
          return status === 'pending';
        }).length
      : 0;

    const frequencyPill = event.frequency
      ? `<span class="event-frequency-pill">
          <i class="fas fa-arrows-rotate"></i>
          ${escapeHtml(formatFrequency(event.frequency))}
        </span>`
      : '';

    const pendingChip = pendingRequests > 0
      ? `<span class="event-pending-chip"><i class="fas fa-user-clock"></i>${pendingRequests} pending</span>`
      : '';

    const causesMarkup = causes.length
      ? `<div class="event-card-causes">${causes.map((cause) => `<span class="event-cause-pill">${escapeHtml(cause)}</span>`).join('')}</div>`
      : '';

    return `
      <article class="event-card event-card-variant-${cardVariant}${status === 'archived' ? ' event-card-archived' : ''}" data-event-id="${event.id}">
        <div class="event-card-header">
          <div>
            <h3 class="event-card-title">${escapeHtml(event.title || 'Untitled Event')}</h3>
            ${event.subtitle ? `<p class="event-card-subtitle">${escapeHtml(event.subtitle)}</p>` : ''}
          </div>
          <div class="event-card-header-meta">
            ${frequencyPill}
            ${pendingChip}
            ${status === 'archived' ? '<span class="event-status-pill"><i class="fas fa-ban"></i> Taken down</span>' : ''}
          </div>
        </div>
        <div class="event-card-body">
          ${overview ? `<p>${escapeHtml(overview)}</p>` : '<p>No overview provided yet.</p>'}
        </div>
        <div class="event-card-footer">
          <div class="event-card-footer-meta">
            ${locationLabel ? `<span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(locationLabel)}</span>` : '<span><i class="fas fa-map-marker-alt"></i> Location TBA</span>'}
            ${contactLabel ? `<span><i class="fas fa-envelope"></i> ${escapeHtml(contactLabel)}</span>` : ''}
          </div>
          <div class="event-card-actions">
            <button class="btn-tertiary btn-compact event-edit-btn" type="button" data-event-edit="${event.id}">
              <i class="fas fa-pen"></i>
              <span>Edit</span>
            </button>
            <button class="btn-outline btn-compact event-takedown-btn" type="button" data-event-takedown="${event.id}">
              <i class="fas fa-user-slash"></i>
              <span>Take Down</span>
            </button>
          </div>
        </div>
        ${metaChips ? `<div class="event-card-meta">${metaChips}</div>` : ''}
        ${causesMarkup}
      </article>
    `;
  }).join('');

  list.innerHTML = cards;
  triggerListAnimation('#eventsList .event-card');
  bindEventCardActions(displayed);
}

function openDraftsPanel() {
  const panel = document.getElementById('eventDraftsPanel');
  if (!panel) return;
  panel.hidden = false;
  renderDraftsList();
}

function closeDraftsPanel() {
  const panel = document.getElementById('eventDraftsPanel');
  if (!panel) return;
  panel.hidden = true;
}

function renderDraftsList() {
  const list = document.getElementById('eventDraftsList');
  if (!list) return;
  const drafts = Array.isArray(appState.eventDrafts) ? appState.eventDrafts : [];

  if (!drafts.length) {
    list.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-clipboard-list"></i>
        <h3>No drafts yet</h3>
        <p>Start a new event and hide the form to save your progress.</p>
      </div>
    `;
    return;
  }

  const cards = drafts.map(renderDraftCard).join('');
  list.innerHTML = cards;

  const map = new Map(drafts.map((draft) => [draft.id, draft]));

  list.querySelectorAll('[data-draft-resume]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const draft = map.get(btn.dataset.draftResume);
      if (draft) {
        beginEditEvent(draft);
        closeDraftsPanel();
      }
    });
  });

  list.querySelectorAll('[data-draft-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const draftId = btn.dataset.draftDelete;
      if (!draftId) return;
      const confirmDelete = window.confirm('Delete this draft? This cannot be undone.');
      if (!confirmDelete) return;
      try {
        await deleteDoc(doc(db, 'events', draftId));
        showMessage('Draft removed.', 'success');
        if (currentDraftId === draftId || editingEventId === draftId) {
          resetEventForm({ collapse: false });
        }
      } catch (error) {
        console.error('Draft deletion failed', error);
        showMessage('Unable to delete draft. Please try again.', 'error');
      }
    });
  });
}

function renderDraftCard(draft) {
  const dateRange = formatDateRange(draft.startDate, draft.endDate);
  const { slotLabel } = formatSlotSummary(draft.timeSlots);
  const lastUpdated = formatTimestampLabel(draft.updatedAt || draft.createdAt);
  const title = draft.title || 'Untitled draft';
  const totalSlots = Array.isArray(draft.timeSlots) ? draft.timeSlots.length : 0;
  const perSlot = Number.isFinite(draft.peoplePerSlot) ? draft.peoplePerSlot : null;
  const frequencyLabel = draft.frequency ? formatFrequency(draft.frequency) : '';
  const metaChips = [
    dateRange ? `<span><i class="fas fa-calendar-day"></i> ${escapeHtml(dateRange)}</span>` : '',
    slotLabel ? `<span><i class="fas fa-clock"></i> ${escapeHtml(slotLabel)}</span>` : '',
    frequencyLabel ? `<span><i class="fas fa-sync"></i> ${escapeHtml(frequencyLabel)}</span>` : '',
    draft.days && draft.days.length ? `<span><i class="fas fa-sync"></i> ${escapeHtml(formatDaysLabel(draft.days))}</span>` : '',
    totalSlots > 0 ? `<span><i class="fas fa-layer-group"></i> ${escapeHtml(`${totalSlots} slot${totalSlots === 1 ? '' : 's'}`)}</span>` : '',
    perSlot != null ? `<span><i class="fas fa-users"></i> ${escapeHtml(`${perSlot} per slot`)}</span>` : '',
  ].filter(Boolean).join('');

  return `
    <article class="draft-card" data-draft-id="${draft.id}">
      <header>
        <div>
          <h3 class="draft-card-title">${escapeHtml(title)}</h3>
          <p class="draft-card-meta">Last updated ${escapeHtml(lastUpdated)}</p>
        </div>
        <div class="draft-card-actions">
          <button type="button" class="btn-primary" data-draft-resume="${draft.id}"><i class="fas fa-edit"></i> Resume</button>
          <button type="button" class="btn-outline" data-draft-delete="${draft.id}"><i class="fas fa-trash"></i> Delete</button>
        </div>
      </header>
      ${metaChips ? `<div class="draft-card-meta">${metaChips}</div>` : ''}
      ${draft.overview ? `<p>${escapeHtml(truncateText(draft.overview, 160))}</p>` : '<p>No description yet.</p>'}
    </article>
  `;
}

function renderEventSlots(event) {
  const slots = Array.isArray(event.timeSlots) ? event.timeSlots : [];
  return slots.map((slot, index) => {
    const dayLabel = slot.day ? DAY_LABELS[slot.day] || capitalize(slot.day) : '';
    const start = formatTime(slot.startTime || '');
    const end = formatTime(slot.endTime || '');
    const windowLabel = start && end ? `${start} – ${end}` : start || end || 'Time TBD';
    const parts = [
      slot.label || '',
      dayLabel,
      windowLabel,
    ].filter(Boolean);
    const label = parts.length ? parts.join(' • ') : windowLabel;
    return `<span class="event-meta-chip event-slot-chip">${escapeHtml(label)}</span>`;
  });
}

function buildSlotLookup(slots = []) {
  const lookup = new Map();
  slots.forEach((slot) => {
    if (!slot) return;
    const slotId = slot.id || slot.slotId || null;
    if (slotId) lookup.set(slotId, slot);
    if (slot.label) lookup.set(slot.label, slot);
  });
  return lookup;
}

function groupSignupsBySlot(event, signups = [], statuses = ['accepted']) {
  const slots = Array.isArray(event.timeSlots) ? event.timeSlots : [];
  const lookup = buildSlotLookup(slots);
  const buckets = new Map();

  signups.forEach((signup) => {
    if (!signup) return;
    const status = String(signup.status || 'pending').toLowerCase();
    if (!statuses.includes(status)) return;
    const key = signup.slotId || signup.slotLabel || `slot-${signup.id}`;
    const slot = lookup.get(key) || null;
    const fallbackLabel = slot ? (slot.label || buildSlotFallbackLabel(slot, 0)) : (signup.slotLabel || key);
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        slot,
        label: fallbackLabel,
        volunteers: [],
      });
    }
    buckets.get(key).volunteers.push(signup);
  });

  return Array.from(buckets.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function renderEventDetail(eventData) {
  const detailPage = document.getElementById('eventDetailPage');
  const container = document.getElementById('eventDetailContent');
  const titleEl = document.getElementById('eventDetailTitle');
  if (!detailPage || !container || !eventData) return;

  if (titleEl) {
    titleEl.textContent = eventData.title || 'Event detail';
  }

  const slots = Array.isArray(eventData.timeSlots) ? eventData.timeSlots : [];
  const pendingRequests = Array.isArray((appState.eventSlotRequests || {})[eventData.id])
    ? appState.eventSlotRequests[eventData.id]
    : [];
  const signups = Array.isArray((appState.eventSignups || {})[eventData.id])
    ? appState.eventSignups[eventData.id]
    : [];

  const slotChips = renderEventSlots(eventData).join('');
  const dateRange = formatDateRange(eventData.startDate, eventData.endDate);
  const daysLabel = formatDaysLabel(eventData.days);
  const locationLabel = formatLocation(eventData);
  const contactLabel = formatContact(eventData);
  const capacityLabel = formatCapacity(eventData.capacity);
  const openSpotsLabel = Number.isFinite(eventData.capacity)
    ? `${Math.max(Number(eventData.capacity) - Number(eventData.spotsTaken || 0), 0)} open / ${eventData.capacity} spots`
    : '';
  const causeChips = Array.isArray(eventData.causes)
    ? eventData.causes.filter(Boolean).map((cause) => `<span class="event-meta-chip">${escapeHtml(cause)}</span>`).join('')
    : '';

  const acceptedGroups = groupSignupsBySlot(eventData, signups, ['accepted', 'confirmed']);
  const perSlotValue = Number.isFinite(eventData.peoplePerSlot) ? Number(eventData.peoplePerSlot) : null;

  const summaryMeta = [
    dateRange ? `<span class="event-meta-chip"><i class="fas fa-calendar-day"></i>${escapeHtml(dateRange)}</span>` : '',
    daysLabel ? `<span class="event-meta-chip"><i class="fas fa-sync-alt"></i>${escapeHtml(daysLabel)}</span>` : '',
    capacityLabel ? `<span class="event-meta-chip"><i class="fas fa-user-friends"></i>${escapeHtml(capacityLabel)}</span>` : '',
    openSpotsLabel ? `<span class="event-meta-chip"><i class="fas fa-door-open"></i>${escapeHtml(openSpotsLabel)}</span>` : '',
    slotChips,
    perSlotValue != null ? `<span class="event-meta-chip"><i class="fas fa-users"></i>${escapeHtml(`${perSlotValue} per slot`)}</span>` : '',
  ].filter(Boolean).join('');

  const slotDetailCards = slots.length
    ? slots.map((slot, index) => {
        const fallbackLabel = slot.label || buildSlotFallbackLabel(slot, index);
        const start = formatTime(slot.startTime || '');
        const end = formatTime(slot.endTime || '');
        const windowLabel = start && end ? `${start} – ${end}` : start || end || 'Time TBD';
        const slotKey = slot.id || slot.label || `slot-${index}`;
        const rosterInfo = acceptedGroups.find((group) => group.key === slotKey) || { volunteers: [] };
        const pendingForSlot = pendingRequests.filter((request) => {
          const requestKey = request.slotId || request.slotLabel;
          if (!requestKey) return false;
          if (slot.id && requestKey === slot.id) return true;
          if (slot.label && requestKey === slot.label) return true;
          return false;
        }).length;
        const capacity = Number.isFinite(slot.capacity)
          ? Number(slot.capacity)
          : (perSlotValue != null ? perSlotValue : null);
        const countParts = [];
        if (capacity != null) {
          countParts.push(`${rosterInfo.volunteers.length}/${capacity} confirmed`);
        } else {
          countParts.push(`${rosterInfo.volunteers.length} confirmed`);
        }
        if (pendingForSlot) {
          countParts.push(`${pendingForSlot} pending`);
        }
        const countLabel = countParts.join(' • ') || 'No volunteers yet';
        return `
          <div class="event-detail-slot-card">
            <div class="event-detail-slot-head">
              <div>
                <strong>${escapeHtml(fallbackLabel)}</strong>
                <span>${escapeHtml(windowLabel)}</span>
              </div>
              <span class="event-detail-slot-count">${escapeHtml(countLabel)}</span>
            </div>
          </div>
        `;
      }).join('')
    : '<p class="event-detail-empty">No time slots are configured for this event yet.</p>';

  const pendingMarkup = pendingRequests.length
    ? pendingRequests.map((request) => {
        const safeName = escapeHtml(request.volunteerName || 'Volunteer');
        const email = request.volunteerEmail || '';
        const safeEmail = escapeHtml(email);
        const emailMarkup = email
          ? `<a href="mailto:${encodeURIComponent(email)}" class="slot-request-email">${safeEmail}</a>`
          : '<span class="slot-request-email slot-request-email--muted">No email provided</span>';
        const slotSummary = describeSlotForRequest(eventData.id, request);
        const notes = request.message ? `<span>${escapeHtml(request.message)}</span>` : '';
        const requestedAt = request.requestedAtLabel ? `<span>${escapeHtml(request.requestedAtLabel)}</span>` : '';
        return `
          <div class="event-roster-card" data-slot-request="${request.id}">
            <strong>${safeName}</strong>
            ${emailMarkup}
            ${slotSummary ? `<span>${escapeHtml(slotSummary)}</span>` : ''}
            ${requestedAt}
            ${notes}
            <div class="event-roster-actions">
              <button type="button" class="btn-tertiary slot-request-action accept" data-slot-request-accept="${request.id}" data-slot-request-event="${eventData.id}"><i class="fas fa-check"></i> Accept</button>
              <button type="button" class="btn-outline slot-request-action decline" data-slot-request-decline="${request.id}" data-slot-request-event="${eventData.id}"><i class="fas fa-times"></i> Decline</button>
            </div>
          </div>
        `;
      }).join('')
    : '<p class="event-roster-empty">No pending requests.</p>';

  const acceptedMarkup = acceptedGroups.length
    ? acceptedGroups.map((group) => {
        const volunteerEntries = group.volunteers.map((volunteer) => {
          const statusLabel = (volunteer.status || 'accepted').charAt(0).toUpperCase() + (volunteer.status || 'accepted').slice(1);
          return `
            <div class="event-roster-card">
              <strong>${escapeHtml(volunteer.volunteerName || volunteer.volunteerEmail || 'Volunteer')}</strong>
              ${volunteer.volunteerEmail ? `<span>${escapeHtml(volunteer.volunteerEmail)}</span>` : ''}
              <span>Status: ${escapeHtml(statusLabel)}</span>
            </div>
          `;
        }).join('');
        return `
          <div class="event-roster-slot-group">
            <header>
              <h4>${escapeHtml(group.label)}</h4>
              <span>${group.volunteers.length} volunteer${group.volunteers.length === 1 ? '' : 's'}</span>
            </header>
            <div class="event-roster-list">${volunteerEntries}</div>
          </div>
        `;
      }).join('')
    : '<p class="event-roster-empty">No confirmed volunteers yet.</p>';

  const rosterPendingSection = `
    <div class="event-roster-group">
      <header>
        <h4>Pending approvals</h4>
        <span>${pendingRequests.length}</span>
      </header>
      <div class="event-roster-list">${pendingMarkup}</div>
    </div>
  `;

  const rosterAcceptedSection = `
    <div class="event-roster-group">
      <header>
        <h4>Confirmed volunteers</h4>
        <span>${acceptedGroups.reduce((total, group) => total + group.volunteers.length, 0)}</span>
      </header>
      <div class="event-roster-list">${acceptedMarkup}</div>
    </div>
  `;

  const summarySection = `
    <section class="event-detail-summary">
      <h3>${escapeHtml(eventData.title || 'Untitled Event')}</h3>
      ${eventData.subtitle ? `<p class="event-detail-overview">${escapeHtml(eventData.subtitle)}</p>` : ''}
      <div class="event-detail-meta">${summaryMeta}</div>
      ${causeChips ? `<div class="event-detail-meta">${causeChips}</div>` : ''}
      ${eventData.overview ? `<div class="event-detail-section"><h4>Overview</h4><p>${escapeHtml(eventData.overview)}</p></div>` : ''}
      ${locationLabel ? `<div class="event-detail-section"><h4>Location</h4><p>${escapeHtml(locationLabel)}</p></div>` : ''}
      ${contactLabel ? `<div class="event-detail-section"><h4>Contact</h4><p>${escapeHtml(contactLabel)}</p></div>` : ''}
    </section>
  `;

  const detailColumns = `
    <div class="event-detail-columns">
      <div class="event-detail-body">
        ${summarySection}
        <section class="event-detail-section">
          <h4>Time slots</h4>
          <div class="event-detail-slot-grid">${slotDetailCards}</div>
        </section>
        ${eventData.volunteerTasks ? `<section class="event-detail-section"><h4>Volunteer tasks</h4><p>${escapeHtml(eventData.volunteerTasks)}</p></section>` : ''}
        ${eventData.requirements ? `<section class="event-detail-section"><h4>Requirements</h4><p>${escapeHtml(eventData.requirements)}</p></section>` : ''}
        ${eventData.additionalNotes ? `<section class="event-detail-section"><h4>Additional notes</h4><p>${escapeHtml(eventData.additionalNotes)}</p></section>` : ''}
      </div>
      <aside class="event-detail-roster">
        <h3>Volunteer roster</h3>
        ${rosterPendingSection}
        ${rosterAcceptedSection}
      </aside>
    </div>
  `;

  container.innerHTML = detailColumns;
  detailPage.scrollTop = 0;
  detailPage.dataset.activeEventId = eventData.id || '';
  setActiveView('event-detail');
  if (typeof detailPage.closest === 'function') {
    const wrapper = detailPage.closest('.event-detail-wrapper');
    if (wrapper && typeof wrapper.scrollTo === 'function') {
      wrapper.scrollTo({ top: 0, behavior: 'auto' });
    }
  }
  attachSlotRequestHandlers();
}

function openEventDetail(eventId) {
  const eventData = findExistingEvent(eventId);
  if (!eventData) return;
  currentDetailEventId = eventId;
  renderEventDetail(eventData);
}

export function closeEventDetail(options = {}) {
  const { skipNavigation = false } = options;
  const detailPage = document.getElementById('eventDetailPage');
  const container = document.getElementById('eventDetailContent');
  if (detailPage) {
    detailPage.dataset.activeEventId = '';
  }
  if (container) {
    container.innerHTML = '';
  }
  currentDetailEventId = null;
  const detailView = document.getElementById('view-event-detail');
  if (!skipNavigation && detailView && detailView.classList.contains('active')) {
    setActiveView('events');
  }
}

function refreshEventDetail() {
  if (!currentDetailEventId) return;
  const eventData = findExistingEvent(currentDetailEventId);
  if (!eventData) {
    closeEventDetail();
    return;
  }
  renderEventDetail(eventData);
}

function bindEventCardActions(events = []) {
  const map = new Map(events.map((event) => [event.id, event]));

  document.querySelectorAll('[data-event-edit]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const eventId = btn.dataset.eventEdit;
      const eventData = map.get(eventId);
      if (eventData) beginEditEvent(eventData);
    });
  });

  document.querySelectorAll('[data-event-takedown]').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      event.stopPropagation();
      const eventId = btn.dataset.eventTakedown;
      const eventData = map.get(eventId);
      if (eventData) await handleEventTakedown(eventData);
    });
  });

  attachSlotRequestHandlers();

  document.querySelectorAll('.event-card').forEach((card) => {
    if (!card.dataset.eventId || card.dataset.detailBound === 'true') return;
    card.addEventListener('click', () => {
      openEventDetail(card.dataset.eventId);
    });
    card.dataset.detailBound = 'true';
  });
}

function attachSlotRequestHandlers() {
  document.querySelectorAll('[data-slot-request-accept]').forEach((btn) => {
    if (btn.dataset.slotHandlerBound === 'true') return;
    btn.addEventListener('click', async (event) => {
      event.stopPropagation();
      const requestId = btn.dataset.slotRequestAccept;
      if (requestId) {
        await handleSlotRequestAction(requestId, 'accept');
      }
    });
    btn.dataset.slotHandlerBound = 'true';
  });

  document.querySelectorAll('[data-slot-request-decline]').forEach((btn) => {
    if (btn.dataset.slotHandlerBound === 'true') return;
    btn.addEventListener('click', async (event) => {
      event.stopPropagation();
      const requestId = btn.dataset.slotRequestDecline;
      if (requestId) {
        await handleSlotRequestAction(requestId, 'decline');
      }
    });
    btn.dataset.slotHandlerBound = 'true';
  });
}

async function handleSlotRequestAction(requestId, action) {
  if (!requestId) return;
  const normalized = action === 'accept' ? 'accepted' : (action === 'decline' ? 'declined' : null);
  if (!normalized) return;

  const meta = findSlotRequestById(requestId);
  const slotDescription = meta ? describeSlotForRequest(meta.eventId, meta.request) : 'this slot';
  const volunteerName = meta ? (meta.request.volunteerName || 'Volunteer') : 'Volunteer';

  setSlotRequestProcessingState(requestId, true);

  try {
    const admin = appState.currentAdmin || {};
    const user = auth.currentUser;
    await updateDoc(doc(db, 'event_slot_requests', requestId), {
      status: normalized,
      decisionAt: serverTimestamp(),
      decisionBy: admin.uid || (user && user.uid) || null,
      decisionByEmail: admin.email || (user && user.email) || null,
    });

    if (meta && meta.request) {
      await updateSignupForRequest(meta.request, normalized);
    }

    const message = action === 'accept'
      ? `${volunteerName} approved for ${slotDescription}.`
      : `${volunteerName}'s request declined for ${slotDescription}.`;
    showMessage(message, action === 'accept' ? 'success' : 'info');
  } catch (error) {
    console.error('Slot request action failed', error);
    showMessage('Unable to update the volunteer request. Please try again.', 'error');
    setSlotRequestProcessingState(requestId, false);
    return;
  }

  setSlotRequestProcessingState(requestId, false);
}

function setSlotRequestProcessingState(requestId, processing) {
  const container = document.querySelector(`[data-slot-request="${requestId}"]`);
  if (!container) return;
  container.querySelectorAll('.slot-request-action').forEach((btn) => {
    btn.disabled = processing;
    btn.classList.toggle('is-loading', processing);
  });
}

async function updateSignupForRequest(request, status) {
  if (!request || !request.eventId) return;
  const slotKey = request.slotId || request.slot_label || request.slotLabel || null;
  const volunteerId = request.volunteerId || request.volunteer_id || null;
  const eventId = request.eventId;
  const eventRef = doc(db, 'events', eventId);
  const signupStatus = status === 'accepted' ? 'accepted' : (status === 'declined' ? 'declined' : status);

  await applySignupStatusUpdate({
    request,
    eventId,
    slotKey,
    volunteerId,
    status: signupStatus,
  });

  if (status === 'accepted') {
    return;
  }

  if (status === 'declined') {
    if (slotKey) {
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(eventRef);
          if (!snap.exists()) return;
          const data = snap.data() || {};
          const slots = Array.isArray(data.timeSlots) ? [...data.timeSlots] : [];
          const index = slots.findIndex((slot) => {
            const identifier = slot.id || slot.slotId || slot.label;
            return identifier === slotKey;
          });
          if (index === -1) return;
          const slot = { ...slots[index] };
          const taken = Number(slot.taken ?? slot.spotsTaken ?? 0);
          slot.taken = Math.max(0, taken - 1);
          slot.spotsTaken = slot.taken;
          slots[index] = slot;

          const totalTaken = Math.max(0, Number(data.spotsTaken ?? data.spots_taken ?? 0) - 1);

          tx.update(eventRef, {
            timeSlots: slots,
            spotsTaken: totalTaken,
            updatedAt: serverTimestamp(),
          });
        });
      } catch (error) {
        console.warn('slot capacity rollback failed', error);
      }
    }
  }
}

async function applySignupStatusUpdate({
  request,
  eventId,
  slotKey,
  volunteerId,
  status,
}) {
  const signupId = request.signupId || request.signup_id || null;
  const derivedId = (eventId && slotKey && volunteerId)
    ? `${eventId}_${slotKey}_${volunteerId}`
    : null;
  const candidates = [signupId, derivedId].filter(Boolean);
  const payload = {
    status,
    updatedAt: serverTimestamp(),
  };

  const tryUpdate = async (docId) => {
    if (!docId) return false;
    try {
      await updateDoc(doc(db, 'event_signups', docId), payload);
      if (!signupId && request?.id && docId === derivedId) {
        try {
          await updateDoc(doc(db, 'event_slot_requests', request.id), { signupId: docId });
        } catch (error) {
          console.warn('Unable to link signupId to slot request', error);
        }
      }
      return true;
    } catch (error) {
      if (error?.code !== 'not-found') {
        console.warn('Signup status update failed', error);
      }
      return false;
    }
  };

  for (const candidate of candidates) {
    if (await tryUpdate(candidate)) {
      return true;
    }
  }

  // Fallback: query by event and filter client-side.
  try {
    const snapshot = await getDocs(
      query(collection(db, 'event_signups'), where('eventId', '==', eventId)),
    );
    const updates = [];
    const matchedDocIds = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() || {};
      if (volunteerId && data.volunteerId && data.volunteerId !== volunteerId) {
        return;
      }
      if (slotKey && data.slotId && data.slotId !== slotKey) {
        return;
      }
      matchedDocIds.push(docSnap.id);
      updates.push(updateDoc(docSnap.ref, payload));
    });
    if (updates.length) {
      await Promise.allSettled(updates);
      if (!signupId && request?.id && matchedDocIds.length === 1) {
        try {
          await updateDoc(doc(db, 'event_slot_requests', request.id), { signupId: matchedDocIds[0] });
        } catch (error) {
          console.warn('Unable to link signupId to slot request', error);
        }
      }
      return true;
    }
  } catch (error) {
    console.warn('Signup status fallback update failed', error);
  }

  console.warn('No matching signup record found for slot request', request?.id || request);
  return false;
}

function findSlotRequestById(requestId) {
  const requestsByEvent = appState.eventSlotRequests || {};
  for (const [eventId, requests] of Object.entries(requestsByEvent)) {
    const request = requests.find((entry) => entry.id === requestId);
    if (request) {
      return { eventId, request };
    }
  }
  return null;
}

function describeSlotForRequest(eventId, request) {
  const events = Array.isArray(appState.events) ? appState.events : [];
  const event = events.find((entry) => entry.id === eventId);
  if (!event) return 'this slot';

  const slots = Array.isArray(event.timeSlots) ? event.timeSlots : [];
  let slot = null;
  if (Number.isInteger(request.slotIndex) && slots[request.slotIndex]) {
    slot = slots[request.slotIndex];
  } else if (request.slotLabel) {
    slot = slots.find((entry) => (entry.label || '').toLowerCase() === request.slotLabel.toLowerCase());
  }

  if (!slot) {
    return event.title ? `this slot in ${event.title}` : 'this slot';
  }

  const day = slot.day ? DAY_LABELS[slot.day] || capitalize(slot.day) : '';
  const start = formatTime(slot.startTime || '');
  const end = formatTime(slot.endTime || '');
  const time = start && end ? `${start} – ${end}` : start || end || '';
  const parts = [day, time].filter(Boolean);
  return parts.length ? parts.join(' · ') : (event.title ? `this slot in ${event.title}` : 'this slot');
}

async function purgeEventSlotRequests(eventId) {
  if (!eventId) return;
  try {
    const snapshot = await getDocs(query(collection(db, 'event_slot_requests'), where('eventId', '==', eventId)));
    const deletions = snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref));
    await Promise.allSettled(deletions);
  } catch (error) {
    console.warn('Unable to purge slot requests for event', eventId, error);
  }
}

async function purgeEventSignups(eventId) {
  if (!eventId) return;
  try {
    const snapshot = await getDocs(query(collection(db, 'event_signups'), where('eventId', '==', eventId)));
    const deletions = snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref));
    await Promise.allSettled(deletions);
  } catch (error) {
    console.warn('Unable to purge signups for event', eventId, error);
  }
}

async function purgeEventVolunteerLogs(eventId) {
  if (!eventId) return;
  try {
    const snapshot = await getDocs(query(collection(db, 'volunteer_logs'), where('event_id', '==', eventId)));
    const deletions = snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref));
    await Promise.allSettled(deletions);
  } catch (error) {
    console.warn('Unable to purge volunteer logs for event', eventId, error);
  }
}

function autoArchiveExpiredEvents(events = []) {
  const candidates = events.filter((event) => isEventExpired(event));
  if (!candidates.length) return;
  candidates.forEach((event) => {
    archiveExpiredEvent(event).catch((error) => {
      console.warn('Auto archive failed', event.id, error);
    });
  });
}

async function archiveExpiredEvent(event) {
  if (!event || !event.id) return;
  if ((event.status || 'published').toLowerCase() !== 'published') return;
  try {
    await updateDoc(doc(db, 'events', event.id), {
      status: 'archived',
      autoArchivedAt: serverTimestamp(),
    });
    await Promise.allSettled([
      purgeEventSlotRequests(event.id),
      purgeEventSignups(event.id),
      purgeEventVolunteerLogs(event.id),
    ]);
  } catch (error) {
    console.warn('Failed to auto-archive event', event.id, error);
  }
}

function isEventExpired(event) {
  if (!event) return false;
  const today = startOfToday();
  const end = parseDate(event.endDate) || parseDate(event.startDate);
  if (!end) return false;
  return end < today;
}

function beginEditEvent(eventData) {
  const form = document.getElementById('eventCreateForm');
  if (!form) return;
  editingEventId = eventData.id;
  form.dataset.editing = eventData.id;
  currentDraftId = (eventData.status || '').toLowerCase() === 'draft' ? eventData.id : null;
  form.dataset.dirty = 'false';

  toggleEventFormVisibility(true, { skipReset: true });

  const assignValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value == null ? '' : value;
  };

  assignValue('eventTitle', eventData.title || '');
  assignValue('eventSubtitle', eventData.subtitle || '');
  assignValue('eventStartDate', eventData.startDate || '');
  assignValue('eventEndDate', eventData.endDate || '');
  assignValue('eventFrequency', normalizeFrequency(eventData.frequency || 'one-time'));
  const slotCount = Array.isArray(eventData.timeSlots) ? eventData.timeSlots.length : 0;
  let spotsValue = '';
  if (eventData.peoplePerSlot != null) {
    spotsValue = eventData.peoplePerSlot;
  } else if (eventData.capacity != null) {
    spotsValue = slotCount > 0 ? Math.round(eventData.capacity / slotCount) : eventData.capacity;
  }
  assignValue('eventSpots', spotsValue === '' ? '' : spotsValue);
  assignValue('eventLocationName', eventData.venue || '');
  assignValue('eventAddress', eventData.addressLine1 || '');
  assignValue('eventCity', eventData.city || '');
  assignValue('eventState', eventData.state || '');
  assignValue('eventPostal', eventData.postalCode || '');
  assignValue('eventLocationNotes', eventData.locationNotes || '');
  assignValue('eventOverview', eventData.overview || '');
  assignValue('eventVolunteerTasks', eventData.volunteerTasks || '');
  assignValue('eventRequirements', eventData.requirements || '');
  assignValue('eventContactName', eventData.contactName || '');
  assignValue('eventContactEmail', eventData.contactEmail || '');
  assignValue('eventAdditionalNotes', eventData.additionalNotes || '');

  const daySet = new Set((eventData.days || []).map((d) => String(d).toLowerCase()));
  document.querySelectorAll('[data-event-day]').forEach((btn) => {
    const day = String(btn.dataset.eventDay || '').toLowerCase();
    if (daySet.has(day)) {
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.classList.remove('is-active');
      btn.setAttribute('aria-pressed', 'false');
    }
  });

  const causeSet = new Set((eventData.causes || []).map((c) => String(c)));
  ensureCustomCauseChips(Array.from(causeSet));
  document.querySelectorAll('[data-event-cause]').forEach((btn) => {
    const cause = btn.dataset.eventCause;
    if (causeSet.has(cause)) {
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.classList.remove('is-active');
      btn.setAttribute('aria-pressed', 'false');
    }
  });

  const slots = Array.isArray(eventData.timeSlots) && eventData.timeSlots.length
    ? eventData.timeSlots
    : [createEmptySlot()];
  renderSlotRows(slots);

  const publishBtn = document.getElementById('eventPublishBtn');
  if (publishBtn) {
    const label = publishBtn.querySelector('.btn-label');
    if (label) label.textContent = 'Save Changes';
    publishBtn.disabled = false;
  }
}

async function handleEventTakedown(eventData) {
  if ((eventData.status || '').toLowerCase() === 'archived') {
    showMessage('This event is already taken down.', 'info');
    return;
  }

  if (!window.confirm(`Take down "${eventData.title || 'this event'}"? Volunteers will no longer see it listed.`)) {
    return;
  }

  const password = window.prompt('Enter your password to confirm the takedown:');
  if (!password) {
    showMessage('Takedown cancelled.', 'info');
    return;
  }

  const user = auth.currentUser;
  if (!user || !user.email) {
    showMessage('Reauthenticate to manage events. Please sign in again.', 'error');
    return;
  }

  try {
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
    const admin = appState.currentAdmin || {};
    await updateDoc(doc(db, 'events', eventData.id), {
      status: 'archived',
      takenDownAt: serverTimestamp(),
      takenDownBy: admin.uid || user.uid || null,
    });
    await Promise.allSettled([
      purgeEventSlotRequests(eventData.id),
      purgeEventSignups(eventData.id),
      purgeEventVolunteerLogs(eventData.id),
    ]);
    showMessage('Event taken down successfully.', 'success');
  } catch (error) {
    console.error('Event takedown failed', error);
    const msg = error.code === 'auth/wrong-password'
      ? 'Incorrect password. Event was not taken down.'
      : 'Unable to take down event. Please try again.';
    showMessage(msg, 'error');
  }
}

async function handleEventSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form || form.dataset.saving === 'true') return;

  if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const formData = new FormData(form);
  const title = (formData.get('eventTitle') || '').trim();
  const startDate = (formData.get('eventStartDate') || '').trim();
  const address = (formData.get('eventAddress') || '').trim();

  if (!title || !startDate || !address) {
    showMessage('Please complete the required fields before publishing.', 'error');
    return;
  }

  if (!appState.currentOrgCode) {
    showMessage('Select an organization before creating events.', 'error');
    return;
  }

  const selectedDays = getSelectedValues('[data-event-day]', 'eventDay');
  const selectedCauses = getSelectedValues('[data-event-cause]', 'eventCause');
  const perSlotRaw = parseInt(formData.get('eventSpots'), 10);
  const frequency = normalizeFrequency(formData.get('eventFrequency'));

  const endDateRaw = optionalString(formData.get('eventEndDate'));
  if (endDateRaw) {
    const startDateObj = parseDate(startDate);
    const endDateObj = parseDate(endDateRaw);
    if (startDateObj && endDateObj && endDateObj < startDateObj) {
      showMessage('End date must be on or after the start date.', 'error');
      return;
    }
  }

  resetSlotValidationState();
  const slotCollection = collectSlotData({ requireComplete: true });
  if (!slotCollection.valid) {
    showMessage('Please complete each time slot before publishing.', 'error');
    return;
  }
  const existingEvent = editingEventId ? findExistingEvent(editingEventId) : null;
  const peoplePerSlot = Number.isNaN(perSlotRaw) ? null : Math.max(perSlotRaw, 0);
  const existingSlotMap = new Map();
  if (existingEvent && Array.isArray(existingEvent.timeSlots)) {
    existingEvent.timeSlots.forEach((slot) => {
      if (!slot) return;
      const key = slot.id || slot.label;
      if (key) {
        existingSlotMap.set(key, slot);
      }
    });
  }
  const timeSlots = slotCollection.slots.map((slot, index) => {
    const slotId = slot.id || generateSlotId();
    const existingSlot = existingSlotMap.get(slotId) || existingSlotMap.get(slot.label || '') || null;
    const capacity = peoplePerSlot != null
      ? peoplePerSlot
      : (existingSlot && Number.isFinite(existingSlot.capacity) ? Number(existingSlot.capacity) : null);
    const taken = existingSlot && Number.isFinite(existingSlot.taken)
      ? Number(existingSlot.taken)
      : (existingSlot && Number.isFinite(existingSlot.spotsTaken) ? Number(existingSlot.spotsTaken) : 0);
    return {
      id: slotId,
      label: slot.label || buildSlotFallbackLabel(slot, index),
      startTime: slot.startTime,
      endTime: slot.endTime,
      day: slot.day,
      capacity,
      taken,
      spotsTaken: taken,
    };
  });
  if (!timeSlots.length) {
    showMessage('Add at least one volunteer time slot before publishing.', 'error');
    return;
  }
  if (!validateSlotChronology(timeSlots)) {
    showMessage('Each time slot end time must be after its start time.', 'error');
    return;
  }
  const slotCount = timeSlots.length;
  const totalCapacity = (peoplePerSlot != null && slotCount > 0)
    ? peoplePerSlot * slotCount
    : (peoplePerSlot != null ? peoplePerSlot : null);

  const admin = appState.currentAdmin || {};
  const now = serverTimestamp();

  const primarySlot = timeSlots[0] || {};

  const payload = {
    organizationCode: appState.currentOrgCode,
    organizationName: admin.organizationName || null,
    title,
    subtitle: optionalString(formData.get('eventSubtitle')),
    startDate,
    endDate: endDateRaw || startDate,
    startTime: optionalString(primarySlot.startTime),
    endTime: optionalString(primarySlot.endTime),
    frequency,
    capacity: totalCapacity != null ? totalCapacity : null,
    totalSlots: totalCapacity != null ? totalCapacity : null,
    peoplePerSlot: peoplePerSlot != null ? peoplePerSlot : null,
    spotsTaken: existingEvent && Number.isFinite(existingEvent.spotsTaken)
      ? Number(existingEvent.spotsTaken)
      : 0,
    days: selectedDays.length ? selectedDays : null,
    venue: optionalString(formData.get('eventLocationName')),
    addressLine1: address,
    city: optionalString(formData.get('eventCity')),
    state: optionalString(formData.get('eventState')),
    postalCode: optionalString(formData.get('eventPostal')),
    locationNotes: optionalMultiline(formData.get('eventLocationNotes')),
    overview: optionalMultiline(formData.get('eventOverview')),
    volunteerTasks: optionalMultiline(formData.get('eventVolunteerTasks')),
    requirements: optionalMultiline(formData.get('eventRequirements')),
    causes: selectedCauses.length ? selectedCauses : null,
    contactName: optionalString(formData.get('eventContactName')),
    contactEmail: optionalString(formData.get('eventContactEmail')),
    additionalNotes: optionalMultiline(formData.get('eventAdditionalNotes')),
    timeSlots,
    updatedAt: now,
  };

  form.dataset.saving = 'true';
  const submitBtn = document.getElementById('eventPublishBtn');
  if (submitBtn) submitBtn.disabled = true;

  try {
    if (editingEventId) {
      const eventRef = doc(db, 'events', editingEventId);
      const existing = existingEvent || findExistingEvent(editingEventId) || {};
      const nextStatus = (existing && existing.status === 'draft') ? 'published' : ((existing && existing.status) || 'published');
      if (!payload.organizationName && existing && existing.organizationName) {
        payload.organizationName = existing.organizationName;
      }

      await updateDoc(eventRef, {
        ...payload,
        status: nextStatus,
        updatedAt: now,
      });

      showMessage(nextStatus === 'published' && existing && existing.status === 'draft'
        ? 'Draft published successfully.'
        : 'Event updated successfully.', 'success');
    } else {
      const eventsCollection = collection(db, 'events');
      const docRef = await addDoc(eventsCollection, {
        ...payload,
        status: 'published',
        createdAt: now,
        createdBy: admin.uid || null,
        createdByEmail: admin.email || null,
        takenDownAt: null,
        takenDownBy: null,
      });
      showMessage('Event published successfully.', 'success');
    }
    resetEventForm();
  } catch (error) {
    console.error('Event publish failed:', error);
    showMessage('Unable to publish event. Please try again.', 'error');
  } finally {
    form.dataset.saving = 'false';
    if (submitBtn) submitBtn.disabled = false;
  }
}

function resetEventForm(options = {}) {
  const { collapse = true } = options;
  const form = document.getElementById('eventCreateForm');
  if (!form) return;
  form.reset();
  document.querySelectorAll('.event-day-btn.is-active, .event-cause-chip.is-active')
    .forEach((el) => {
      el.classList.remove('is-active');
      el.setAttribute('aria-pressed', 'false');
    });
  document.querySelectorAll('.event-cause-chip[data-custom-cause="true"]').forEach((chip) => chip.remove());
  renderSlotRows();
  editingEventId = null;
  currentDraftId = null;
  form.dataset.editing = '';
  form.dataset.dirty = 'false';
  const publishBtn = document.getElementById('eventPublishBtn');
  if (publishBtn) {
    const label = publishBtn.querySelector('.btn-label');
    if (label) label.textContent = 'Publish Event';
    publishBtn.disabled = false;
  }
  if (collapse) {
    toggleEventFormVisibility(false, { skipDraft: true, skipReset: true });
  }
}

async function maybeSaveDraftOnCollapse() {
  const form = document.getElementById('eventCreateForm');
  if (!form || form.dataset.saving === 'true') return false;
  if (!appState.currentOrgCode) return false;
  if (form.dataset.dirty !== 'true') return false;
  const snapshot = buildDraftPayload();
  if (!snapshot.hasContent) return false;
  await saveDraftFromForm(snapshot);
  return true;
}

async function handleSaveDraftClick(button) {
  if (button && button.dataset.saving === 'true') return;
  if (button) {
    button.dataset.saving = 'true';
    button.disabled = true;
  }
  try {
    await saveDraftFromForm();
  } finally {
    if (button) {
      button.disabled = false;
      button.dataset.saving = 'false';
    }
  }
}

async function saveDraftFromForm(prebuiltSnapshot) {
  const form = document.getElementById('eventCreateForm');
  if (!form) return false;
  if (!appState.currentOrgCode) {
    showMessage('Select an organization before saving drafts.', 'error');
    return false;
  }

  const snapshot = prebuiltSnapshot || buildDraftPayload();
  if (!snapshot.hasContent) {
    return false;
  }

  const admin = appState.currentAdmin || {};
  const now = serverTimestamp();
  const payload = {
    ...snapshot.payload,
    organizationCode: appState.currentOrgCode,
    organizationName: snapshot.payload.organizationName || admin.organizationName || null,
  };

  try {
    let targetId = currentDraftId;
    if (!targetId && editingEventId) {
      const existing = findExistingEvent(editingEventId);
      if (existing && (existing.status || '').toLowerCase() === 'draft') {
        targetId = editingEventId;
      }
    }

    if (targetId) {
      const docRef = doc(db, 'events', targetId);
      const existing = findExistingEvent(targetId) || {};

      if (Array.isArray(payload.timeSlots) && payload.timeSlots.length) {
        const existingSlotLookup = new Map();
        if (Array.isArray(existing.timeSlots)) {
          existing.timeSlots.forEach((slot) => {
            if (!slot) return;
            const key = slot.id || slot.label;
            if (key) existingSlotLookup.set(key, slot);
          });
        }
        payload.timeSlots = payload.timeSlots.map((slot) => {
          const key = slot.id || slot.label || '';
          const previousSlot = existingSlotLookup.get(key) || null;
          const capacity = slot.capacity != null
            ? slot.capacity
            : (previousSlot && Number.isFinite(previousSlot.capacity) ? Number(previousSlot.capacity) : null);
          const taken = previousSlot && Number.isFinite(previousSlot.taken)
            ? Number(previousSlot.taken)
            : (previousSlot && Number.isFinite(previousSlot.spotsTaken) ? Number(previousSlot.spotsTaken) : 0);
          return {
            ...slot,
            capacity,
            taken,
            spotsTaken: taken,
          };
        });
      }

      payload.spotsTaken = Number.isFinite(existing.spotsTaken)
        ? Number(existing.spotsTaken)
        : (Number.isFinite(existing.spots_taken) ? Number(existing.spots_taken) : 0);
      payload.totalSlots = payload.capacity;

      await updateDoc(docRef, {
        ...payload,
        status: 'draft',
        updatedAt: now,
      });
      currentDraftId = targetId;
    } else {
      const draftCollection = collection(db, 'events');
      payload.spotsTaken = 0;
      payload.totalSlots = payload.capacity;
      const docRef = await addDoc(draftCollection, {
        ...payload,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        createdBy: admin.uid || null,
        createdByEmail: admin.email || null,
        takenDownAt: null,
        takenDownBy: null,
        sourceEventId: editingEventId || null,
      });
      currentDraftId = docRef.id;
    }

    form.dataset.dirty = 'false';
    showMessage('Draft saved.', 'success');
    resetEventForm({ collapse: false });
    return true;
  } catch (error) {
    console.error('Draft save failed:', error);
    showMessage('Unable to save draft. Please try again.', 'error');
    return false;
  }
}

function buildDraftPayload() {
  const form = document.getElementById('eventCreateForm');
  if (!form) {
    return { hasContent: false, payload: {} };
  }

  const formData = new FormData(form);
  const selectedDays = getSelectedValues('[data-event-day]', 'eventDay');
  const selectedCauses = getSelectedValues('[data-event-cause]', 'eventCause');
  const perSlotRaw = parseInt(formData.get('eventSpots'), 10);
  const frequency = normalizeFrequency(formData.get('eventFrequency'));
  const slotCollection = collectSlotData({ includeEmpty: true });
  const peoplePerSlot = Number.isNaN(perSlotRaw) ? null : Math.max(perSlotRaw, 0);
  const timeSlots = slotCollection.slots
    .filter((slot) => slot.label || slot.startTime || slot.endTime || slot.day)
    .map((slot, index) => {
      const slotId = slot.id || generateSlotId();
      return {
        id: slotId,
        label: slot.label || buildSlotFallbackLabel(slot, index),
        startTime: slot.startTime,
        endTime: slot.endTime,
        day: slot.day,
        capacity: peoplePerSlot != null ? peoplePerSlot : null,
        taken: Number(slot.taken || 0),
        spotsTaken: Number(slot.spotsTaken || slot.taken || 0),
      };
    });
  const slotCount = timeSlots.length;
  const derivedCapacity = (peoplePerSlot != null && slotCount > 0)
    ? peoplePerSlot * slotCount
    : (peoplePerSlot != null ? peoplePerSlot : null);

  const fieldValues = {
    title: (formData.get('eventTitle') || '').trim(),
    subtitle: optionalString(formData.get('eventSubtitle')),
    startDate: optionalString(formData.get('eventStartDate')),
    endDate: optionalString(formData.get('eventEndDate')),
    frequency,
    capacity: derivedCapacity,
    peoplePerSlot,
    totalSlots: derivedCapacity,
    venue: optionalString(formData.get('eventLocationName')),
    addressLine1: optionalString(formData.get('eventAddress')),
    city: optionalString(formData.get('eventCity')),
    state: optionalString(formData.get('eventState')),
    postalCode: optionalString(formData.get('eventPostal')),
    locationNotes: optionalMultiline(formData.get('eventLocationNotes')),
    overview: optionalMultiline(formData.get('eventOverview')),
    volunteerTasks: optionalMultiline(formData.get('eventVolunteerTasks')),
    requirements: optionalMultiline(formData.get('eventRequirements')),
    causes: selectedCauses.length ? selectedCauses : null,
    contactName: optionalString(formData.get('eventContactName')),
    contactEmail: optionalString(formData.get('eventContactEmail')),
    additionalNotes: optionalMultiline(formData.get('eventAdditionalNotes')),
    days: selectedDays.length ? selectedDays : null,
    timeSlots,
  };

  const primarySlot = timeSlots[0] || {};
  fieldValues.startTime = optionalString(primarySlot.startTime);
  fieldValues.endTime = optionalString(primarySlot.endTime);
  fieldValues.title = fieldValues.title || null;

  const hasContent = Boolean(
    fieldValues.title
    || fieldValues.subtitle
    || fieldValues.startDate
    || fieldValues.endDate
    || fieldValues.venue
    || fieldValues.addressLine1
    || fieldValues.overview
    || fieldValues.volunteerTasks
    || fieldValues.requirements
    || fieldValues.locationNotes
    || fieldValues.additionalNotes
    || fieldValues.contactName
    || fieldValues.contactEmail
    || (fieldValues.causes && fieldValues.causes.length)
    || fieldValues.capacity != null
    || fieldValues.peoplePerSlot != null
    || (fieldValues.days && fieldValues.days.length)
    || timeSlots.length
  );

  return { hasContent, payload: fieldValues };
}

function toggleSelectable(button, className) {
  button.classList.toggle(className);
  const pressed = button.classList.contains(className);
  button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  markFormDirty();
}

function handleCauseChipClick(button) {
  if (!button) return;
  const causeValue = button.dataset.eventCause || '';
  if (!causeValue) return;
  if (causeValue === 'Custom') {
    const input = window.prompt('Enter a custom cause name');
    const label = (input || '').trim();
    if (!label) {
      button.classList.remove('is-active');
      button.setAttribute('aria-pressed', 'false');
      return;
    }
    addCustomCauseChip(label);
    button.classList.remove('is-active');
    button.setAttribute('aria-pressed', 'false');
    return;
  }
  toggleSelectable(button, 'is-active');
}

function addCustomCauseChip(label) {
  const normalized = String(label || '').trim();
  if (!normalized) return;
  const picker = document.querySelector('.event-cause-picker');
  if (!picker) return;

  const existing = Array.from(picker.querySelectorAll('[data-event-cause]'))
    .find((chip) => (chip.dataset.eventCause || '').toLowerCase() === normalized.toLowerCase());

  if (existing) {
    if (!existing.classList.contains('is-active')) {
      existing.classList.add('is-active');
      existing.setAttribute('aria-pressed', 'true');
      markFormDirty();
    }
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'event-cause-chip is-active';
  button.dataset.eventCause = normalized;
  button.dataset.customCause = 'true';
  button.dataset.bound = 'true';
  button.setAttribute('aria-pressed', 'true');
  button.innerHTML = `<i class="fas fa-star"></i> ${escapeHtml(normalized)}`;
  button.addEventListener('click', () => {
    toggleSelectable(button, 'is-active');
    if (!button.classList.contains('is-active')) {
      button.remove();
      markFormDirty();
    }
  });

  const customTrigger = picker.querySelector('[data-event-cause="Custom"]');
  if (customTrigger && customTrigger.parentElement === picker) {
    picker.insertBefore(button, customTrigger);
  } else {
    picker.appendChild(button);
  }

  markFormDirty();
}

function ensureCustomCauseChips(causes = []) {
  if (!Array.isArray(causes) || !causes.length) return;
  const picker = document.querySelector('.event-cause-picker');
  if (!picker) return;
  const existingValues = new Set(
    Array.from(picker.querySelectorAll('[data-event-cause]')).map((chip) => chip.dataset.eventCause || '')
  );
  causes.forEach((cause) => {
    const normalized = String(cause || '').trim();
    if (!normalized) return;
    if (!existingValues.has(normalized)) {
      addCustomCauseChip(normalized);
      existingValues.add(normalized);
    }
  });
}

function getSelectedValues(selector, datasetKey) {
  const key = datasetKey || '';
  const nodes = document.querySelectorAll(selector);
  const selected = [];
  nodes.forEach((node) => {
    if (node.classList.contains('is-active')) {
      const value = key ? node.dataset[key] : node.dataset.value;
      if (value) selected.push(value);
    }
  });
  return selected;
}

function collectSlotData({ requireComplete = false, includeEmpty = false } = {}) {
  const rows = document.querySelectorAll('#eventTimeSlots .event-slot-row');
  const slots = [];
  let valid = true;

  rows.forEach((row) => {
    const slotIndex = slots.length;
    const inputs = row.querySelectorAll('[data-slot-field]');
    const slot = { id: '', label: '', startTime: '', endTime: '', day: '' };
    inputs.forEach((input) => {
      const field = input.dataset.slotField;
      if (field === 'id') slot.id = input.value.trim();
      if (field === 'label') slot.label = input.value.trim();
      if (field === 'start') slot.startTime = input.value;
      if (field === 'end') slot.endTime = input.value;
      if (field === 'day') slot.day = input.value;
    });

    const hasValue = slot.label || slot.startTime || slot.endTime || slot.day;
    if (!hasValue) {
      if (includeEmpty) slots.push(slot);
      return;
    }

    if (requireComplete && (!slot.startTime || !slot.endTime || !slot.day)) {
      valid = false;
      inputs.forEach((input) => {
        if (input.type === 'hidden') return;
        if (!input.value) input.classList.add('slot-input-error');
      });
    } else {
      inputs.forEach((input) => {
        if (input.type === 'hidden') return;
        input.classList.remove('slot-input-error');
      });
    }

    if (!slot.id) {
      slot.id = generateSlotId();
    }
    if (!slot.label) {
      slot.label = buildSlotFallbackLabel(slot, slotIndex);
    }

    slots.push(slot);
  });

  return { slots, valid };
}

function resetSlotValidationState() {
  document.querySelectorAll('.event-slot-row').forEach((row) => {
    row.classList.remove('slot-row-error');
    row.querySelectorAll('[data-slot-field="start"], [data-slot-field="end"]').forEach((input) => {
      input.classList.remove('slot-input-error');
    });
  });
}

function validateSlotChronology(slots = []) {
  let valid = true;
  const rows = document.querySelectorAll('.event-slot-row');

  slots.forEach((slot, index) => {
    const row = rows[index];
    if (!row) return;
    row.classList.remove('slot-row-error');
    const startInput = row.querySelector('[data-slot-field="start"]');
    const endInput = row.querySelector('[data-slot-field="end"]');
    if (startInput) startInput.classList.remove('slot-input-error');
    if (endInput) endInput.classList.remove('slot-input-error');

    const start = parseTimeToMinutes(slot.startTime);
    const end = parseTimeToMinutes(slot.endTime);
    if (start != null && end != null && end <= start) {
      valid = false;
      row.classList.add('slot-row-error');
      if (startInput) startInput.classList.add('slot-input-error');
      if (endInput) endInput.classList.add('slot-input-error');
    }
  });

  return valid;
}

function parseTimeToMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const [hourStr, minuteStr] = value.split(':');
  const hours = Number(hourStr);
  const minutes = Number(minuteStr);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function markFormDirty() {
  const form = document.getElementById('eventCreateForm');
  if (form) {
    form.dataset.dirty = 'true';
  }
}

function createEmptySlot() {
  return {
    id: generateSlotId(),
    label: '',
    startTime: '',
    endTime: '',
    day: '',
  };
}

function renderSlotRows(slots = []) {
  const container = document.getElementById('eventTimeSlots');
  const dayOptions = buildSlotDayOptions();
  if (!container) return;
  const safeSlots = slots.length ? slots : [createEmptySlot()];
  container.innerHTML = safeSlots
    .map((slot, index) => renderSlotRow(slot, index, safeSlots.length > 1, dayOptions))
    .join('');

  container.querySelectorAll('[data-remove-slot]').forEach((btn) => {
    btn.addEventListener('click', () => removeSlotRow(Number(btn.dataset.removeSlot)));
  });
  updateSlotDayOptions();
  resetSlotValidationState();
}

function renderSlotRow(slot, index, canRemove, dayOptions) {
  const slotId = slot.id || generateSlotId();
  const uniqueDayOptions = [...dayOptions];
  if (slot.day && !uniqueDayOptions.some((option) => option.value === slot.day)) {
    uniqueDayOptions.push({
      value: slot.day,
      label: DAY_LABELS[slot.day] || capitalize(slot.day),
    });
  }
  const options = uniqueDayOptions.map(({ value, label }) => `
      <option value="${escapeHtml(value)}"${value === slot.day ? ' selected' : ''}>${escapeHtml(label)}</option>
    `).join('');
  return `
    <div class="event-slot-row" data-slot-index="${index}">
      <input type="hidden" value="${escapeHtml(slotId)}" data-slot-field="id" />
      <div class="event-field">
        <label>Session day</label>
        <select data-slot-field="day">
          <option value="">Choose day</option>
          ${options}
        </select>
      </div>
      <div class="event-field">
        <label>Start time</label>
        <input type="time" value="${escapeHtml(slot.startTime || '')}" data-slot-field="start" />
      </div>
      <div class="event-field">
        <label>End time</label>
        <input type="time" value="${escapeHtml(slot.endTime || '')}" data-slot-field="end" />
      </div>
      <input type="hidden" value="${escapeHtml(slot.label || '')}" data-slot-field="label" />
      <div class="slot-actions">
        ${canRemove ? `<button type="button" class="btn-primary slot-remove-btn" data-remove-slot="${index}"><i class="fas fa-times"></i></button>` : ''}
      </div>
    </div>
  `;
}

function addSlotRow() {
  const current = collectSlotData({ includeEmpty: true }).slots;
  current.push(createEmptySlot());
  renderSlotRows(current);
  markFormDirty();
}

function removeSlotRow(index) {
  const current = collectSlotData({ includeEmpty: true }).slots;
  if (current.length <= 1) return;
  current.splice(index, 1);
  renderSlotRows(current);
  markFormDirty();
}

function normalizeEventData(data) {
  const rawSlots = Array.isArray(data.timeSlots) ? data.timeSlots : [];
  const normalizedSlots = rawSlots.map((entry, index) => {
    const slot = { ...(entry || {}) };
    if (!slot.id) slot.id = generateSlotId();
    if (!slot.label) slot.label = buildSlotFallbackLabel(slot, index);
    return {
      id: slot.id,
      label: slot.label,
      startTime: slot.startTime || slot.start || '',
      endTime: slot.endTime || slot.end || '',
      day: slot.day || '',
      capacity: Number.isFinite(slot.capacity) ? slot.capacity : (Number.isFinite(slot.total) ? slot.total : null),
      taken: Number.isFinite(slot.taken) ? slot.taken : (Number.isFinite(slot.spotsTaken) ? slot.spotsTaken : 0),
    };
  });

  return {
    title: data.title || '',
    subtitle: data.subtitle || '',
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    startTime: data.startTime || '',
    endTime: data.endTime || '',
    frequency: normalizeFrequency(data.frequency || ''),
    capacity: data.capacity ?? null,
    peoplePerSlot: Number.isFinite(data.peoplePerSlot) ? data.peoplePerSlot : null,
    days: Array.isArray(data.days) ? data.days : (data.days ? [].concat(data.days) : null),
    venue: data.venue || '',
    addressLine1: data.addressLine1 || data.address || '',
    city: data.city || '',
    state: data.state || '',
    postalCode: data.postalCode || '',
    locationNotes: data.locationNotes || '',
    overview: data.overview || '',
    volunteerTasks: data.volunteerTasks || '',
    requirements: data.requirements || '',
    causes: Array.isArray(data.causes) ? data.causes : (data.causes ? [].concat(data.causes) : []),
    contactName: data.contactName || '',
    contactEmail: data.contactEmail || '',
    additionalNotes: data.additionalNotes || '',
    timeSlots: normalizedSlots,
    status: (data.status || 'published').toLowerCase(),
    spotsTaken: Number.isFinite(data.spotsTaken) ? data.spotsTaken : (Number.isFinite(data.slotsTaken) ? data.slotsTaken : 0),
    organizationCode: data.organizationCode || null,
    organizationName: data.organizationName || null,
    createdBy: data.createdBy || null,
    sourceEventId: data.sourceEventId || null,
    createdAt: normalizeTimestamp(data.createdAt),
    updatedAt: normalizeTimestamp(data.updatedAt),
    takenDownAt: normalizeTimestamp(data.takenDownAt),
    takenDownBy: data.takenDownBy || null,
  };
}

function optionalString(value) {
  const trimmed = (value || '').trim();
  return trimmed ? trimmed : null;
}

function optionalMultiline(value) {
  const trimmed = (value || '').trim();
  return trimmed ? trimmed : null;
}

function formatDateRange(start, end) {
  if (!start && !end) return '';
  if (!start) return formatDate(end);
  if (!end || start === end) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return '';
  const [hourStr, minuteStr] = value.split(':');
  const hours = Number(hourStr);
  const minutes = Number(minuteStr || 0);
  if (Number.isNaN(hours)) return value;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDaysLabel(days) {
  if (!Array.isArray(days) || !days.length) return '';
  return days.map((day) => DAY_LABELS[day] || capitalize(day)).join(', ');
}

function formatCapacity(capacity) {
  if (!Number.isFinite(capacity) || capacity <= 0) return '';
  return `${capacity} total spot${capacity === 1 ? '' : 's'}`;
}

function formatLocation(event) {
  const parts = [
    event.venue,
    event.addressLine1,
    [event.city, event.state].filter(Boolean).join(', '),
    event.postalCode,
  ].filter(Boolean);
  return parts.join(' • ');
}

function formatContact(event) {
  if (event.contactName && event.contactEmail) {
    return `${event.contactName} (${event.contactEmail})`;
  }
  return event.contactName || event.contactEmail || '';
}

function normalizeFrequency(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  const map = {
    'one-time': 'one-time',
    'one time': 'one-time',
    'one_time': 'one-time',
    single: 'one-time',
    'single session': 'one-time',
    'single-session': 'one-time',
    'single_session': 'one-time',
    weekly: 'weekly',
    week: 'weekly',
    'weekly recurring': 'weekly',
    recurring: 'weekly',
    ongoing: 'weekly',
    'bi-weekly': 'bi-weekly',
    biweekly: 'bi-weekly',
    'bi weekly': 'bi-weekly',
    'multi-day': 'bi-weekly',
    'multi day': 'bi-weekly',
    'multi_day': 'bi-weekly',
  };
  return map[normalized] || 'one-time';
}

function formatFrequency(value) {
  const normalized = normalizeFrequency(value);
  const map = {
    'one-time': 'One Time',
    weekly: 'Weekly',
    'bi-weekly': 'Bi-Weekly',
  };
  return map[normalized] || capitalize(normalized || value);
}

function truncateText(text, limit) {
  if (!text) return '';
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}…`;
}

async function toggleEventFormVisibility(forceExpand, options = {}) {
  const { skipDraft = false, skipReset = false } = options;
  const form = document.getElementById('eventCreateForm');
  const toggleBtn = document.getElementById('eventToggleFormBtn');
  const listCard = document.getElementById('eventsListCard');
  if (!form) return;

  const shouldExpand = typeof forceExpand === 'boolean'
    ? forceExpand
    : form.classList.contains('is-collapsed');

  if (shouldExpand) {
    if (!skipReset && (form.dataset.editing || editingEventId)) {
      resetEventForm({ collapse: false });
    }
    form.classList.remove('is-collapsed');
    if (toggleBtn) {
      const label = toggleBtn.querySelector('.btn-label');
      if (label) label.textContent = 'Hide Form';
      toggleBtn.classList.add('btn-active');
      toggleBtn.setAttribute('aria-expanded', 'true');
    }
    if (listCard) listCard.classList.add('events-list-hidden');
  } else {
    const isEditing = Boolean(form.dataset.editing || editingEventId);
    let draftHandled = false;

    if (!skipDraft) {
      try {
        draftHandled = await maybeSaveDraftOnCollapse();
      } catch (error) {
        console.error('Draft save on collapse failed', error);
      }
    }

    if (isEditing && !draftHandled) {
      resetEventForm({ collapse: false });
    } else if (!draftHandled) {
      form.dataset.dirty = 'false';
    }

    form.classList.add('is-collapsed');
    if (toggleBtn) {
      const label = toggleBtn.querySelector('.btn-label');
      if (label) label.textContent = 'New Event';
      toggleBtn.classList.remove('btn-active');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
    if (listCard) listCard.classList.remove('events-list-hidden');
  }
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isEventActive(event, today) {
  const start = parseDate(event.startDate);
  const end = parseDate(event.endDate) || start;
  if (!start && !end) return false;
  const finalDate = end || start;
  return finalDate && finalDate >= today;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function describeEventDateRange(events) {
  if (!events.length) return '';
  const validDates = events
    .map((event) => event.startDate || event.endDate)
    .filter(Boolean)
    .map((value) => ({ value, date: new Date(value) }))
    .filter(({ date }) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.date - b.date);

  if (!validDates.length) return '';

  const from = validDates[0];
  const to = validDates[validDates.length - 1];
  const startLabel = formatDate(from.value);
  const endLabel = to ? formatDate(to.value) : startLabel;

  return startLabel === endLabel ? `on ${startLabel}` : `from ${startLabel} to ${endLabel}`;
}

function capitalize(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function compareByDateKey(a, b) {
  const aKey = a.startDate || '';
  const bKey = b.startDate || '';
  return aKey.localeCompare(bKey);
}

function compareByUpdatedAt(a, b) {
  const aTime = toMillis(a.updatedAt) || toMillis(a.createdAt);
  const bTime = toMillis(b.updatedAt) || toMillis(b.createdAt);
  return aTime - bTime;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number') {
    const dateFromNumber = new Date(value);
    if (!Number.isNaN(dateFromNumber.getTime())) {
      return dateFromNumber.toISOString();
    }
  }
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === 'function') {
    const dateValue = value.toDate();
    return Number.isNaN(dateValue.getTime()) ? 0 : dateValue.getTime();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function findExistingEvent(eventId) {
  if (!eventId) return null;
  const combined = []
    .concat(Array.isArray(appState.events) ? appState.events : [])
    .concat(Array.isArray(appState.eventDrafts) ? appState.eventDrafts : []);
  return combined.find((evt) => evt.id === eventId) || null;
}

function formatTimestampLabel(value) {
  const millis = toMillis(value);
  if (!millis) return 'Not updated yet';
  const date = new Date(millis);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildSlotDayOptions() {
  const selectedDays = getSelectedValues('[data-event-day]', 'eventDay');
  if (selectedDays.length) {
    return selectedDays.map((day) => ({
      value: day,
      label: DAY_LABELS[day] || capitalize(day),
    }));
  }
  return DAY_FALLBACK;
}

function updateSlotDayOptions() {
  const options = buildSlotDayOptions();
  const selects = document.querySelectorAll('#eventTimeSlots [data-slot-field="day"]');
  selects.forEach((select) => {
    const current = select.value;
    const optionMarkup = [
      '<option value="">Choose day</option>',
      ...options.map(({ value, label }) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`),
    ];
    if (current && !options.find((option) => option.value === current)) {
      optionMarkup.push(`<option value="${escapeHtml(current)}" selected>${escapeHtml(DAY_LABELS[current] || capitalize(current))}</option>`);
    }
    select.innerHTML = optionMarkup.join('');
    if (current) {
      select.value = current;
    }
  });
}

function formatSlotSummary(timeSlots = []) {
  if (!Array.isArray(timeSlots) || !timeSlots.length) {
    return { slotSummary: null, slotLabel: '' };
  }
  const normalized = timeSlots
    .filter((slot) => slot && (slot.startTime || slot.endTime))
    .map((slot) => ({
      ...slot,
      start: slot.startTime || '',
      end: slot.endTime || '',
    }));

  if (!normalized.length) {
    return { slotSummary: null, slotLabel: '' };
  }

  const first = normalized[0];
  const start = formatTime(first.start);
  const end = formatTime(first.end);
  const day = first.day ? DAY_LABELS[first.day] || capitalize(first.day) : '';
  const slotLabel = [day, start && end ? `${start} – ${end}` : start || end].filter(Boolean).join(' · ');
  return { slotSummary: first, slotLabel };
}
