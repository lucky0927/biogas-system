/**
 * BioMonitor Industrial 3D Digester Twin — twin3d.js v5.1
 * Procedural Three.js Digital Twin for SCADA Live Monitor & Overview cards.
 * Features:
 * - Ultra-clear borosilicate glass vessel & dome with specular rim highlights & structural ribs
 * - Deep organic biomass digestate slurry column dynamically scaled by volume %
 * - Luminous glowing liquid meniscus ring & surface separating liquid from gas
 * - Dedicated luminous Biogas Headspace & Dome cloud with living volumetric breathing glow
 * - Two-phase bubble & gas particle dynamics:
 *     1. Micro-fermentation bubbles rising through liquid substrate
 *     2. Floating, swirling Methane (CH4) & CO2 gas molecules drifting up into collection pipe
 * - Gas luminescence & core volumetric lighting scaled dynamically by CH4 % and System Status
 * - Interactive mouse/touch drag rotation & silky idle orbit
 * - Max 1 active WebGL context lifecycle management
 * - Accessible SVG fallback for reduced-motion/no-WebGL
 */

(function () {
  'use strict';

  let activeInstance = null;

  // Status Palette
  const STATUS_COLORS = {
    normal: {
      gasHex: 0x39FF14,       // Electric Neon Green
      gasEmissive: 0x39FF14,  // Pure Neon Green Glow
      gasInner: 0x00FF66,     // Inner core neon emerald
      slurryHex: 0x04180D,    // Deep Organic Biomass (high contrast against neon gas)
      lightHex: 0x39FF14,     // Pure Neon Point Light
      css: '#39FF14'
    },
    warning: {
      gasHex: 0xF59E0B,       // Amber Gas
      gasEmissive: 0xF59E0B,
      gasInner: 0xFBBF24,
      slurryHex: 0x2A1D0B,
      lightHex: 0xF59E0B,
      css: '#F59E0B'
    },
    critical: {
      gasHex: 0xEF4444,       // Warning Red Gas
      gasEmissive: 0xEF4444,
      gasInner: 0xF87171,
      slurryHex: 0x2D0D0D,
      lightHex: 0xEF4444,
      css: '#EF4444'
    }
  };

  /**
   * Generates a rich isometric SVG fallback when WebGL is unavailable or reduced-motion is active.
   */
  function renderSvgFallback(container, data) {
    if (!container) return;
    const vol = Math.max(8, Math.min(92, data.volumePct || 50));
    const ch4 = data.ch4Pct || 60;
    const status = data.status || 'normal';
    const cfg = STATUS_COLORS[status] || STATUS_COLORS.normal;
    const accent = cfg.css;
    const liquidTopY = 220 - (vol * 1.3);

    container.innerHTML = `
      <div class="twin-svg-fallback" style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;">
        <svg viewBox="0 0 240 280" width="100%" height="100%" style="max-height:240px;filter:drop-shadow(0 8px 24px rgba(0,0,0,0.45));" aria-label="Digester Module Diagram">
          <defs>
            <linearGradient id="slurryGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stop-color="#04180D" stop-opacity="0.95"/>
              <stop offset="100%" stop-color="#0A2C17" stop-opacity="0.90"/>
            </linearGradient>
            <linearGradient id="biogasGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stop-color="#39FF14" stop-opacity="0.55"/>
              <stop offset="40%" stop-color="#00FF66" stop-opacity="0.80"/>
              <stop offset="100%" stop-color="#39FF14" stop-opacity="0.95"/>
            </linearGradient>
            <linearGradient id="glassSheen" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="rgba(255,255,255,0.15)"/>
              <stop offset="30%" stop-color="rgba(255,255,255,0.02)"/>
              <stop offset="85%" stop-color="rgba(255,255,255,0.08)"/>
              <stop offset="100%" stop-color="rgba(0,0,0,0.5)"/>
            </linearGradient>
            <filter id="neonGlow">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          
          <!-- Outer Glass Vessel Outline -->
          <rect x="40" y="90" width="160" height="130" rx="8" fill="#05100A" stroke="rgba(57,255,20,0.25)" stroke-width="1.5"/>
          <path d="M40,90 C40,35 200,35 200,90 Z" fill="rgba(6,25,15,0.6)" stroke="${accent}" stroke-width="1.5" filter="url(#neonGlow)"/>

          <!-- Biogas Headspace & Dome Fill -->
          <path d="M40,90 C40,35 200,35 200,90 L200,${liquidTopY} L40,${liquidTopY} Z" fill="url(#biogasGrad)"/>
          
          <!-- Liquid Slurry Fill (Bottom) -->
          <rect x="42" y="${liquidTopY}" width="156" height="${220 - liquidTopY}" fill="url(#slurryGrad)"/>

          <!-- Glowing Meniscus Level Divider -->
          <line x1="40" y1="${liquidTopY}" x2="200" y2="${liquidTopY}" stroke="${accent}" stroke-width="2.5" filter="url(#neonGlow)"/>

          <!-- Rising Gas Bubbles in Headspace -->
          <circle cx="80" cy="${liquidTopY - 20}" r="3" fill="${accent}" opacity="0.8"/>
          <circle cx="120" cy="${liquidTopY - 35}" r="4" fill="${accent}" opacity="0.9" filter="url(#neonGlow)"/>
          <circle cx="150" cy="${liquidTopY - 18}" r="2.5" fill="#38BDF8" opacity="0.8"/>
          <circle cx="100" cy="65" r="3.5" fill="${accent}" opacity="0.85"/>
          <circle cx="130" cy="50" r="3" fill="#FDE047" opacity="0.75"/>

          <!-- Structural Ribs -->
          <line x1="40" y1="130" x2="200" y2="130" stroke="rgba(57,255,20,0.3)" stroke-dasharray="4 4"/>
          <line x1="40" y1="170" x2="200" y2="170" stroke="rgba(57,255,20,0.3)" stroke-dasharray="4 4"/>

          <!-- Glass Highlights -->
          <rect x="40" y="90" width="160" height="130" rx="8" fill="url(#glassSheen)" pointer-events="none"/>

          <!-- Piping & Relief Valve -->
          <path d="M120,40 L120,15 L160,15 L160,28" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>
          <circle cx="160" cy="28" r="4" fill="${accent}"/>
          <path d="M25,180 L40,180" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="4" stroke-linecap="round"/>
          
          <!-- Monospace Level Badge -->
          <rect x="75" y="235" width="90" height="24" rx="12" fill="rgba(0,0,0,0.85)" stroke="${accent}" stroke-width="1"/>
          <text x="120" y="251" text-anchor="middle" fill="${accent}" font-family="monospace" font-size="11" font-weight="bold">${vol}% VOL | ${ch4}% CH4</text>
        </svg>
      </div>
    `;
  }

  class DigesterTwin {
    constructor(container, options = {}) {
      this.container = typeof container === 'string' ? document.getElementById(container) : container;
      this.options = Object.assign({
        width: this.container ? this.container.clientWidth : 300,
        height: this.container ? this.container.clientHeight : 300,
        interactive: true,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      }, options);

      this.data = {
        volumePct: 50,
        ch4Pct: 60,
        status: 'normal',
        temperature: 37,
        pressure: 1.15
      };

      this.animId = null;
      this.isDestroyed = false;
      this.time = 0;
      this.init();
    }

    init() {
      if (!this.container) return;

      if (this.options.reducedMotion || typeof THREE === 'undefined') {
        renderSvgFallback(this.container, this.data);
        return;
      }

      try {
        const testCanvas = document.createElement('canvas');
        const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
        if (!gl) throw new Error('No WebGL');
      } catch (e) {
        renderSvgFallback(this.container, this.data);
        return;
      }

      this.setupThree();
    }

    setupThree() {
      const W = Math.max(100, this.container.clientWidth || this.options.width);
      const H = Math.max(100, this.container.clientHeight || this.options.height);

      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      this.renderer.setSize(W, H);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.container.innerHTML = '';
      this.container.appendChild(this.renderer.domElement);

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
      this.camera.position.set(0, 1.2, 5.8);
      this.camera.lookAt(0, 0.35, 0);

      this.rootGroup = new THREE.Group();
      this.scene.add(this.rootGroup);

      // --- Lighting ---
      const ambient = new THREE.AmbientLight(0x133825, 2.2);
      this.scene.add(ambient);

      // Core internal neon gas light (radiates outward from INSIDE the gas dome!)
      this.coreGasLight = new THREE.PointLight(0x39FF14, 4.5, 8.0);
      this.coreGasLight.position.set(0, 1.3, 0);
      this.rootGroup.add(this.coreGasLight);

      // Key specular directional light for glass rim highlights
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
      dirLight.position.set(2.5, 4.0, 3.5);
      this.scene.add(dirLight);

      // Under-glow light
      this.underLight = new THREE.PointLight(0x00FF88, 1.5, 6.0);
      this.underLight.position.set(-2, -1.8, 1.5);
      this.scene.add(this.underLight);

      // ==========================================
      // 1. SLURRY LIQUID COLUMN (Bottom Substrate)
      // ==========================================
      // Base cylinder has radius 1.36, unit height 1.0 (scaled via scale.y)
      const liquidGeo = new THREE.CylinderGeometry(1.36, 1.38, 1.0, 32);
      this.liquidMat = new THREE.MeshStandardMaterial({
        color: 0x04180D,      // Deep rich organic biomass substrate
        roughness: 0.50,
        metalness: 0.15,
        transparent: true,
        opacity: 0.88,
        emissive: 0x011008
      });
      this.liquidMesh = new THREE.Mesh(liquidGeo, this.liquidMat);
      this.rootGroup.add(this.liquidMesh);

      // Glowing liquid meniscus surface disk
      const meniscusGeo = new THREE.CircleGeometry(1.36, 32);
      this.meniscusMat = new THREE.MeshBasicMaterial({
        color: 0x39FF14,
        transparent: true,
        opacity: 0.90,
        side: THREE.DoubleSide
      });
      this.meniscusMesh = new THREE.Mesh(meniscusGeo, this.meniscusMat);
      this.meniscusMesh.rotation.x = -Math.PI / 2;
      this.rootGroup.add(this.meniscusMesh);

      // Glowing meniscus boundary ring
      const ringGeoMeniscus = new THREE.RingGeometry(1.33, 1.38, 32);
      const ringMatMeniscus = new THREE.MeshBasicMaterial({
        color: 0x39FF14,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95
      });
      this.meniscusRingMesh = new THREE.Mesh(ringGeoMeniscus, ringMatMeniscus);
      this.meniscusRingMesh.rotation.x = -Math.PI / 2;
      this.rootGroup.add(this.meniscusRingMesh);

      // ==========================================
      // 2. BIOGAS CHAMBER (Headspace & Dome Cloud)
      // ==========================================
      // Luminous neon green gas cloud in cylinder headspace above slurry
      const gasCylGeo = new THREE.CylinderGeometry(1.35, 1.36, 1.0, 32);
      this.gasMat = new THREE.MeshPhongMaterial({
        color: 0x39FF14,          // Pure Electric Neon Green
        emissive: 0x39FF14,       // Pure Neon Green Radiance
        emissiveIntensity: 0.95,
        transparent: true,
        opacity: 0.62,            // Rich, clearly visible, vibrant neon green gas
        shininess: 90,
        depthWrite: false,
        side: THREE.FrontSide
      });
      this.gasCylinderMesh = new THREE.Mesh(gasCylGeo, this.gasMat);
      this.rootGroup.add(this.gasCylinderMesh);

      // Luminous neon green gas cloud filling the top dome
      const gasDomeGeo = new THREE.SphereGeometry(1.34, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      this.gasDomeMesh = new THREE.Mesh(gasDomeGeo, this.gasMat);
      this.gasDomeMesh.position.y = 1.1;
      this.rootGroup.add(this.gasDomeMesh);

      // Volumetric Core: Concentrated neon green center inside the gas dome
      const innerCoreGeo = new THREE.SphereGeometry(1.18, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      this.innerCoreMat = new THREE.MeshBasicMaterial({
        color: 0x00FF66,
        transparent: true,
        opacity: 0.40,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide
      });
      this.gasCoreMesh = new THREE.Mesh(innerCoreGeo, this.innerCoreMat);
      this.gasCoreMesh.position.y = 1.1;
      this.rootGroup.add(this.gasCoreMesh);

      // ==========================================
      // 3. CRYSTAL-CLEAR OUTER GLASS VESSEL & DOME
      // ==========================================
      const tankGeo = new THREE.CylinderGeometry(1.4, 1.44, 2.2, 36, 1, true);
      const tankMat = new THREE.MeshPhysicalMaterial({
        color: 0x99FFAA,         // Crystal clear with faint neon mint edge sheen
        metalness: 0.05,
        roughness: 0.04,
        transparent: true,
        opacity: 0.12,           // Crystal clear glass so the inner neon green glows brilliantly
        reflectivity: 0.95,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        depthWrite: false,
        side: THREE.FrontSide
      });
      this.tankMesh = new THREE.Mesh(tankGeo, tankMat);
      this.rootGroup.add(this.tankMesh);

      const domeGeo = new THREE.SphereGeometry(1.4, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2);
      const domeMat = new THREE.MeshPhysicalMaterial({
        color: 0x99FFAA,
        metalness: 0.05,
        roughness: 0.04,
        transparent: true,
        opacity: 0.14,           // Crystal clear dome glass
        reflectivity: 0.95,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        depthWrite: false,
        side: THREE.FrontSide
      });
      this.domeMesh = new THREE.Mesh(domeGeo, domeMat);
      this.domeMesh.position.y = 1.1;
      this.rootGroup.add(this.domeMesh);

      // Structural Neon Accent Rings around vessel
      const ringGeo = new THREE.TorusGeometry(1.42, 0.018, 8, 36);
      this.ringMat = new THREE.MeshBasicMaterial({ color: 0x39FF14, transparent: true, opacity: 0.60 });
      
      const rTop = new THREE.Mesh(ringGeo, this.ringMat);
      rTop.rotation.x = Math.PI / 2;
      rTop.position.y = 1.1;
      this.rootGroup.add(rTop);

      const rMid = new THREE.Mesh(ringGeo, this.ringMat);
      rMid.rotation.x = Math.PI / 2;
      rMid.position.y = 0.0;
      this.rootGroup.add(rMid);

      const rBottom = new THREE.Mesh(ringGeo, this.ringMat);
      rBottom.rotation.x = Math.PI / 2;
      rBottom.position.y = -1.1;
      this.rootGroup.add(rBottom);

      // ==========================================
      // 4. PROCESS PIPING & VALVES
      // ==========================================
      const pipeMat = new THREE.MeshStandardMaterial({ color: 0x335C43, metalness: 0.85, roughness: 0.25 });
      
      // Top Gas Extraction Pipe (exiting the dome apex)
      const topPipeGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.9, 16);
      const topPipe = new THREE.Mesh(topPipeGeo, pipeMat);
      topPipe.position.set(0, 2.7, 0);
      this.rootGroup.add(topPipe);

      // Horizontal Gas Header Manifold
      const maniGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.3, 16);
      const manifold = new THREE.Mesh(maniGeo, pipeMat);
      manifold.rotation.z = Math.PI / 2;
      manifold.position.set(0.55, 3.1, 0);
      this.rootGroup.add(manifold);

      // Pressure Relief Valve
      const valveGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.08, 16);
      this.valveMat = new THREE.MeshBasicMaterial({ color: 0x39FF14 });
      const valve = new THREE.Mesh(valveGeo, this.valveMat);
      valve.position.set(1.15, 3.2, 0);
      this.rootGroup.add(valve);

      // Side Feedstock Inlet Pipe (into slurry)
      const inletGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.6, 16);
      const inlet = new THREE.Mesh(inletGeo, pipeMat);
      inlet.rotation.z = Math.PI / 3;
      inlet.position.set(-1.45, -0.6, 0);
      this.rootGroup.add(inlet);

      // ==========================================
      // 5. TWO-PHASE PARTICLES: SLURRY & BIOGAS
      // ==========================================
      // (A) Slurry micro-fermentation bubbles
      this.slurryBubbles = [];
      const sBubbleGeo = new THREE.SphereGeometry(0.035, 8, 8);
      const sBubbleMat = new THREE.MeshBasicMaterial({ color: 0x86EFAC, transparent: true, opacity: 0.75 });
      for (let i = 0; i < 20; i++) {
        const b = new THREE.Mesh(sBubbleGeo, sBubbleMat);
        const r = Math.random() * 1.05;
        const theta = Math.random() * Math.PI * 2;
        b.position.set(Math.cos(theta) * r, -1.0 + Math.random() * 1.0, Math.sin(theta) * r);
        b.userData = {
          speed: 0.006 + Math.random() * 0.012,
          radius: r,
          angle: theta,
          wobbleSpeed: 0.02 + Math.random() * 0.03
        };
        this.slurryBubbles.push(b);
        this.rootGroup.add(b);
      }

      // (B) Floating, swirling Biogas Molecules in the Headspace & Dome
      this.gasMolecules = [];
      const gMolGeo = new THREE.SphereGeometry(0.05, 8, 8);
      const ch4Mat = new THREE.MeshBasicMaterial({ color: 0x39FF14, transparent: true, opacity: 0.90 }); // Methane
      const co2Mat = new THREE.MeshBasicMaterial({ color: 0x38BDF8, transparent: true, opacity: 0.80 }); // CO2 sparkle
      const steamMat = new THREE.MeshBasicMaterial({ color: 0xFDE047, transparent: true, opacity: 0.75 }); // Vapor trace

      for (let i = 0; i < 45; i++) {
        let mat = ch4Mat;
        if (i % 3 === 0) mat = co2Mat;
        else if (i % 7 === 0) mat = steamMat;

        const m = new THREE.Mesh(gMolGeo, mat);
        const r = Math.random() * 1.1;
        const theta = Math.random() * Math.PI * 2;
        const y = 0.0 + Math.random() * 2.2;
        m.position.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
        m.userData = {
          speedY: 0.007 + Math.random() * 0.015,
          vortexRate: (Math.random() - 0.5) * 0.04,
          radialDist: r,
          angle: theta,
          scaleBase: 0.7 + Math.random() * 0.6
        };
        this.gasMolecules.push(m);
        this.rootGroup.add(m);
      }

      // Interaction
      this.setupInteraction();
      this.updateMeshMetrics();
      this.animate();
    }

    setupInteraction() {
      let isDragging = false;
      let prevMouseX = 0;

      this.onMouseDown = (e) => {
        isDragging = true;
        prevMouseX = e.clientX;
      };

      this.onMouseMove = (e) => {
        if (!isDragging || !this.rootGroup) return;
        const delta = e.clientX - prevMouseX;
        this.rootGroup.rotation.y += delta * 0.008;
        prevMouseX = e.clientX;
      };

      this.onMouseUp = () => { isDragging = false; };

      const el = this.renderer.domElement;
      el.addEventListener('mousedown', this.onMouseDown);
      window.addEventListener('mousemove', this.onMouseMove);
      window.addEventListener('mouseup', this.onMouseUp);

      // Touch events
      el.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          isDragging = true;
          prevMouseX = e.touches[0].clientX;
        }
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        if (!isDragging || !this.rootGroup || e.touches.length !== 1) return;
        const delta = e.touches[0].clientX - prevMouseX;
        this.rootGroup.rotation.y += delta * 0.008;
        prevMouseX = e.touches[0].clientX;
      }, { passive: true });

      window.addEventListener('touchend', () => { isDragging = false; });

      // Resize
      this.onResize = () => {
        if (!this.container || !this.renderer || !this.camera) return;
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (w === 0 || h === 0) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
      };
      window.addEventListener('resize', this.onResize);
    }

    updateData(newData) {
      Object.assign(this.data, newData);
      this.updateMeshMetrics();
    }

    updateMeshMetrics() {
      if (!this.liquidMesh || !this.meniscusMesh || !this.gasCylinderMesh) return;

      const vol = Math.max(0.08, Math.min(0.92, (this.data.volumePct || 50) / 100));
      const totalH = 2.2;
      const liquidHeight = totalH * vol;
      const bottomY = -1.1;
      const meniscusY = bottomY + liquidHeight;

      // 1. Position Liquid Mesh
      this.liquidMesh.scale.set(1, liquidHeight, 1);
      this.liquidMesh.position.set(0, bottomY + liquidHeight / 2, 0);

      // 2. Position Meniscus Disk & Ring
      this.meniscusMesh.position.y = meniscusY;
      this.meniscusRingMesh.position.y = meniscusY + 0.005;

      // 3. Position Gas Headspace Cylinder
      const gasCylHeight = Math.max(0.01, 1.1 - meniscusY);
      this.gasCylinderMesh.scale.set(1, gasCylHeight, 1);
      this.gasCylinderMesh.position.set(0, meniscusY + gasCylHeight / 2, 0);

      // 4. Update Colors based on Status & CH4 %
      const status = this.data.status || 'normal';
      const cfg = STATUS_COLORS[status] || STATUS_COLORS.normal;

      if (this.liquidMat) {
        this.liquidMat.color.setHex(cfg.slurryHex);
      }

      if (this.gasMat) {
        this.gasMat.color.setHex(cfg.gasHex);
        this.gasMat.emissive.setHex(cfg.gasEmissive);
        // Rich vibrant emissive glow
        const ch4Ratio = Math.max(0.7, (this.data.ch4Pct || 60) / 70);
        this.gasMat.emissiveIntensity = 0.95 * ch4Ratio;
      }

      if (this.innerCoreMat) {
        this.innerCoreMat.color.setHex(cfg.gasInner || cfg.gasHex);
      }

      if (this.coreGasLight) {
        this.coreGasLight.color.setHex(cfg.lightHex);
        this.coreGasLight.position.y = Math.min(2.0, Math.max(1.1, meniscusY + 0.5));
      }

      if (this.meniscusMat) {
        this.meniscusMat.color.setHex(cfg.gasHex);
      }
      if (this.ringMat) {
        this.ringMat.color.setHex(cfg.gasHex);
      }
      if (this.valveMat) {
        this.valveMat.color.setHex(cfg.gasHex);
      }
    }

    animate() {
      if (this.isDestroyed) return;
      this.animId = requestAnimationFrame(() => this.animate());

      this.time += 0.02;

      // Slow silky orbit
      if (this.rootGroup) {
        this.rootGroup.rotation.y += 0.0035;
      }

      // Living Biogas volumetric breathing pulse
      if (this.gasMat) {
        const pulse = Math.sin(this.time * 2.2) * 0.04;
        this.gasMat.opacity = 0.62 + pulse;
      }
      if (this.innerCoreMat) {
        const corePulse = Math.sin(this.time * 2.8) * 0.05;
        this.innerCoreMat.opacity = 0.40 + corePulse;
      }

      // Meniscus calculation for particles
      const vol = Math.max(0.08, Math.min(0.92, (this.data.volumePct || 50) / 100));
      const bottomY = -1.1;
      const meniscusY = bottomY + (2.2 * vol);
      const ch4Mult = Math.max(0.5, (this.data.ch4Pct || 55) / 50);

      // Animate Slurry Bubbles (inside liquid substrate)
      if (this.slurryBubbles) {
        this.slurryBubbles.forEach(b => {
          b.position.y += b.userData.speed * ch4Mult;
          b.userData.angle += b.userData.wobbleSpeed;
          b.position.x = Math.cos(b.userData.angle) * b.userData.radius;
          b.position.z = Math.sin(b.userData.angle) * b.userData.radius;
          if (b.position.y >= meniscusY) {
            b.position.y = bottomY + Math.random() * 0.15;
          }
        });
      }

      // Animate Gas Molecules (swirling upwards into collection pipe)
      if (this.gasMolecules) {
        this.gasMolecules.forEach(m => {
          m.position.y += m.userData.speedY * ch4Mult;
          m.userData.angle += m.userData.vortexRate;
          
          // Funnel inward as particles approach the top apex
          const heightRatio = Math.max(0, (m.position.y - 1.1) / 1.4);
          const currentRadius = m.userData.radialDist * (1.0 - heightRatio * 0.85);

          m.position.x = Math.cos(m.userData.angle) * currentRadius;
          m.position.z = Math.sin(m.userData.angle) * currentRadius;

          // Pulse scale
          const s = m.userData.scaleBase * (1.0 + Math.sin(this.time * 3 + m.position.y) * 0.2);
          m.scale.set(s, s, s);

          // Reset when reaching top manifold
          if (m.position.y > 2.45) {
            m.position.y = meniscusY + 0.05 + Math.random() * 0.1;
          }
        });
      }

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    }

    destroy() {
      this.isDestroyed = true;
      if (this.animId) cancelAnimationFrame(this.animId);

      window.removeEventListener('mousemove', this.onMouseMove);
      window.removeEventListener('mouseup', this.onMouseUp);
      window.removeEventListener('resize', this.onResize);

      if (this.scene) {
        this.scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
          }
        });
      }

      if (this.renderer) {
        this.renderer.dispose();
        if (this.renderer.domElement && this.renderer.domElement.parentNode) {
          this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
      }

      this.scene = null;
      this.camera = null;
      this.renderer = null;
    }
  }

  // Global Controller
  window.initDigesterTwin = function (containerId, options) {
    if (activeInstance) {
      activeInstance.destroy();
      activeInstance = null;
    }
    const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!container) return null;
    activeInstance = new DigesterTwin(container, options);
    return activeInstance;
  };

  window.updateDigesterTwinData = function (data) {
    if (activeInstance) {
      activeInstance.updateData(data);
    }
  };

  window.destroyDigesterTwin = function () {
    if (activeInstance) {
      activeInstance.destroy();
      activeInstance = null;
    }
  };

  // Pause on visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (activeInstance && activeInstance.animId) {
        cancelAnimationFrame(activeInstance.animId);
      }
    } else {
      if (activeInstance && !activeInstance.isDestroyed) {
        activeInstance.animate();
      }
    }
  });
})();
