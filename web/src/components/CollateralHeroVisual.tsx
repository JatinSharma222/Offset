import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RiskLevel } from '../theme/risk';

interface CollateralHeroVisualProps {
  liquidationDistance: number;
  hedgeActive: boolean;
  riskLevel?: RiskLevel;
  className?: string;
}

// Risk color map for rim lights and floor highlights
const RISK_HEX_COLORS: Record<RiskLevel, number> = {
  HEALTHY: 0x4ade80,
  WARNING: 0xf5b942,
  DANGER: 0xf5793a,
  CRITICAL: 0xf0473e,
};

const RISK_CSS_COLORS: Record<RiskLevel, string> = {
  HEALTHY: '#4ADE80',
  WARNING: '#F5B942',
  DANGER: '#F5793A',
  CRITICAL: '#F0473E',
};

/**
 * Static SVG/CSS Fallback for prefers-reduced-motion or WebGL failure
 */
const StaticHeroFallback: React.FC<{
  distance: number;
  hedgeActive: boolean;
  riskLevel: RiskLevel;
}> = ({ distance, hedgeActive, riskLevel }) => {
  const riskColor = RISK_CSS_COLORS[riskLevel];
  const distancePct = (distance * 100).toFixed(1);
  // Vertical position clamped between 15% (near cliff) and 78% (healthy)
  const bottomPct = Math.min(Math.max(distance * 100 * 2.2, 14), 78);
  const hedgeBottomPct = Math.max(bottomPct - 10, 8);

  return (
    <div className="w-full h-full min-h-[260px] flex flex-col items-center justify-between p-6 relative select-none">
      <div className="flex items-center justify-between w-full max-w-lg text-xs font-mono text-text-muted z-10">
        <span className="flex items-center gap-1.5 text-text-primary font-semibold">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: riskColor }} />
          Collateral Suspension State
        </span>
        <span className="text-text-muted">
          Distance: <strong className="text-text-primary">{distancePct}%</strong>
        </span>
      </div>

      {/* Metaphor Stage */}
      <div className="w-full max-w-lg h-44 relative flex items-center justify-center my-2">
        {/* Distance measurement line */}
        <div
          className="absolute right-12 w-0.5 border-r border-dashed border-text-muted/40 transition-all duration-700"
          style={{ bottom: '8px', top: `${100 - bottomPct}%` }}
        >
          <span className="absolute top-1/2 -right-16 -translate-y-1/2 text-[10px] font-mono text-text-muted whitespace-nowrap bg-surface-1 px-1.5 py-0.5 rounded border border-surface-2">
            gap: {distancePct}%
          </span>
        </div>

        {/* Collateral Form (Floating Shape) */}
        <div
          className="absolute w-20 h-20 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-all duration-700"
          style={{ left: '50%', bottom: `${bottomPct}%` }}
        >
          {/* Ambient Glow */}
          <div
            className="absolute inset-0 rounded-2xl blur-md opacity-30 transition-colors duration-700"
            style={{ backgroundColor: riskColor }}
          />
          {/* Faceted Form */}
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-xl">
            <polygon
              points="50,10 90,50 50,90 10,50"
              fill="#28241D"
              stroke="#F3EFE7"
              strokeWidth="2.5"
            />
            <polygon points="50,10 90,50 50,50" fill="#3D372E" opacity="0.6" />
            <polygon points="50,90 90,50 50,50" fill="#1D1A15" opacity="0.8" />
            <polygon points="50,10 10,50 50,50" fill="#4A4338" opacity="0.4" />
            <polygon points="50,90 10,50 50,50" fill="#15130F" opacity="0.9" />
          </svg>
        </div>

        {/* Catching Plane (Hedge) */}
        {hedgeActive && (
          <div
            className="absolute -translate-x-1/2 w-48 h-3 rounded-full transition-all duration-700 animate-fadeIn"
            style={{
              left: '50%',
              bottom: `${hedgeBottomPct}%`,
              background: 'linear-gradient(90deg, rgba(62,124,177,0.1), rgba(62,124,177,0.85) 50%, rgba(62,124,177,0.1))',
              boxShadow: '0 0 16px rgba(62,124,177,0.6)',
            }}
          >
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold tracking-wider text-brand uppercase whitespace-nowrap bg-surface-1/90 px-2 py-0.5 rounded border border-brand/40">
              Hedge Floor Active
            </span>
          </div>
        )}

        {/* Danger Line Floor */}
        <div className="absolute bottom-2 left-4 right-4 h-2 rounded-full border-t border-b border-surface-2 bg-surface-2/40 flex items-center justify-between px-3">
          <div
            className="w-full h-0.5 transition-colors duration-700"
            style={{ backgroundColor: riskColor }}
          />
        </div>
      </div>

      <div className="flex justify-between items-center w-full max-w-lg text-[11px] font-mono text-text-muted border-t border-surface-2/80 pt-2 z-10">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-brand" />
          {hedgeActive ? 'Autonomous hedge catching collateral' : 'Position safely elevated'}
        </span>
        <span className="text-risk-critical font-medium">The danger line (liquidation floor)</span>
      </div>
    </div>
  );
};

