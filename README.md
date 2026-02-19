# NexoLink

This repo serves the NexoLink landing page and admin dashboard.

## Admin Portal Feature Summary (Comprehensive)
The admin portal lives under `volunteer-dashboard (2)/admin` and is a single‑page React app. Below is a comprehensive, code‑based inventory of current capabilities.

### Authentication & Security
- Firebase Auth session management with session‑only persistence (new tab or copied URL requires re‑login).
- Client protections: HTTPS enforcement (non‑localhost), frame‑break (anti‑clickjacking), strict referrer policy, and no‑cache HTML headers.
- Sensitive actions (e.g., delete/archiving) require re‑authentication with password.

### Organization Context
- Resolves org context from Firestore (`orgId`, `orgCode`, `orgName`) on login.
- Uses org context to scope data across pages (events, messages, volunteers, logs, billing, etc.).

### Impact Dashboard (“Impact”)
- Key metrics: total volunteers, weekly active, total hours, hours trend.
- Charts with weekly/monthly/yearly series.
- Top volunteer highlights and retention KPI.

### Volunteers Management
- Search and filter (all members, highest hours, lowest hours, archived).
- View volunteer profile info (name, email, role, hours, last logged).
- Email action with modal.
- Volunteer activity history modal with logs.
- Archive/restore members (password re‑auth required).

### Volunteer Requests / Logs
- Review and approve volunteer hour logs and join requests.
- Auto‑processing toggle (respects `auto_process_logs` in org doc).
- Auto‑approval logic (never auto‑rejects; leaves questionable logs for admin).
- Questionable detection includes: extreme hours, flags, future dates, and history anomalies.

### Events Management
- Create events with cover image upload, location, dates, shifts, capacity.
- Publish or save as draft.
- Event lists with filters: Live, Upcoming, Past, Drafts.
- Event detail view with volunteer signups.
- Search/filter signups and export roster to CSV.
- Action controls: copy email, message volunteer (deep‑link into messaging), delete event (password re‑auth).

### Messaging
- Org‑scoped threads: all‑volunteers and direct messages.
- Search threads, emoji picker, attachments (images, PDFs, DOCX, etc.).
- Attachment upload to Firebase Storage with preview and download.
- Auto‑selects direct message target when navigating from event actions.

### Billing
- Displays subscription status, plan, payment method.
- Recent invoices and billing portal access.
- Upgrade/downgrade and cancel subscription flows.

### Nebulae (AI Assistant)
- AI chat interface with attachment upload (images, docs).
- Grant‑related queries auto‑open the grants side panel.
- Answer formatting cleanup for readable output.

### Kiosk Mode
- Kiosk modal for volunteer sign‑in flows with secure re‑auth.

### Support
- Built‑in FAQ/support content for admins.

### Preload/Performance Behavior
- Volunteer Requests, Messaging, Billing, Volunteers, and Events pages preload on login while preserving transitions.

## Commands
- `npm run dev`: run the landing page dev server
- `npm run build`: build the landing page
- `npm run build:admin`: build the admin dashboard
