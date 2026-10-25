# BioMonitor SCADA Frontend — CHANGELOG v5.0

## Release Date: October 2026 (Round 2 — Industrial Control-Room Elevation)

### Executive Summary
Round 2 elevates the entire BioMonitor tab content area into a professional SCADA / industrial control-room interface with a signature neon-green clean-energy identity.
- Fixed root layout bug (variable empty left gaps on History, Sensors, Alerts, Contact, etc.).
- Complete elimination of all 160+ emojis across HTML, CSS, JavaScript template strings, chat, notifications, and PDF/CSV export pipelines.
- Standardized inline-SVG industrial icon system (`icons.js`).
- Procedural Three.js 3D Digester Digital Twin (`twin3d.js`) in Live Monitor.
- Industrial component library: glass panels with corner brackets, instrument metric tiles, precision CSS LEDs, linear range bars with safe-zone bands, segmented controls, sticky SCADA tables, and paper-on-desk report sheets.
- Zero breaking changes to Firebase logic, Chart.js instances, socket listeners, element IDs, or global function names.

---

## 1. New Deliverables

### `icons.js` (New File)
- Lucide-style industrial SVG icon set (24x24 viewBox, 1.75px stroke, `currentColor`, round caps/joins).
- Exposes `window.icon(name, size = 18, className = '')` returning self-contained inline SVG strings (100% compatible with `html2canvas` and `jsPDF` exports).
- Injects hidden `<svg id="bm-svg-sprite">` containing `<symbol id="bm-icon-{name}">` definitions.
- 35+ industrial icons: `pin`, `gauge`, `flame`, `thermometer`, `flask`, `activity`, `wifi`, `wifi-off`, `alert-triangle`, `siren`, `refresh`, `download`, `trash`, `edit`, `chat`, `phone`, `mail`, `globe`, `wrench`, `calendar`, `filter`, `trending-up`, `trending-down`, `minus`, `check`, `x`, `arrow-right`, `mic`, `image`, `user`, `shield`, `settings`, `copy`, `paperclip`, `sun`, `moon`, `layers`, `file-text`, `cloud`.

### `twin3d.js` (New File)
- Procedural Three.js Digital Twin for anaerobic biogas digesters.
- Geometry: cylindrical tank vessel with dome gas holder, inlet/outlet piping manifolds, gas relief valve, and floating gas bubble particle swarm.
- Real-time telemetry binding:
  - Liquid column height and volume percentage dynamically scale with `val-vol-pct`.
  - Gas bubble velocity and ascent frequency driven by live `val-ch4`.
  - Ambient illumination and vessel emissive glow adapt to system health (optimal green `#39FF14`, warning amber `#F59E0B`, critical red `#EF4444`).
- Mouse drag rotation & silky idle orbit.
- Strict resource management: automatically pauses during background tab visibility; cleanly disposes WebGL contexts on tab switch (guaranteeing at most 1 active WebGL context).
- Accessible isometric SVG fallback for devices without WebGL or with `prefers-reduced-motion` enabled.

---

## 2. Modified Files & Component Overhauls

### `style.css` (Upgraded to SCADA v5.0)
- **Root Layout Fix**:
  - Removed `max-width: 1800px` and `margin: 0 auto` from `.main-content`. `.main-content` now fills 100% of space right of the sidebar.
  - Added `.page`: standardized container (`max-width: 1440px; margin-inline: auto; padding: 32px; box-sizing: border-box;`) ensuring identical left edge across every tab.
  - Added `.page-header`: unified flex header with aligned title block, subtitle, and responsive action toolbar.
- **Industrial Component Classes**:
  - `.panel`, `.panel-bracket`: Glass surfaces with 1px neon-tinted border, subtle inner highlight, and corner bracket accents.
  - `.metric-tile`: High-density industrial KPI cards with monospace figures (`JetBrains Mono`).
  - `.led-indicator`: Glowing LED status dots (`.led-online`, `.led-warning`, `.led-critical`, `.led-offline`).
  - `.led-pill`: Monospace status pills with embedded pulsing LED.
  - `.range-bar`, `.range-zone-safe`, `.range-marker`: Linear range visualizers with highlighted safe bands.
  - `.segmented-control`, `.seg-btn`: Industrial tab switchers.
  - `.digester-module-card`: SCADA unit card with isometric digester illustration, mini telemetry strip, and unclipped `.badge-selected-tag`.
  - `.data-table`: Sticky glass headers, monospace numeric alignment, zebra striping, newest-row highlight.
  - `.report-sheet`: "Paper on desk" 3D elevation with subtle drop shadow and neon accent bar.
  - Form controls: 42px uniform height, neon focus halo, styled selects and date pickers.
- **Strict WCAG AA Contrast**:
  - Light mode: `--text-primary: #1A2E22` (14.4:1), `--text-secondary: #2D5A3D` (7.9:1), `--text-muted: #4A6B53` (5.9:1), `--text-accent: #007A3D` (5.4:1), `--color-warning: #B45309` (5.0:1), `--color-critical: #DC2626` (4.8:1).
  - Dark mode: `--text-primary: #E8FFF0` (16.5:1), `--text-secondary: #9DC9AB` (9.4:1), `--text-muted: #6B9A7B` (5.4:1), `--neon: #39FF14` (12.8:1).

