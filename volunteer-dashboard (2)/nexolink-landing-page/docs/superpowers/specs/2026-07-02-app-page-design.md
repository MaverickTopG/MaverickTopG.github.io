# App Page Design Spec
**Date:** 2026-07-02  
**Route:** `/app`  
**File:** `pages/AppPage.tsx`

---

## Goal

Replace the current `AppPage.tsx` (which is a thin `ScrollHero` wrapper) with a full App Store–style marketing page that showcases the NexoLink iOS app using real screenshots. The page replaces the existing scroll animation entirely and uses a static layout.

---

## Screenshots

All six PNGs are copied into `public/screenshots/`:

| Filename | Screen | Used in |
|---|---|---|
| `IMG_4341.PNG` | Home / Discovery | Hero (main phone) |
| `IMG_4342.PNG` | Activity / Week view | Section 2 (main phone) |
| `IMG_4343.PNG` | Daily Goals (light blue, "66") | Section 4 bento card 1 |
| `IMG_4344.PNG` | Trends / wave chart | Section 4 bento card 2 |
| `IMG_4345.PNG` | Calendar (July) | Section 2 (small inset card) |
| `IMG_4346.PNG` | Log Hours | Section 3 (main phone) |

---

## Page Structure

### Section 1 — Hero
- **Background:** `--base-300` (dark)
- **Layout:** Two columns, full-viewport height
- **Left col:** Large uppercase headline `"THE VOLUNTEER APP BUILT FOR PEOPLE WHO SHOW UP."` (PP Neue Montreal, clamp font size), one-line subhead `"Available on iOS — free to download."`, App Store outlined pill button
- **Right col:** `IMG_4341.PNG` in a minimal rounded phone frame (`border-radius: 44px`, subtle `box-shadow`)
- **No scroll animation**

### Section 2 — "Track your week"
- **Background:** `--base-100` (light lavender)
- **Layout:** Two columns
- **Left col:** Main phone frame with `IMG_4342.PNG` (Activity week view)
- **Right col:** Uppercase section label (`"02"`), headline `"SEE EXACTLY WHERE YOUR TIME GOES"`, 2-line body copy, then `IMG_4345.PNG` (Calendar) as a smaller secondary phone card below the text — the Bento B element
- **Text colors:** `--base-300` headings, `--base-300` body

### Section 3 — "Log in seconds"
- **Background:** `--base-300` (dark)
- **Layout:** Two columns, flipped (phone right, text left)
- **Left col:** Uppercase label (`"03"`), headline `"LOG HOURS BEFORE YOU EVEN LEAVE."`, short body copy
- **Right col:** `IMG_4346.PNG` in phone frame
- **Text colors:** `--base-100`

### Section 4 — Impact Bento
- **Background:** `--base-100` (light)
- **Layout:** Three equal bento cards in a row, full-width
- **Card 1:** Big stat `"66"` + label `"DAILY GOALS HIT"` (sourced from IMG_4343 data). Light blue tint background (`#dbeafe`).
- **Card 2:** `IMG_4344.PNG` (Trends wave) clipped into the card — the wave graphic fills the bottom half
- **Card 3:** Big stat `"727"` + label `"TOTAL HOURS LOGGED"` (sourced from IMG_4342 data). Violet tint background (`--base-200` at low opacity).
- All cards: `border-radius: 20px`, consistent padding

### Section 5 — CTA
- **Background:** `--base-300` (dark)
- **Layout:** Full-width centered
- **Content:** Large centered headline `"DOWNLOAD NEXOLINK."`, App Store badge/button below
- **App Store button:** Apple SVG badge or a styled `<a>` pill — links to App Store (placeholder `#` until live)

---

## Implementation

### Files changed
| File | Change |
|---|---|
| `pages/AppPage.tsx` | Full rewrite — static React component, no GSAP |
| `public/screenshots/` | New folder, 6 PNG files copied in |
| `index.html` | New `/* ── App page ── */` CSS block appended |

### Phone frame pattern
```css
.app-phone {
  border-radius: 44px;
  overflow: hidden;
  box-shadow: 0 32px 80px rgba(11, 8, 23, 0.25);
  width: 100%;
  max-width: 280px;
}
.app-phone img { display: block; width: 100%; height: auto; }
```

### Responsive
- Below 768px: all two-column rows stack to single column, phone above text
- Bento grid: stacks to 1 column on mobile (cards full-width)
- Hero: stacks with phone below headline

### Typography
- Section labels: `0.7rem`, `letter-spacing: 0.15em`, `opacity: 0.5`
- Headlines: PP Neue Montreal uppercase, `clamp(2rem, 5vw, 5rem)`
- Body: PP Neue Montreal, `0.85rem`, `line-height: 1.5`, not uppercase
- Stat numbers: PP Neue Montreal, `clamp(4rem, 10vw, 8rem)`, `font-weight: 600`

---

## What is NOT changing
- `Nav.tsx` — untouched
- `Hero.tsx` / `ScrollHero.tsx` — untouched
- `AdminPortalPage.tsx` — untouched
- `LoginPage.tsx` / `CreatePage.tsx` — untouched
- `App.tsx` routing — `/app` route already exists, just the component changes
