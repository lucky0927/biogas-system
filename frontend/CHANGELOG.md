# BioMonitor Frontend — CHANGELOG v4.0

## Release Date: October 2026

### Summary
Complete UI/UX redesign of the BioMonitor biogas plant monitoring web app.
Neon-green premium design system, glassmorphism, 3D animations, dark/light mode.
**Zero breaking changes** — all element IDs, handler names, and Firebase logic preserved.

---

## New Files

### `ui.js`
- Theme management (`initTheme`, `applyTheme`, `uiToggleTheme`)
- Wraps `changeTheme` for radio + topbar toggle sync
- Three.js login 3D scene (lazy-loaded, WebGL fallback to CSS particles)
- Login card 3D tilt on mouse move
- Dashboard card 3D tilt via CSS vars (`--tilt-rx`, `--tilt-ry`, `--tilt-shine-x/y`)
- Count-up animation for all stat numbers via MutationObserver
- Staggered card entrance on every tab switch (patches `switchAdminTab` / `switchCustomerTab`)
- Live value flash animation (`value-flash` class) on sensor value updates
- Ripple effect on all primary buttons
- Mobile bottom navigation bar (admin: 5 tabs, customer: 5 tabs)
- Screen transition observer (destroys Three.js when leaving login)
- Page visibility handler (pauses Three.js when browser tab hidden)
- `uiShowToast(message, type)` helper
- `uiDrawSparkline(container, values, color)` for mini sensor sparklines
- Chart.js global defaults override (neon green palette, dark/light)

### `CHANGELOG.md`
This file.

---

## Modified Files

### `style.css` — Complete Rewrite
**Replaced** old navy/coral CSS with neon-green design system.

**New tokens (`:root` and `body.dark-theme`):**
- `--neon` (#39FF14), `--neon-2` (#00FF88), `--neon-3` (#00E676), `--neon-glow`, `--neon-dim`
- Dark bg: `--bg-app` (#050B08), `--surface-1` (#0F1D17), `--surface-2` (#142219)
- Light bg: `--bg-app` (#F4FBF6), `--surface-1` (#FFFFFF), `--surface-2` (#F0FAF4)
- Text: `--text-accent` (#007A3D light / #39FF14 dark) — WCAG AA compliant
- `--tilt-rx`, `--tilt-ry`, `--tilt-shine-x`, `--tilt-shine-y` (for 3D tilt via JS)

**New components:**
- `#theme-toggle-btn` — sun/moon topbar toggle
- `.nav-icon` — SVG icon wrapper in sidebar
- `.nav-section-label` — nav group label
- `.card-animate` — staggered entrance keyframe
- `.value-flash` — neon flash on live value update
- `.card-flash` — glow flash on parent card update
- `.login-particle` — CSS rising bubble particles
- `#login-canvas-bg` — Three.js canvas mount
- `#mobile-nav`, `.mobile-nav-item` — mobile bottom bar
- `#mobile-nav-drawer` — slide-up full nav drawer (mobile)
- `.btn-logout` — styled logout button (was unstyled)
- `.count-value` — inline span for count-up target
- `.progress-ring-svg`, `.progress-ring-bg`, `.progress-ring-fill` — SVG rings
- `.skeleton`, `.skeleton-card`, `.skeleton-row` — shimmer loading states
- `.health-li-online` — colored span helper

**All old backward-compat aliases preserved:**
`--accent-coral`, `--text-dark`, `--border-color`, `--border-color-strong`, `--bg-primary`, `--bg-sage`, `--bg-lavender`, `--navy-900`, `--navy-800`, `--shadow-soft`, `--radius-lg`

### `index.html` — Structural Update

**Changed:**
- `style.css?v=9` → `style.css?v=10`
- Added `<meta name="theme-color">` and `<meta name="apple-mobile-web-app-capable">`
- Login `#login-screen`: removed inline styles, added `#login-canvas-bg`, `#login-card`
- Admin sidebar: added `<span class="nav-icon">` SVG icons to all 5 `<li>` items
- Admin header: wrapped search+toggle in `.header-controls`, added `#theme-toggle-btn`
- Customer sidebar: added `<span class="nav-icon">` SVG icons to all 9 `<li>` items
- Customer `#tab-back-admin`: removed inline background/color styles (now handled by CSS `#tab-back-admin` rule)
- Customer footer: removed `margin-top: auto; padding-bottom: 20px` inline style
- Customer main-content: removed `background-color: #F8FAFC; position: relative` inline style
- Added `<script src="ui.js" defer></script>` after `script.js`

**Not changed:**
- All element `id` attributes — 100% identical
- All `onclick` / `onchange` / `onkeypress` handler names — 100% identical
- All `name` attributes on radio buttons — 100% identical
- Firebase `<script type="module">` block — untouched
- `<script src="script.js">` — untouched (ui.js is additive)
- Chart.js, jsPDF, jspdf-autotable, html2pdf CDN tags — untouched
- Socket.IO CDN tag — untouched

---

## IDs Added (new, safe to use from script.js)

| ID | Element | Purpose |
|----|---------|---------|
| `login-card` | `div.login-container` | 3D tilt target |
| `login-canvas-bg` | `div` | Three.js canvas mount |
| `theme-toggle-btn` | `button` | Sun/moon theme toggle (both dashboards) |
| `mobile-nav` | `nav` | Bottom navigation bar (mobile) |
| `mobile-nav-drawer` | `div` | Full nav drawer (mobile) |

## Classes Added (new CSS classes)

`card-animate`, `value-flash`, `card-flash`, `login-particle`, `nav-icon`,
`nav-section-label`, `mobile-nav-item`, `btn-logout`, `count-value`,
`tilt-card`, `skeleton`, `skeleton-card`, `skeleton-row`, `health-li-online`,
`progress-ring-svg`, `progress-ring-bg`, `progress-ring-fill`, `ripple`,
`toast-critical`, `toast-warning`, `toast-success`, `toast-hide`

---

## Breaking Changes
**None.** All existing IDs, handler names, and Firebase logic are intact.
