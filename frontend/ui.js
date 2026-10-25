/**
 * BioMonitor UI Layer — ui.js v4.0
 * Premium animations, Three.js login scene, theme toggle,
 * 3D card tilt, count-up, mobile nav, ripple, sparklines.
 *
 * SAFE: Does NOT redefine any existing global functions from script.js.
 *       Wraps/extends where needed via window property patching.
 */

(function () {
  'use strict';

  /* ================================================================
     CONSTANTS & STATE
     ================================================================ */
  const NEON = '#39FF14';
  const NEON_DIM = 'rgba(57,255,20,0.14)';
  let threeScene = null;
  let threeAnimFrame = null;
  let isLoginVisible = true;

  /* ================================================================
     1. THEME MANAGEMENT
     ================================================================ */
  function getStoredTheme() {
    return localStorage.getItem('biomonitor-theme') || 'dark';
  }

  function applyTheme(mode) {
    const isDark = mode === 'dark' ||
      (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('dark-theme', isDark);

    // Sync all theme-select radio buttons
    document.querySelectorAll('input[name="theme-select"]').forEach(r => {
      r.checked = (r.value === mode);
    });

    // Update toggle button icon
    const toggleBtns = document.querySelectorAll('#theme-toggle-btn');
    toggleBtns.forEach(btn => {
      btn.textContent = isDark ? '☀️' : '🌙';
      btn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    });

    // Update Chart.js defaults if charts exist
    updateChartDefaults(isDark);
  }

  function initTheme() {
    const stored = getStoredTheme();
    applyTheme(stored);
  }

  // Global toggle exposed for the topbar button onclick
  window.uiToggleTheme = function () {
    const isDark = document.body.classList.contains('dark-theme');
    const next = isDark ? 'light' : 'dark';
    localStorage.setItem('biomonitor-theme', next);
    applyTheme(next);
    // Also call existing changeTheme so radio buttons and any script.js logic stays in sync
    if (typeof changeTheme === 'function') changeTheme(next);
  };

  // Wrap existing changeTheme so our UI stays in sync when radios are used
  const _origChangeTheme = window.changeTheme;
  window.changeTheme = function (val) {
    localStorage.setItem('biomonitor-theme', val);
    applyTheme(val);
    if (typeof _origChangeTheme === 'function') _origChangeTheme(val);
  };

  // System theme watcher
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'system') applyTheme('system');
  });

  /* ================================================================
     2. CHART.JS GLOBAL DEFAULTS (neon green theme)
     ================================================================ */
  function updateChartDefaults(isDark) {
    if (typeof Chart === 'undefined') return;
    const textColor = isDark ? 'rgba(232,255,240,0.55)' : 'rgba(26,46,34,0.55)';
    const gridColor = isDark ? 'rgba(57,255,20,0.07)' : 'rgba(26,46,34,0.07)';

    Chart.defaults.color = textColor;
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 11;

    Chart.defaults.plugins.legend.labels.color = textColor;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyleWidth = 8;
    Chart.defaults.plugins.tooltip.backgroundColor = isDark ? 'rgba(15,29,23,0.95)' : 'rgba(255,255,255,0.98)';
    Chart.defaults.plugins.tooltip.borderColor = isDark ? 'rgba(57,255,20,0.30)' : 'rgba(0,168,79,0.30)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.titleColor = isDark ? '#39FF14' : '#007A3D';
    Chart.defaults.plugins.tooltip.bodyColor = isDark ? 'rgba(232,255,240,0.80)' : 'rgba(26,46,34,0.80)';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 10;

    Chart.defaults.scale.grid.color = gridColor;
    Chart.defaults.scale.ticks.color = textColor;
    Chart.defaults.elements.line.tension = 0.40;
    Chart.defaults.elements.line.borderWidth = 2.5;
    Chart.defaults.elements.point.radius = 3;
    Chart.defaults.elements.point.hoverRadius = 6;
    Chart.defaults.elements.point.borderWidth = 0;
    Chart.defaults.elements.point.backgroundColor = isDark ? NEON : '#00A84F';

    // Re-style live chart if it exists
    styleLiveChart(isDark);
  }

  function styleLiveChart(isDark) {
    if (typeof liveChart === 'undefined' || !liveChart) return;
    try {
      const ds = liveChart.data.datasets;
      if (ds[0]) {
        ds[0].borderColor = isDark ? '#39FF14' : '#00A84F';
        ds[0].backgroundColor = isDark
          ? 'rgba(57,255,20,0.08)' : 'rgba(0,168,79,0.08)';
        ds[0].pointBackgroundColor = isDark ? '#39FF14' : '#00A84F';
        ds[0].fill = true;
      }
      if (ds[1]) {
        ds[1].borderColor = isDark ? '#00FF88' : '#007A3D';
        ds[1].backgroundColor = isDark
          ? 'rgba(0,255,136,0.06)' : 'rgba(0,122,61,0.06)';
        ds[1].pointBackgroundColor = isDark ? '#00FF88' : '#007A3D';
        ds[1].fill = true;
      }
      liveChart.update('none');
    } catch (e) { /* chart not ready yet */ }
  }

  /* ================================================================
     3. THREE.JS LOGIN SCENE (lazy-loaded, WebGL with CSS fallback)
     ================================================================ */
  function initLoginScene() {
    const container = document.getElementById('login-canvas-bg');
    if (!container) return;

    // CSS particle fallback first (instant)
    spawnCSSParticles(container);

    // Check WebGL support
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) throw new Error('no WebGL');
    } catch (e) {
      console.log('[ui] No WebGL — using CSS fallback only');
      return;
    }

    // Lazy load Three.js after 600ms (don't block login form)
    setTimeout(() => {
      if (!isLoginVisible) return;
      loadThreeJS(() => {
        if (!isLoginVisible) return;
        buildThreeScene(container);
      });
    }, 600);
  }

  function loadThreeJS(cb) {
    if (window.THREE) { cb(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js';
    script.onload = cb;
    script.onerror = () => console.log('[ui] Three.js failed to load — CSS fallback active');
    document.head.appendChild(script);
  }

  function buildThreeScene(container) {
    const THREE = window.THREE;
    const W = container.clientWidth, H = container.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000);
    camera.position.z = 8;

    // ── Biogas dome / molecule cluster ──
    const geoDome = new THREE.SphereGeometry(2.2, 32, 32);
    const matDome = new THREE.MeshPhongMaterial({
      color: 0x051408,
      emissive: 0x0A3018,
      wireframe: false,
      transparent: true,
      opacity: 0.60,
      shininess: 80,
    });
    const dome = new THREE.Mesh(geoDome, matDome);
    scene.add(dome);

    // Wireframe overlay on dome
    const geoWire = new THREE.SphereGeometry(2.22, 18, 18);
    const matWire = new THREE.MeshBasicMaterial({ color: 0x39FF14, wireframe: true, transparent: true, opacity: 0.08 });
    const wire = new THREE.Mesh(geoWire, matWire);
    scene.add(wire);

    // ── Floating molecule bubbles ──
    const bubbles = [];
    const bubbleGeo = new THREE.SphereGeometry(0.12, 12, 12);
    for (let i = 0; i < 28; i++) {
      const r = Math.random() > 0.5;
      const mat = new THREE.MeshBasicMaterial({
        color: r ? 0x39FF14 : 0x00FF88,
        transparent: true,
        opacity: 0.55 + Math.random() * 0.35,
      });
      const b = new THREE.Mesh(bubbleGeo, mat);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const radius = 2.6 + Math.random() * 2.8;
      b.position.set(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi)
      );
      b.userData = {
        speed: 0.004 + Math.random() * 0.008,
        angle: Math.random() * Math.PI * 2,
        riseSpeed: 0.002 + Math.random() * 0.004,
        originY: b.position.y,
        amp: 0.3 + Math.random() * 0.5,
      };
      scene.add(b);
      bubbles.push(b);
    }

    // ── Ring ──
    const geoRing = new THREE.TorusGeometry(3.0, 0.03, 8, 80);
    const matRing = new THREE.MeshBasicMaterial({ color: 0x39FF14, transparent: true, opacity: 0.20 });
    const ring = new THREE.Mesh(geoRing, matRing);
    ring.rotation.x = Math.PI / 2.5;
    scene.add(ring);

    // ── Lighting ──
    scene.add(new THREE.AmbientLight(0x0A3018, 0.6));
    const ptLight = new THREE.PointLight(0x39FF14, 1.5, 20);
    ptLight.position.set(3, 4, 5);
    scene.add(ptLight);

    // Mouse parallax
    let mouseX = 0, mouseY = 0;
    function onMouseMove(e) {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = -(e.clientY / window.innerHeight - 0.5) * 2;
    }
    window.addEventListener('mousemove', onMouseMove);

    // Resize
    function onResize() {
      const W2 = container.clientWidth, H2 = container.clientHeight;
      renderer.setSize(W2, H2);
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', onResize);

    // Animate
    let t = 0;
    function animate() {
      if (!isLoginVisible) return;
      threeAnimFrame = requestAnimationFrame(animate);
      t += 0.008;

      dome.rotation.y += 0.002;
      dome.rotation.x += 0.001;
      wire.rotation.y = dome.rotation.y;
      wire.rotation.x = dome.rotation.x;
      ring.rotation.y += 0.003;

      // Mouse parallax on camera
      camera.position.x += (mouseX * 1.2 - camera.position.x) * 0.04;
      camera.position.y += (mouseY * 0.8 - camera.position.y) * 0.04;
      camera.lookAt(scene.position);

      // Animate bubbles
      bubbles.forEach(b => {
        b.userData.angle += b.userData.speed;
        b.position.y = b.userData.originY + Math.sin(b.userData.angle) * b.userData.amp;
        b.material.opacity = 0.35 + Math.abs(Math.sin(b.userData.angle)) * 0.50;
      });

      renderer.render(scene, camera);
    }
    animate();

    threeScene = { renderer, scene, camera, animate, cleanup: () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      if (threeAnimFrame) cancelAnimationFrame(threeAnimFrame);
      renderer.dispose();
    }};
  }

  function destroyLoginScene() {
    isLoginVisible = false;
    if (threeAnimFrame) cancelAnimationFrame(threeAnimFrame);
    if (threeScene && threeScene.cleanup) threeScene.cleanup();
    threeScene = null;
  }

  // CSS particle fallback
  function spawnCSSParticles(container) {
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('div');
      p.className = 'login-particle';
      const size = 3 + Math.random() * 6;
      p.style.cssText = `
        width: ${size}px; height: ${size}px;
        left: ${Math.random() * 100}%;
        bottom: ${Math.random() * 30}%;
        animation-duration: ${6 + Math.random() * 12}s;
        animation-delay: ${Math.random() * 8}s;
        opacity: ${0.3 + Math.random() * 0.5};
      `;
      container.appendChild(p);
    }
  }

  /* ================================================================
     4. LOGIN CARD 3D TILT
     ================================================================ */
  function initLoginCardTilt() {
    const card = document.getElementById('login-card');
    if (!card) return;

    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      const rx = -dy * 6;
      const ry = dx * 8;
      card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      card.style.setProperty('--tilt-shine-x', `${50 + dx * 30}%`);
      card.style.setProperty('--tilt-shine-y', `${50 + dy * 30}%`);
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
      card.style.setProperty('--tilt-shine-x', '50%');
      card.style.setProperty('--tilt-shine-y', '50%');
    });
  }

  /* ================================================================
     5. 3D CARD TILT (dashboard cards)
     ================================================================ */
  function initCardTilt() {
    document.addEventListener('mousemove', handleCardTilt, { passive: true });
  }

  function handleCardTilt(e) {
    const card = e.target.closest('.dash-card, .sensor-mini-card, .stat-card');
    if (!card) return;

    // Reduce motion check
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);

    card.style.setProperty('--tilt-rx', `${-dy * 3.5}deg`);
    card.style.setProperty('--tilt-ry', `${dx * 4.5}deg`);
    card.style.setProperty('--tilt-shine-x', `${50 + dx * 35}%`);
    card.style.setProperty('--tilt-shine-y', `${50 + dy * 35}%`);
    card.style.transform = `perspective(700px) rotateX(${-dy * 3.5}deg) rotateY(${dx * 4.5}deg) translateZ(4px)`;
    card.style.transition = 'none';
  }

  document.addEventListener('mouseleave', e => {
    const card = e.target.closest('.dash-card, .sensor-mini-card, .stat-card');
    if (!card) return;
    card.style.setProperty('--tilt-rx', '0deg');
    card.style.setProperty('--tilt-ry', '0deg');
    card.style.setProperty('--tilt-shine-x', '50%');
    card.style.setProperty('--tilt-shine-y', '50%');
    card.style.transform = '';
    card.style.transition = '';
  }, true);

  /* ================================================================
     6. COUNT-UP ANIMATION
     ================================================================ */
  function animateCountUp(el, target, duration = 1000) {
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = target;
      return;
    }
    const start = parseInt(el.textContent) || 0;
    const range = target - start;
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      el.textContent = Math.round(start + range * ease);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  window.uiCountUp = animateCountUp;

  // Observe stat cards and trigger count-up when they appear
  function initCountUpObserver() {
    const ids = [
      'dash-total', 'dash-online', 'dash-customers',
      'dash-access-on', 'dash-complaints',
      'stat-norm', 'stat-off', 'stat-access-on', 'stat-access-off'
    ];

    const observer = new MutationObserver(() => {
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.textContent.trim() !== '' && !el._counted) {
          const val = parseInt(el.textContent);
          if (!isNaN(val)) {
            el._counted = true;
            animateCountUp(el, val, 900);
          }
        }
      });
    });

    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        // Reset _counted when value changes via script.js
        const _origInnerText = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText');
        if (_origInnerText) {
          // We use MutationObserver on DOM changes instead
          observer.observe(el, { childList: true, subtree: true, characterData: true });
        }
      }
    });
  }

  /* ================================================================
     7. STAGGERED CARD ENTRANCE ON TAB SWITCH
     ================================================================ */
  function animateTabCards(tabId) {
    setTimeout(() => {
      const tab = document.getElementById(tabId);
      if (!tab) return;
      const cards = tab.querySelectorAll('.dash-card, .param-card, .stat-card, .sensor-mini-card, .deployment-card, .unit-card, .actuator-card');
      cards.forEach((card, i) => {
        card.classList.remove('card-animate');
        void card.offsetWidth; // force reflow
        card.style.animationDelay = `${i * 55}ms`;
        card.classList.add('card-animate');
      });
    }, 10);
  }

  // Patch switchAdminTab and switchCustomerTab
  const _origSwitchAdmin = window.switchAdminTab;
  window.switchAdminTab = function (tabId) {
    if (typeof _origSwitchAdmin === 'function') _origSwitchAdmin(tabId);
    animateTabCards(tabId);
  };

  const _origSwitchCustomer = window.switchCustomerTab;
  window.switchCustomerTab = function (tabId) {
    if (typeof _origSwitchCustomer === 'function') _origSwitchCustomer(tabId);
    animateTabCards(tabId);
    // Destroy Three.js if leaving login (not applicable here but guard)
    if (tabId !== 'login') {
      isLoginVisible = false;
    }
  };

  /* ================================================================
     8. VALUE FLASH ON LIVE DATA UPDATE
     ================================================================ */
  const LIVE_IDS = ['val-ch4','val-co2','val-ph','val-pressure','val-temp','val-hum','val-vol','val-vol-pct','val-distance'];

  function initValueFlash() {
    LIVE_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new MutationObserver(() => {
        el.classList.remove('value-flash');
        void el.offsetWidth;
        el.classList.add('value-flash');
        // Also flash parent card
        const card = el.closest('.sensor-mini-card, .param-card');
        if (card) {
          card.classList.remove('card-flash');
          void card.offsetWidth;
          card.classList.add('card-flash');
        }
      });
      obs.observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  /* ================================================================
     9. RIPPLE EFFECT ON BUTTONS
     ================================================================ */
  function initRipple() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.btn-primary, .btn-primary-small, .btn-add-unit, .login-button');
      if (!btn) return;

      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      ripple.style.cssText = `
        width: ${size}px; height: ${size}px;
        left: ${e.clientX - rect.left - size / 2}px;
        top: ${e.clientY - rect.top - size / 2}px;
      `;
      btn.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    }, { passive: true });
  }

  /* ================================================================
     10. MOBILE BOTTOM NAV BAR
     ================================================================ */
  function initMobileNav() {
    // Only inject if on admin or customer screen
    const adminScreen = document.getElementById('admin-screen');
    const custScreen = document.getElementById('customer-screen');

    // Inject mobile nav bar if not already present
    if (!document.getElementById('mobile-nav')) {
      const nav = document.createElement('nav');
      nav.id = 'mobile-nav';
      nav.setAttribute('aria-label', 'Mobile Navigation');
      document.body.appendChild(nav);
    }
  }

  function updateMobileNav(screenId) {
    const nav = document.getElementById('mobile-nav');
    if (!nav) return;

    if (screenId === 'admin') {
      nav.innerHTML = `
        <button class="mobile-nav-item active" onclick="switchAdminTab('admin-overview');updateMobileNavActive(this)">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
          <span>Overview</span>
        </button>
        <button class="mobile-nav-item" onclick="switchAdminTab('admin-deployments');updateMobileNavActive(this)">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>Deploy</span>
        </button>
        <button class="mobile-nav-item" onclick="switchAdminTab('admin-customers');renderCustomersList();updateMobileNavActive(this)">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>Customers</span>
        </button>
        <button class="mobile-nav-item" onclick="switchAdminTab('admin-complaints');updateMobileNavActive(this)">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>Chat</span>
        </button>
        <button class="mobile-nav-item" onclick="switchAdminTab('admin-settings');updateMobileNavActive(this)">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l-.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>Settings</span>
        </button>
      `;
    } else if (screenId === 'customer') {
      nav.innerHTML = `
        <button class="mobile-nav-item active" onclick="switchCustomerTab('cust-overview');renderCustomerOverview();updateMobileNavActive(this)">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
          <span>Overview</span>
        </button>
        <button class="mobile-nav-item" onclick="switchCustomerTab('cust-monitor');loadMonitorData();updateMobileNavActive(this)">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span>Monitor</span>
        </button>
        <button class="mobile-nav-item" onclick="switchCustomerTab('cust-alerts');loadCustomerAlerts();updateMobileNavActive(this)">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span>Alerts</span>
        </button>
        <button class="mobile-nav-item" onclick="switchCustomerTab('cust-reports');resetReportFilters();updateMobileNavActive(this)">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span>Reports</span>
        </button>
        <button class="mobile-nav-item" onclick="switchCustomerTab('cust-support');loadCustomerChatForUnit();updateMobileNavActive(this)">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>Support</span>
        </button>
      `;
    }
  }

  window.updateMobileNavActive = function (btn) {
    const nav = document.getElementById('mobile-nav');
    if (!nav) return;
    nav.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };

  /* ================================================================
     11. PAGE VISIBILITY — PAUSE THREE.JS WHEN TAB HIDDEN
     ================================================================ */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (threeAnimFrame) cancelAnimationFrame(threeAnimFrame);
    } else {
      if (threeScene && isLoginVisible) threeScene.animate();
    }
  });

  /* ================================================================
     12. OBSERVER FOR SCREEN TRANSITIONS (detect login vs dashboard)
     ================================================================ */
  function observeScreenTransitions() {
    const loginScreen = document.getElementById('login-screen');
    const adminScreen = document.getElementById('admin-screen');
    const custScreen = document.getElementById('customer-screen');

    const obs = new MutationObserver(mutations => {
      mutations.forEach(m => {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          const target = m.target;
          if (target.id === 'login-screen') {
            if (target.classList.contains('active')) {
              isLoginVisible = true;
              initLoginScene();
              initLoginCardTilt();
            } else {
              destroyLoginScene();
            }
          }
          if (target.id === 'admin-screen' && target.classList.contains('active')) {
            updateMobileNav('admin');
            updateChartDefaults(document.body.classList.contains('dark-theme'));
          }
          if (target.id === 'customer-screen' && target.classList.contains('active')) {
            updateMobileNav('customer');
            updateChartDefaults(document.body.classList.contains('dark-theme'));
          }
        }
      });
    });

    [loginScreen, adminScreen, custScreen].forEach(el => {
      if (el) obs.observe(el, { attributes: true });
    });
  }

  /* ================================================================
     13. TOAST NOTIFICATION HELPER (supplements triggerNotification)
     ================================================================ */
  window.uiShowToast = function (message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const types = { critical: 'toast-critical', warning: 'toast-warning', success: 'toast-success', info: '' };
    toast.className = `toast-notification ${types[type] || ''}`;

    const icons = { critical: '🚨', warning: '⚠️', success: '✅', info: 'ℹ️' };
    toast.innerHTML = `
      <span style="font-size:18px;flex-shrink:0">${icons[type] || icons.info}</span>
      <div>
        <div style="font-weight:700;font-size:13px;color:var(--text-primary)">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${message}</div>
      </div>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-hide');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
  };

  /* ================================================================
     14. SENSOR SPARKLINES (mini SVG lines in sensor cards)
     ================================================================ */
  function drawSparkline(container, values, color) {
    if (!container || !values || values.length < 2) return;
    const w = container.clientWidth || 100;
    const h = 36;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    }).join(' ');

    container.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
        <defs>
          <linearGradient id="spark-fill-${Math.random().toString(36).substr(2,5)}" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
      </svg>`;
  }
  window.uiDrawSparkline = drawSparkline;

  /* ================================================================
     15. INITIALIZATION
     ================================================================ */
  function init() {
    initTheme();
    initRipple();
    initCardTilt();
    initMobileNav();
    initValueFlash();
    initCountUpObserver();
    observeScreenTransitions();

    // Login is active on page load
    if (document.getElementById('login-screen')?.classList.contains('active')) {
      isLoginVisible = true;
      setTimeout(() => {
        initLoginScene();
        initLoginCardTilt();
      }, 100);
    }

    // Apply chart defaults after Chart.js likely loaded
    setTimeout(() => {
      updateChartDefaults(document.body.classList.contains('dark-theme'));
    }, 800);

    console.log('[BioMonitor UI] v4.0 loaded ✓');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