export const CollateralHeroVisual: React.FC<CollateralHeroVisualProps> = ({
  liquidationDistance,
  hedgeActive,
  riskLevel = 'HEALTHY',
  className = '',
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hasWebGL, setHasWebGL] = useState<boolean>(true);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  // Check WebGL availability and prefers-reduced-motion
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setHasWebGL(false);
      }
    } catch {
      setHasWebGL(false);
    }

    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Three.js Scene Setup & Render Loop
  useEffect(() => {
    if (!hasWebGL || reducedMotion || !mountRef.current) return;

    const container = mountRef.current;
    let width = container.clientWidth || 600;
    let height = container.clientHeight || 280;

    // SCENE
    const scene = new THREE.Scene();

    // CAMERA
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 3.2, 8.8);
    camera.lookAt(0, 1.2, 0);

    // RENDERER
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      container.appendChild(renderer.domElement);
    } catch (e) {
      console.warn('WebGL init failed, falling back to static visual:', e);
      setHasWebGL(false);
      return;
    }

    // LIGHTING
    // Warm ambient light matching surface-0/1
    const ambientLight = new THREE.AmbientLight(0xf3efe7, 1.2);
    scene.add(ambientLight);

    // Key Light
    const keyLight = new THREE.DirectionalLight(0xfff5ea, 2.2);
    keyLight.position.set(4, 8, 5);
    scene.add(keyLight);

    // Soft Fill Light
    const fillLight = new THREE.DirectionalLight(0x28241d, 1.0);
    fillLight.position.set(-5, 2, -3);
    scene.add(fillLight);

    // Dynamic Rim Light (color shifts with risk state)
    const rimLight = new THREE.PointLight(RISK_HEX_COLORS[riskLevel], 4.5, 14);
    rimLight.position.set(0, 0.2, -3);
    scene.add(rimLight);

    // Secondary Accent Rim Light
    const bottomLight = new THREE.PointLight(RISK_HEX_COLORS[riskLevel], 2.0, 10);
    bottomLight.position.set(0, -0.5, 2);
    scene.add(bottomLight);

    // OBJECT 1: The Liquidation Floor (Danger Line)
    const floorGroup = new THREE.Group();
    scene.add(floorGroup);

    // Outer Floor Ring
    const floorRingGeo = new THREE.RingGeometry(3.4, 3.48, 64);
    floorRingGeo.rotateX(-Math.PI / 2);
    const floorRingMat = new THREE.MeshBasicMaterial({
      color: RISK_HEX_COLORS[riskLevel],
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    });
    const floorRing = new THREE.Mesh(floorRingGeo, floorRingMat);
    floorRing.position.y = 0;
    floorGroup.add(floorRing);

    // Floor Base Disc
    const floorDiscGeo = new THREE.CircleGeometry(3.4, 64);
    floorDiscGeo.rotateX(-Math.PI / 2);
    const floorDiscMat = new THREE.MeshStandardMaterial({
      color: 0x1d1a15,
      roughness: 0.85,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
    const floorDisc = new THREE.Mesh(floorDiscGeo, floorDiscMat);
    floorDisc.position.y = -0.01;
    floorGroup.add(floorDisc);

    // Subtle Radial Grid Lines on Floor
    const gridHelper = new THREE.GridHelper(6.8, 12, 0x28241d, 0x201c16);
    gridHelper.position.y = 0.005;
    floorGroup.add(gridHelper);

    // OBJECT 2: The Collateral Form (Suspended Ingot / Crystal Solid)
    const formGroup = new THREE.Group();
    scene.add(formGroup);

    // Faceted Octahedral Ingot
    const formGeo = new THREE.OctahedronGeometry(1.25, 0);
    const formMat = new THREE.MeshStandardMaterial({
      color: 0xf3efe7,
      roughness: 0.28,
      metalness: 0.65,
      flatShading: true,
    });
    const formMesh = new THREE.Mesh(formGeo, formMat);
    formGroup.add(formMesh);

    // Subtle Wireframe Accent for architectural precision
    const wireGeo = new THREE.WireframeGeometry(formGeo);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x9c9284,
      transparent: true,
      opacity: 0.35,
    });
    const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    formMesh.add(wireMesh);

    // OBJECT 3: The Hedge Catching Plane (Translucent Brand Blue Disc)
    const hedgeGeo = new THREE.CylinderGeometry(2.2, 2.2, 0.06, 48);
    const hedgeMat = new THREE.MeshStandardMaterial({
      color: 0x3e7cb1,
      roughness: 0.2,
      metalness: 0.2,
      transparent: true,
      opacity: 0, // Starts at 0, smoothly animates in
    });
    const hedgeMesh = new THREE.Mesh(hedgeGeo, hedgeMat);
    hedgeMesh.position.y = 0.8;
    scene.add(hedgeMesh);

    // Glowing Rim for Hedge Catching Plane
    const hedgeRingGeo = new THREE.RingGeometry(2.18, 2.24, 48);
    hedgeRingGeo.rotateX(-Math.PI / 2);
    const hedgeRingMat = new THREE.MeshBasicMaterial({
      color: 0x3e7cb1,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const hedgeRing = new THREE.Mesh(hedgeRingGeo, hedgeRingMat);
    hedgeRing.position.y = 0.035;
    hedgeMesh.add(hedgeRing);

    // Mouse Parallax tracking
    let targetCameraX = 0;
    let targetCameraY = 3.2;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const normY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetCameraX = normX * 0.8;
      targetCameraY = 3.2 + normY * 0.4;
    };
    container.addEventListener('mousemove', handleMouseMove);

    // Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    // Target parameters updated each frame
    let animId: number;
    let currentY = 2.4;
    let currentHedgeOpacity = 0;
    let currentHedgeScale = 0.4;
    const currentRimColor = new THREE.Color(RISK_HEX_COLORS[riskLevel]);

    const render = () => {
      animId = requestAnimationFrame(render);

      // 1. Calculate Target Form Height from liquidation distance
      // Distance ranges roughly 0.02 (cliff) to 0.30+ (healthy)
      // Map to 3D Y coordinates: Cliff = 0.65, Healthy = 2.6
      const clampedDist = Math.max(0.02, Math.min(liquidationDistance, 0.3));
      const targetY = 0.65 + (clampedDist / 0.3) * 1.95;
      currentY += (targetY - currentY) * 0.07;
      formGroup.position.y = currentY;

      // Gentle ambient drift and rotation of collateral form
      formMesh.rotation.y += 0.007;
      formMesh.rotation.x = Math.sin(Date.now() * 0.001) * 0.12;

      // 2. Catching Plane (Hedge) Animation
      const targetOpacity = hedgeActive ? 0.72 : 0;
      const targetScale = hedgeActive ? 1.0 : 0.4;
      currentHedgeOpacity += (targetOpacity - currentHedgeOpacity) * 0.08;
      currentHedgeScale += (targetScale - currentHedgeScale) * 0.08;

      hedgeMat.opacity = currentHedgeOpacity;
      hedgeRingMat.opacity = currentHedgeOpacity * 1.2;
      hedgeMesh.scale.set(currentHedgeScale, 1, currentHedgeScale);
      // Keep catching plane positioned safely beneath the form
      hedgeMesh.position.y = Math.max(currentY - 0.75, 0.25);
      hedgeMesh.rotation.y -= 0.004;

      // 3. Smooth Rim Light & Floor Ring Color Transition
      const targetColorHex = RISK_HEX_COLORS[riskLevel];
      currentRimColor.lerp(new THREE.Color(targetColorHex), 0.08);
      rimLight.color.copy(currentRimColor);
      bottomLight.color.copy(currentRimColor);
      floorRingMat.color.copy(currentRimColor);

      // Floor ring opacity pulses slightly if in danger/critical
      if (riskLevel === 'CRITICAL') {
        floorRingMat.opacity = 0.8 + Math.sin(Date.now() * 0.006) * 0.2;
      } else if (riskLevel === 'DANGER') {
        floorRingMat.opacity = 0.65 + Math.sin(Date.now() * 0.004) * 0.15;
      } else {
        floorRingMat.opacity = 0.45;
      }

      // 4. Smooth Camera Mouse Parallax
      camera.position.x += (targetCameraX - camera.position.x) * 0.05;
      camera.position.y += (targetCameraY - camera.position.y) * 0.05;
      camera.lookAt(0, 1.1, 0);

      renderer.render(scene, camera);
    };

    render();

    // CLEANUP
    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener('mousemove', handleMouseMove);
      resizeObserver.disconnect();
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      scene.clear();
      renderer.dispose();
      formGeo.dispose();
      formMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      floorRingGeo.dispose();
      floorRingMat.dispose();
      floorDiscGeo.dispose();
      floorDiscMat.dispose();
      hedgeGeo.dispose();
      hedgeMat.dispose();
      hedgeRingGeo.dispose();
      hedgeRingMat.dispose();
    };
  }, [hasWebGL, reducedMotion, liquidationDistance, hedgeActive, riskLevel]);

  return (
    <div
      className={`w-full bg-surface-0 border border-surface-2 rounded-xl relative overflow-hidden min-h-[260px] flex items-center justify-center ${className}`}
    >
      {/* 3D Scene Viewport or Static Fallback */}
      {hasWebGL && !reducedMotion ? (
        <div ref={mountRef} className="w-full h-full min-h-[260px] relative cursor-grab active:cursor-grabbing">
          {/* Subtle overlay status badges */}
          <div className="absolute top-4 left-5 right-5 flex justify-between items-center text-xs font-mono pointer-events-none z-10">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-1/90 border border-surface-2 text-text-primary backdrop-blur-sm">
              <span
                className="w-2 h-2 rounded-full transition-colors duration-500"
                style={{ backgroundColor: RISK_CSS_COLORS[riskLevel] }}
              />
              Collateral Elevation Metaphor
            </span>
            <span className="px-2 py-0.5 rounded bg-surface-1/90 border border-surface-2 text-text-muted backdrop-blur-sm">
              gap: <strong className="text-text-primary">{(liquidationDistance * 100).toFixed(1)}%</strong>
            </span>
          </div>

          <div className="absolute bottom-3 left-5 right-5 flex justify-between items-center text-[11px] font-mono text-text-muted pointer-events-none z-10">
            <span>
              {hedgeActive ? (
                <span className="text-brand font-semibold">● Protective hedge floor active</span>
              ) : (
                <span>● Collateral safely elevated above floor</span>
              )}
            </span>
            <span className="text-risk-critical">The danger line (liquidation floor)</span>
          </div>
        </div>
      ) : (
        <StaticHeroFallback
          distance={liquidationDistance}
          hedgeActive={hedgeActive}
          riskLevel={riskLevel}
        />
      )}
    </div>
  );
};