### `index.html` (Upgraded)
- Script loading order: added `<script src="icons.js"></script>` and `<script src="twin3d.js" defer></script>`.
- All 14 tabs (Admin and Customer) wrapped in `<div class="page">` with `.page-header`.
- Customer header bar now includes `#theme-toggle-btn-cust` for instant theme toggling.
- `cust-monitor` redesigned with 6 radial instrument metric tiles (CH4, CO2, Temp, pH, Pressure, Volume) and the `#digester-twin-mount` container.
- Complete replacement of all hardcoded emojis (`👤`, `🔑`, `🔗`, `📡`, `📋`, `🗑️`, `🔄`, `⚠️`, `✅`, `📞`, `💬`, `✉️`, `📘`, `🛠️`) with inline SVGs or CSS LEDs.

### `script.js` (Template Strings Upgraded)
- `paintCustomerOverview`:
  - Upgraded unit cards to `.digester-module-card` with isometric tank graphic and telemetry strip.
  - Fixed "Selected" badge clipping by rendering `.badge-selected-tag` cleanly inside the card header.
  - Replaced `📍` with `${icon('pin', 16)}`.
- `loadSensorStatus`:
  - Upgraded sensor cards to `.sensor-instrument-card`.
  - Replaced `🟢 ONLINE` / `🔴 OFFLINE` with `.led-pill`.
  - Replaced `⚠️ Report Issue` with `${icon('alert-triangle', 13)} Report Issue`.
- `loadCustomerAlerts` & `renderAlertCards`:
  - Replaced alert icon emojis in `ALERT_THRESHOLDS` (`🔥`, `💨`, `⚙️`, `🌡️`, `🧪`) with string icon identifiers (`flame`, `cloud`, `gauge`, `thermometer`, `flask`).
  - Replaced `🚨`, `⚠️`, `✅`, `📡` with `.led-indicator` and SVG icons.
  - Replaced `📈 Rising`, `📉 Falling`, `➡️ Stable` with SVG trend icons.
  - Replaced empty state emojis (`📭`, `✅`, `⚠️`, `🔍`) with clean SVG illustrations.
- `initAdminChat` & `loadCustomerChatForUnit`:
  - Replaced `📷 Image` and `🎤 Voice message` with `${icon('image', 14)}` and `${icon('mic', 14)}`.
  - Replaced `👤` and `📞` with SVG icons.
  - Cleaned resolution message so PDF exports and history records are free of emoji characters.
- `renderCustomersList`:
  - Replaced `📍`, `📧`, `📞`, `✏️`, `🗑️` with SVG icons.
- Report builders (`buildProductionReport`, `buildQualityReport`, etc.):
  - Removed emoji arrows and checkmarks to guarantee clean CSV and PDF exports.

### `ui.js` (Upgraded)
- Replaced emoji toggle symbols (`☀️` / `🌙`) with SVG sun and moon icons.
- Replaced toast emojis with SVG icons in `uiShowToast`.
- Wired 3D Digester Twin lifecycle hooks into `switchCustomerTab` (lazy mounting on `cust-monitor`, automatic teardown when navigating away).
- Bound live updates from `val-vol-pct` and `val-ch4` into `updateDigesterTwinData`.

---

## 3. Preserved Identifiers & Zero Breaking Changes

| Item | Status | Verification |
|---|---|---|
| All Tab IDs (`cust-overview`, `cust-monitor`, `cust-history`, etc.) | Preserved | Verified by DOM audit |
| All Live Telemetry IDs (`val-ch4`, `val-co2`, `val-temp`, `val-ph`, `val-pressure`, `val-vol`, `val-vol-pct`, `val-distance`, `val-hum`) | Preserved | Verified by DOM audit |
| Actuator Status IDs (`status-valve1`, `status-valve2`, `status-valve`, `status-pump`) | Preserved | Verified by DOM audit |
| Admin Search & Stats (`admin-search-input`, `search-suggestions`, `dash-total`, `dash-online`, etc.) | Preserved | Verified by DOM audit |
| Firebase SDK `<script type="module">` block | Untouched | Verified |
| Chart.js, Socket.IO, jsPDF, html2pdf CDNs | Untouched | Verified |
| Global Function Signatures (`switchAdminTab`, `switchCustomerTab`, `changeTheme`, `exportToPDF`, etc.) | Preserved | Verified by headless browser check |

---

## 4. Verification & Quality Gate Results
- **Emoji Audit**: 0 emojis found across all `.html`, `.js`, and `.css` files.
- **Alignment Audit**: Verified parity across 1920x1080, 1536x864, 1366x768, 768px, and 390px viewports. Content left edge starts at the exact same coordinate on every tab.
- **Contrast Audit**: All text and controls achieve WCAG AA contrast ratio (≥ 4.5:1) in both light and dark themes.
- **Console Check**: Zero uncaught runtime errors or syntax errors in headless browser execution.
