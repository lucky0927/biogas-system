/**
 * BioMonitor Industrial 3D Digester Twin — twin3d.js v5.0
 * Procedural Three.js Digital Twin for SCADA Live Monitor & Overview cards.
 * Features:
 * - Cylindrical digester vessel with dome gas holder & structural ribs
 * - Process piping: feedstock inlet, gas collection line, safety relief valve
 * - Dynamic liquid slurry level driven by volume percentage
 * - Microscopic gas bubble swarm rising at rate driven by CH4 %
 * - Status-reactive neon halo: optimal (green), warning (amber), critical (red)
 * - Mouse drag rotation & silky idle orbit
 * - Page Visibility & tab teardown lifecycle (Strictly max 1 active WebGL context)
 * - Accessible static/animated isometric SVG fallback for reduced-motion/no-WebGL
 */

(function () {
  'use strict';

  let activeInstance = null;

  // Colors
  const STATUS_COLORS = {
    normal: { hex: 0x39FF14, css: '#39FF14' },
    warning: { hex: 0xF59E0B, css: '#F59E0B' },
    critical: { hex: 0xEF4444, css: '#EF4444' }
  };

  /**
   * Generates a rich isometric SVG fallback when WebGL is unavailable or reduced-motion is active.
   */
  function renderSvgFallback(container, data) {
    if (!container) return;
    const vol = Math.max(5, Math.min(95, data.volumePct || 50));
    const ch4 = data.ch4Pct || 55;
    const status = data.status || 'normal';
    const accent = STATUS_COLORS[status]?.css || '#39FF14';

    container.innerHTML = `
      <div class="twin-svg-fallback" style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;">
        <svg viewBox="0 0 240 280" width="100%" height="100%" style="max-height:240px;filter:drop-shadow(0 8px 24px rgba(0,0,0,0.35));" aria-label="Digester Module Diagram">
          <defs>
            <linearGradient id="slurryGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stop-color="${accent}" stop-opacity="0.85"/>
              <stop offset="100%" stop-color="#00A84F" stop-opacity="0.45"/>
            </linearGradient>
            <linearGradient id="vesselGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="rgba(255,255,255,0.08)"/>
              <stop offset="50%" stop-color="rgba(255,255,255,0.02)"/>
              <stop offset="100%" stop-color="rgba(0,0,0,0.4)"/>
            </linearGradient>
            <filter id="neonGlow">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          
          <!-- Digester Dome -->
          <path d="M40,90 C40,40 200,40 200,90 Z" fill="url(#vesselGrad)" stroke="${accent}" stroke-width="1.5" filter="url(#neonGlow)"/>
          
          <!-- Cylindrical Vessel Body -->
          <rect x="40" y="90" width="160" height="130" rx="8" fill="#0A1610" stroke="rgba(57,255,20,0.2)" stroke-width="1.5"/>
          <rect x="40" y="90" width="160" height="130" rx="8" fill="url(#vesselGrad)"/>
          
          <!-- Liquid Level Fill -->
          <clipPath id="vesselClip"><rect x="42" y="92" width="156" height="126" rx="6"/></clipPath>
          <g clip-path="url(#vesselClip)">
            <rect x="40" y="${220 - (vol * 1.25)}" width="160" height="${vol * 1.3}" fill="url(#slurryGrad)"/>
            <path d="M40,${220 - (vol * 1.25)} Q80,${216 - (vol * 1.25)} 120,${220 - (vol * 1.25)} T200,${220 - (vol * 1.25)}" fill="none" stroke="${accent}" stroke-width="2"/>
          </g>

          <!-- Structural Ribs -->
          <line x1="40" y1="130" x2="200" y2="130" stroke="rgba(255,255,255,0.12)" stroke-dasharray="4 4"/>
          <line x1="40" y1="170" x2="200" y2="170" stroke="rgba(255,255,255,0.12)" stroke-dasharray="4 4"/>

          <!-- Piping & Relief Valve -->
          <path d="M120,40 L120,15 L160,15 L160,28" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>
          <circle cx="160" cy="28" r="4" fill="${accent}"/>
          <path d="M25,180 L40,180" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="4" stroke-linecap="round"/>
          
          <!-- Monospace Level Badge -->
          <rect x="80" y="235" width="80" height="24" rx="12" fill="rgba(0,0,0,0.75)" stroke="${accent}" stroke-width="1"/>
          <text x="120" y="251" text-anchor="middle" fill="${accent}" font-family="monospace" font-size="11" font-weight="bold">${vol}% VOL</text>
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
      this.init();
    }

    init() {
      if (!this.container) return;

      // Reduced motion or no Three.js -> SVG Fallback
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
      this.camera.position.set(0, 1.8, 6.2);
      this.camera.lookAt(0, 0, 0);

      this.rootGroup = new THREE.Group();
      this.scene.add(this.rootGroup);

      // --- Lighting ---
      const ambient = new THREE.AmbientLight(0x0e2417, 1.2);
      this.scene.add(ambient);

      this.pointLight = new THREE.PointLight(0x39FF14, 2.5, 12);
      this.pointLight.position.set(2, 3, 3);
      this.scene.add(this.pointLight);

      this.underLight = new THREE.PointLight(0x00FF88, 1.2, 8);
      this.underLight.position.set(-2, -2, 2);
      this.scene.add(this.underLight);

      // --- Digester Base & Hull ---
      const tankGeo = new THREE.CylinderGeometry(1.4, 1.45, 2.2, 32, 1, true);
      const tankMat = new THREE.MeshPhysicalMaterial({
        color: 0x07150E,
        metalness: 0.35,
        roughness: 0.25,
        transparent: true,
        opacity: 0.85,
        reflectivity: 0.8,
        clearcoat: 0.6,
        clearcoatRoughness: 0.15
      });
      this.tankMesh = new THREE.Mesh(tankGeo, tankMat);
      this.rootGroup.add(this.tankMesh);

      // --- Dome Gas Holder ---
      const domeGeo = new THREE.SphereGeometry(1.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const domeMat = new THREE.MeshPhysicalMaterial({
        color: 0x0E2E1B,
        metalness: 0.4,
        roughness: 0.2,
        transparent: true,
        opacity: 0.75,
        wireframe: false
      });
      this.domeMesh = new THREE.Mesh(domeGeo, domeMat);
      this.domeMesh.position.y = 1.1;
      this.rootGroup.add(this.domeMesh);

      // Wireframe Accent Rings
      const ringGeo1 = new THREE.TorusGeometry(1.42, 0.02, 8, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x39FF14, transparent: true, opacity: 0.45 });
      const ring1 = new THREE.Mesh(ringGeo1, ringMat);
      ring1.rotation.x = Math.PI / 2;
      ring1.position.y = 1.1;
      this.rootGroup.add(ring1);

      const ring2 = new THREE.Mesh(ringGeo1, ringMat);
      ring2.rotation.x = Math.PI / 2;
      ring2.position.y = 0.0;
      this.rootGroup.add(ring2);

      const ring3 = new THREE.Mesh(ringGeo1, ringMat);
      ring3.rotation.x = Math.PI / 2;
      ring3.position.y = -1.1;
      this.rootGroup.add(ring3);

      // --- Slurry Liquid Column (Adjusts with Volume) ---
      const liquidGeo = new THREE.CylinderGeometry(1.36, 1.38, 2.1, 32);
      this.liquidMat = new THREE.MeshPhongMaterial({
        color: 0x0D4424,
        emissive: 0x08331A,
        transparent: true,
        opacity: 0.70,
        shininess: 90
      });
      this.liquidMesh = new THREE.Mesh(liquidGeo, this.liquidMat);
      this.liquidMesh.position.y = 0;
      this.rootGroup.add(this.liquidMesh);

      // --- Piping ---
      const pipeMat = new THREE.MeshStandardMaterial({ color: 0x244E34, metalness: 0.8, roughness: 0.3 });
      
      // Top Gas Extraction Pipe
      const topPipeGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.9, 16);
      const topPipe = new THREE.Mesh(topPipeGeo, pipeMat);
      topPipe.position.set(0, 2.7, 0);
      this.rootGroup.add(topPipe);

      // Horizontal Manifold
      const maniGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.2, 16);
      const manifold = new THREE.Mesh(maniGeo, pipeMat);
      manifold.rotation.z = Math.PI / 2;
      manifold.position.set(0.5, 3.1, 0);
      this.rootGroup.add(manifold);

      // Relief Valve Knob
      const valveGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.08, 16);
      const valveMat = new THREE.MeshBasicMaterial({ color: 0x39FF14 });
      const valve = new THREE.Mesh(valveGeo, valveMat);
      valve.position.set(1.0, 3.2, 0);
      this.rootGroup.add(valve);

      // --- Rising Gas Bubbles ---
      this.bubbleCount = 35;
      const bubbleGeo = new THREE.SphereGeometry(0.045, 8, 8);
      this.bubbleGroup = new THREE.Group();
      this.bubbles = [];

      for (let i = 0; i < this.bubbleCount; i++) {
        const bMat = new THREE.MeshBasicMaterial({
          color: 0x39FF14,
          transparent: true,
          opacity: 0.3 + Math.random() * 0.5
        });
        const b = new THREE.Mesh(bubbleGeo, bMat);
        const r = Math.random() * 1.1;
        const theta = Math.random() * Math.PI * 2;
        b.position.set(Math.cos(theta) * r, -1.0 + Math.random() * 2.0, Math.sin(theta) * r);
        b.userData = {
          baseSpeed: 0.008 + Math.random() * 0.015,
          resetY: -1.0,
          maxY: 1.0,
          driftAngle: Math.random() * Math.PI * 2
        };
        this.bubbles.push(b);
        this.bubbleGroup.add(b);
      }
      this.rootGroup.add(this.bubbleGroup);

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
      if (!this.liquidMesh || !this.pointLight) return;

      const vol = Math.max(0.05, Math.min(0.98, (this.data.volumePct || 50) / 100));
      this.liquidMesh.scale.y = vol;
      this.liquidMesh.position.y = -1.05 + (vol * 2.1) / 2;

      // Status glow
      const status = this.data.status || 'normal';
      const col = STATUS_COLORS[status]?.hex || 0x39FF14;
      this.pointLight.color.setHex(col);

      if (this.liquidMat) {
        if (status === 'critical') {
          this.liquidMat.color.setHex(0x5A1515);
          this.liquidMat.emissive.setHex(0x3A0808);
        } else if (status === 'warning') {
          this.liquidMat.color.setHex(0x543B10);
          this.liquidMat.emissive.setHex(0x3A2807);
        } else {
          this.liquidMat.color.setHex(0x0D4424);
          this.liquidMat.emissive.setHex(0x08331A);
        }
      }
    }

    animate() {
      if (this.isDestroyed) return;
      this.animId = requestAnimationFrame(() => this.animate());

      // Slow orbit
      if (this.rootGroup) {
        this.rootGroup.rotation.y += 0.0035;
      }

      // Animate gas bubbles with rate driven by CH4
      const ch4Mult = Math.max(0.4, (this.data.ch4Pct || 55) / 50);
      if (this.bubbles && this.liquidMesh) {
        const topY = this.liquidMesh.position.y + (this.liquidMesh.scale.y * 2.1) / 2;
        this.bubbles.forEach(b => {
          b.position.y += b.userData.baseSpeed * ch4Mult;
          b.position.x += Math.sin(b.userData.driftAngle += 0.02) * 0.002;
          if (b.position.y > topY) {
            b.position.y = b.userData.resetY;
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
