import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { THEME } from '../types.ts';

interface Props {
  isMuted: boolean;
}

// --- ENVIRONMENT SHADERS ---
const snowVertexShader = `
  uniform float uTime;
  attribute float aAlpha;
  attribute float aScale;
  attribute vec3 aOffset;
  varying float vAlpha;

  void main() {
    vAlpha = aAlpha;
    vec3 pos = position;
    
    // Gentle drift
    float dx = sin(uTime * 0.1 + pos.y * 0.05 + aOffset.x) * 2.0;
    float dy = cos(uTime * 0.15 + pos.x * 0.05 + aOffset.y) * 2.0;
    float dz = sin(uTime * 0.05 + pos.z * 0.05 + aOffset.z) * 2.0;
    
    pos += vec3(dx, dy, dz);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aScale * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const snowFragmentShader = `
  varying float vAlpha;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    if (dot(coord, coord) > 0.25) discard;
    gl_FragColor = vec4(1.0, 1.0, 1.0, vAlpha * 0.4); 
  }
`;

const schoolVertexShader = `
  uniform float uTime;
  attribute float aSpeed;
  attribute float aSize;
  varying float vAlpha;
  
  void main() {
    vAlpha = 0.8;
    vec3 pos = position;
    float t = uTime * aSpeed;
    // Organic swarming motion
    pos.x += sin(t + pos.z) * 0.5;
    pos.y += cos(t * 1.3 + pos.x) * 0.3;
    pos.z += sin(t * 0.7 + pos.y) * 0.5;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aSize * (400.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const schoolFragmentShader = `
  varying float vAlpha;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    if (dot(coord, coord) > 0.25) discard;
    // Data blue/cyan color
    gl_FragColor = vec4(0.8, 0.9, 1.0, vAlpha);
  }
`;

// --- SQUID SHADERS ---
const squidVertexShader = `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uHover;
  uniform float uTurn; // Agitation from turning magnitude
  attribute float aSize;
  attribute float aColorMix;
  attribute float aBodyPart; // 0: Mantle, 1: Fins, 2: Tentacles, 3: Skirt
  varying float vColorMix;
  varying float vAgitation;

  // 3D Value Noise for organic turbulence
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float noise(vec3 x) {
      vec3 p = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      float n = p.x + p.y * 57.0 + p.z * 113.0;
      return mix(mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
                     mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
                 mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
                     mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y), f.z);
  }

  void main() {
    vColorMix = aColorMix;
    
    // Agitation increases with speed, hover, and turning
    vAgitation = uHover + max(0.0, uSpeed - 1.2) + uTurn * 2.0; 

    vec3 pos = position;
    float t = uTime * 3.0; // Base animation cycle speed

    // 1. MANTLE (Propulsion pulses)
    if (aBodyPart < 0.5) {
       // Organic Propulsion: Rhythmic contraction moving down the body
       // Combine sine waves to create irregular, biological pulsing
       float pulsePhase = uTime * 4.5 - pos.z * 0.4;
       
       // Modulate rhythm with a slower secondary wave
       float modWave = sin(uTime * 2.0 + pos.z * 0.1);
       
       // Sharper contraction curve (fast squeeze, slow relax)
       float pulse = sin(pulsePhase + modWave * 0.5);
       float contraction = smoothstep(-0.3, 1.0, pulse);
       contraction = pow(contraction, 3.0) * 0.15; // 15% squeeze intensity
       
       // Apply varying amplitude along the body length
       // Squeeze more in the muscular middle section, less at ends
       float shapeFactor = smoothstep(12.0, 1.0, pos.z) * smoothstep(0.0, 6.0, pos.z);
       
       // Add subtle high-frequency muscle ripple
       float ripple = sin(pos.z * 12.0 - uTime * 15.0) * 0.003;
       
       // Squeeze inward
       float squeeze = 1.0 - (contraction + ripple) * shapeFactor;
       pos.x *= squeeze;
       pos.y *= squeeze;
       
       // Slight elongation during squeeze (volume conservation hint)
       pos.z += contraction * shapeFactor * 2.0;
    } 
    // 2. FINS (Ripple undulation)
    else if (aBodyPart < 1.5) {
       // Gentle sine ripple along the fin length
       float finWave = sin(pos.z * 1.5 - t * 2.0);
       
       // Flap amplitude increases with speed
       float flapAmp = 0.5 + uSpeed * 0.4;
       pos.y += finWave * flapAmp; 
    }
    // 3. TENTACLES (Complex fluid dynamics)
    else if (aBodyPart < 2.5) {
       // Z is negative here. Distance from head connection:
       float dist = abs(pos.z); 
       
       // Identify Arm: Use radial angle (atan y,x) to differentiate arms
       float radialAngle = atan(pos.y, pos.x);
       vec2 radialDir = normalize(vec2(pos.x, pos.y) + vec2(0.001));

       // A. Natural Tip Dispersion (Splay)
       // Tentacles naturally fan out at the ends instead of clumping
       float spread = smoothstep(5.0, 40.0, dist) * 0.5; 
       pos.x += radialDir.x * spread * dist * 0.4;
       pos.y += radialDir.y * spread * dist * 0.4;

       // B. Independent Undulation (Wavy Curling)
       // Use radialAngle to desynchronize the sine waves
       float uniquePhase = radialAngle * 4.0; 
       float freqMod = 1.0 + sin(radialAngle * 5.0) * 0.3; // +/- 30% freq variation

       // Primary Wave (Large sweeping motion)
       float wave1 = sin(dist * 0.15 * freqMod - t * 1.5 + uniquePhase);
       // Secondary Wave (Tighter harmonic curl)
       float wave2 = sin(dist * 0.3 * freqMod - t * 2.5 + uniquePhase * 1.5);
       
       // Amplitude scales with distance (whip-like)
       // Increased multiplier for more visible curvature
       float amp = dist * 0.12 * (1.0 + uSpeed * 0.5);

       pos.x += (wave1 * 0.7 + wave2 * 0.3) * amp;
       pos.y += (cos(dist * 0.15 * freqMod - t * 1.3 + uniquePhase) * 0.7 + wave2 * 0.3) * amp;
       
       // Add a bit of centrifugal splay still
       float splayFactor = uTurn * dist * 0.1;
       pos.x += radialDir.x * splayFactor;
       pos.y += radialDir.y * splayFactor;
       
       // C. Inertial Drag (Trailing Effect)
       float dragStretch = dist * 0.05 * uSpeed;
       pos.z -= dragStretch;

       float dragFactor = max(0.0, uSpeed - 0.6);
       float speedSplay = smoothstep(5.0, 60.0, dist) * dragFactor * 0.3;
       pos.x += radialDir.x * speedSplay * dist;
       pos.y += radialDir.y * speedSplay * dist;

       // D. Eddy Currents (Refined Turbulence)
       float flowRate = uTime * (1.5 + uSpeed * 2.0); 
       vec3 nPos1 = vec3(pos.x * 0.04, pos.y * 0.04, pos.z * 0.02 + flowRate * 0.5);
       vec3 nPos2 = vec3(pos.x * 0.1, pos.y * 0.1, pos.z * 0.08 + flowRate * 1.2);
       vec3 nPos3 = vec3(pos.x * 0.3, pos.y * 0.3, pos.z * 0.2 + flowRate * 1.8);
       
       float n1 = noise(nPos1);
       float n2 = noise(nPos2);
       float n3 = noise(nPos3);
       
       float turbulenceX = (n1 - 0.5) * 1.5 + (n2 - 0.5) * 0.8 + (n3 - 0.5) * 0.3;
       float turbulenceY = (noise(nPos1 + vec3(43.0)) - 0.5) * 1.5 + 
                           (noise(nPos2 + vec3(43.0)) - 0.5) * 0.8 + 
                           (noise(nPos3 + vec3(43.0)) - 0.5) * 0.3;
       
       float eddyStr = smoothstep(2.0, 45.0, dist) * 0.4 * (1.0 + uSpeed * 0.8);
       pos.x += turbulenceX * eddyStr;
       pos.y += turbulenceY * eddyStr;
    }
    // 4. SKIRT (Webbing/Membrane)
    else {
        float angle = atan(pos.y, pos.x);
        float dist = length(vec2(pos.x, pos.y));
        float ripple = sin(angle * 6.0 - t * 2.0);
        float flow = sin(pos.z * 0.8 + t * 3.0);
        float displacement = ripple * flow;
        float edgeFactor = smoothstep(2.0, 7.0, dist);
        float amp = 0.5 * (1.0 + uSpeed);
        vec2 dir = normalize(vec2(pos.x, pos.y));
        pos.x += dir.x * displacement * amp * edgeFactor;
        pos.y += dir.y * displacement * amp * edgeFactor;
        float drag = max(0.0, uSpeed - 0.5);
        pos.z += abs(displacement) * drag * 1.5;
    }

    // Nervous twitch
    if (vAgitation > 0.1) {
        float jit = (noise(vec3(uTime * 20.0, pos.z, 0.0)) - 0.5) * 0.2 * vAgitation;
        pos += jit;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aSize * (800.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const squidFragmentShader = `
  uniform float uClickState;
  uniform vec3 uClickColor; // Dynamic click color
  uniform float uTime;
  varying float vColorMix;
  varying float vAgitation;
  
  void main() {
    // Circular particle
    vec2 coord = gl_PointCoord - vec2(0.5);
    float distSq = dot(coord, coord);
    if (distSq > 0.25) discard;

    // Base Color: Silver/Grey to White
    vec3 baseCol = mix(vec3(0.5, 0.6, 0.7), vec3(1.0, 1.0, 1.0), vColorMix);
    
    // Bioluminescent Glow Color Palette
    // Randomize hue based on the particle's random mix attribute and time for shimmering
    float hueSeed = fract(vColorMix * 20.0 + uTime * 0.2);
    
    vec3 bioCol;
    if (hueSeed < 0.33) {
        // Neon Purple
        bioCol = vec3(0.8, 0.2, 1.0);
    } else if (hueSeed < 0.66) {
        // Magenta (was Yellow)
        bioCol = vec3(1.0, 0.0, 0.8);
    } else {
        // Electric Cyan
        bioCol = vec3(0.0, 1.0, 0.95);
    }
    
    // Calculate Intensity
    // 1. Idle breathing (Subtle glow always present)
    float breath = 0.1 + 0.1 * sin(uTime * 3.0 + vColorMix * 10.0);
    
    // 2. Active Agitation (Movement/Hover)
    float activeGlow = clamp(vAgitation, 0.0, 1.0);
    
    // Combine: Agitation overpowers breathing
    float intensity = clamp(breath + activeGlow, 0.0, 1.0);
    
    // Mix base color with bio color based on intensity
    vec3 finalCol = mix(baseCol, bioCol, intensity * 0.8);
    
    // Add additive glow boost
    finalCol += bioCol * intensity * 1.0;

    // Apply Click Interaction (Dynamic Alert Color)
    finalCol = mix(finalCol, uClickColor, uClickState * 0.9);

    // Soft edge for high quality
    float alpha = 1.0 - smoothstep(0.1, 0.25, distSq);
    
    // Make glow slightly more opaque when intense
    alpha = mix(alpha, 1.0, intensity * 0.6 * (1.0 - distSq*4.0));
    // Boost alpha on click
    alpha = mix(alpha, 1.0, uClickState * 0.5);

    gl_FragColor = vec4(finalCol, alpha);
  }
`;

// --- TRAIL SHADERS (INK) ---
const trailVertexShader = `
  uniform float uTime;
  attribute float aBirthTime;
  varying float vLife;

  void main() {
    float life = 1.0 - (uTime - aBirthTime) * 0.5; // 2 seconds life
    vLife = life;
    
    if (life < 0.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // Clip
        return;
    }

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 4.0 * life * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const trailFragmentShader = `
  varying float vLife;
  void main() {
    if (vLife <= 0.0) discard;
    vec2 coord = gl_PointCoord - vec2(0.5);
    if (dot(coord, coord) > 0.25) discard;
    // Ink-like trail (darker/subtle)
    gl_FragColor = vec4(0.8, 0.9, 1.0, vLife * 0.2);
  }
`;

// --- BUBBLE SHADERS (CURSOR) ---
const bubbleVertexShader = `
  uniform float uTime;
  attribute float aBirthTime;
  attribute float aSize;
  varying float vLife;

  void main() {
    // Very short life (approx 0.25s) to keep trail tight to cursor
    float life = 1.0 - (uTime - aBirthTime) * 4.0; 
    vLife = life;
    
    if (life < 0.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // Clip
        return;
    }

    vec3 pos = position;
    float age = uTime - aBirthTime;
    
    // Bubbles rise and jitter
    pos.y += age * 8.0; 
    pos.x += sin(age * 10.0 + pos.y) * 0.5;
    pos.z += cos(age * 8.0 + pos.x) * 0.5;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aSize * life * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const bubbleFragmentShader = `
  varying float vLife;
  void main() {
    if (vLife <= 0.0) discard;
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    
    // Bubble look: transparent center, brighter edge
    float alpha = vLife * 0.6;
    if (dist < 0.3) alpha *= 0.3; // Hollow center
    
    gl_FragColor = vec4(0.8, 1.0, 1.0, alpha);
  }
`;

const FluidCanvas: React.FC<Props> = ({ isMuted }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const squidRef = useRef<THREE.Points | null>(null);
  const trailRef = useRef<THREE.Points | null>(null);
  const bubbleRef = useRef<THREE.Points | null>(null);
  const schoolRef = useRef<THREE.Points | null>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  
  // State
  const mouseRef = useRef(new THREE.Vector2(999, 999));
  const prevMouseWorldPosRef = useRef(new THREE.Vector3(0,0,0));
  const followRef = useRef(true); // Is following enabled?
  const clickStateRef = useRef({ active: false, value: 0.0 });
  const clickTimerRef = useRef<number | null>(null);
  const lastColorIndexRef = useRef<number>(-1); // Track previous color index

  const squidState = useRef({
      speed: 1.0,
      turnSpeed: 0.03, // Slightly sharper turns
      rotation: new THREE.Quaternion(),
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(0, 0, 0),
      target: new THREE.Vector3(40, 0, 0),
      hoverVal: 0,
      burstTimer: 0
  });

  // Audio refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const ambienceGainRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  // 1. Snow Geometry (Ambient Particles)
  const snowGeometry = useMemo(() => {
    const count = 1500; 
    const positions = new Float32Array(count * 3);
    const alphas = new Float32Array(count);
    const scales = new Float32Array(count);
    const offsets = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 200;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 100 - 20;

        alphas[i] = Math.random() * 0.3 + 0.1;
        scales[i] = Math.random() * 0.05 + 0.02;
        offsets[i*3] = Math.random() * Math.PI;
        offsets[i*3+1] = Math.random() * Math.PI;
        offsets[i*3+2] = Math.random() * Math.PI;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geom.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geom.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 3));
    return geom;
  }, []);

  // 2. School Geometry (Roaming Data Clusters)
  const schoolGeometry = useMemo(() => {
    const count = 200;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const sizes = new Float32Array(count);
    
    for(let i=0; i<count; i++) {
        const r = Math.random() * 5;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        
        positions[i*3] = r * Math.sin(phi) * Math.cos(theta) * 2.0;
        positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta) * 0.5;
        positions[i*3+2] = r * Math.cos(phi) * 0.5;
        
        speeds[i] = 1.0 + Math.random();
        sizes[i] = Math.random() * 0.05 + 0.03;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    return geom;
  }, []);

  // 3. SQUID GEOMETRY
  const squidGeometry = useMemo(() => {
    const particles = [];
    const sizes = [];
    const colorMix = [];
    const bodyPart = []; // 0: Mantle, 1: Fins, 2: Tentacles, 3: Skirt

    // Helper
    const addP = (x: number, y: number, z: number, s: number, c: number, part: number) => {
        particles.push(x, y, z);
        sizes.push(s);
        colorMix.push(c);
        bodyPart.push(part);
    };

    const MANTLE_COUNT = 8000;
    const FIN_COUNT = 2000;
    const SKIRT_COUNT = 3000;

    // A. MANTLE (Bullet shape, Z from 0 to 12)
    for (let i = 0; i < MANTLE_COUNT; i++) {
        const u = Math.random(); 
        const v = Math.random();
        // Cylindrical mapping
        const theta = 2 * Math.PI * u;
        const h = v * 12.0; // Height (Length)

        // Tapering logic
        // Starts wide at h=0 (Head connection), tapers to point at h=12
        let r = 3.0 * (1.0 - Math.pow(h / 12.0, 1.5)); // Bullet curve
        
        // Add some noise to radius for organic skin
        r *= 0.95 + Math.random() * 0.1;

        const x = r * Math.cos(theta);
        const y = r * Math.sin(theta);
        const z = h; // Z is forward

        // Stippling density bias towards surface
        const hollow = 0.8 + Math.random()*0.2; // Biased to outer 20%
        // Adjust for outline sharpness (95% bias)
        const outlineHollow = Math.pow(hollow, 0.1); // Push to 1.0

        addP(x * outlineHollow, y * outlineHollow, z, Math.random()*0.06 + 0.03, Math.random(), 0.0);
    }

    // B. EYES (Dense clusters at Z ~ 1)
    for(let i=0; i<1000; i++) {
       const isLeft = Math.random() > 0.5 ? 1 : -1;
       const r = 0.8 * Math.random();
       const theta = Math.random() * Math.PI * 2;
       
       const x = (2.5 + r * Math.cos(theta)) * isLeft; // Offset to sides
       const y = -1.0 + r * Math.sin(theta);
       const z = 1.0 + (Math.random()-0.5)*0.5;

       addP(x, y, z, 0.07, 1.0, 0.0); // Bright eyes
    }

    // C. FINS (Flat triangles at rear Z ~ 6 to 11)
    for (let i = 0; i < FIN_COUNT; i++) {
        const isLeft = i % 2 === 0 ? 1 : -1;
        const u = Math.random(); // Length along Z
        const v = Math.random(); // Width outward

        const zStart = 5.0;
        const zLen = 6.0;
        
        const z = zStart + u * zLen;
        
        // Fin shape profile
        const maxW = 5.0 * Math.sin(u * Math.PI); // Leaf shape
        const xOffset = 1.0 * (1.0 - u); // Taper connection to body

        const w = v * maxW;
        
        // Flattened in Y, extending in X
        const x = (isLeft * (2.0 + w)); 
        const y = (Math.random() - 0.5) * 0.2; // Thin profile

        addP(x, y, z, 0.05, 0.7, 1.0);
    }

    // D. SKIRT (Frill/Membrane under body)
    for (let i = 0; i < SKIRT_COUNT; i++) {
        const u = Math.random(); // Angle
        const v = Math.random(); // Radial length along Z

        const theta = u * Math.PI * 2;
        const zStart = 0.5;
        const zEnd = -6.0;
        
        const z = zStart + v * (zEnd - zStart);
        
        // Radius profile: Starts at mantle radius (~2.5), flares out
        const rBase = 2.5;
        const rFlare = 4.0;
        const t = (zStart - z) / (zStart - zEnd); // 0 to 1
        
        // Bell shape
        let r = rBase + Math.pow(t, 0.8) * rFlare;
        
        // Add thickness/noise
        r += (Math.random() - 0.5) * 0.5;

        const x = r * Math.cos(theta);
        const y = r * Math.sin(theta);
        
        addP(x, y, z, 0.05, 0.9, 3.0); 
    }

    // E. TENTACLES (Trailing behind Z < 0)
    const NUM_ARMS = 8;
    const NUM_LONG = 2;
    
    // 8 Short Arms
    for (let arm = 0; arm < NUM_ARMS; arm++) {
        const angle = (arm / NUM_ARMS) * Math.PI * 2;
        const armLen = 19.0 + Math.random() * 4.0; // Shortened
        
        for (let i = 0; i < 2500; i++) { // Increased count for solid look
            const t = i / 2500; 
            const rBase = 2.0; 
            
            // Spiral/Twist
            const twist = angle + t * 0.5;
            const rad = rBase * (1.0 - t * 0.8); 

            const cx = Math.cos(twist) * rad;
            const cy = Math.sin(twist) * rad;
            
            const cz = -t * armLen; 

            // Tighten Jitter for Solid Arms
            const jitterAmt = 0.3 + (1.0-t)*0.2; 
            const jx = (Math.random()-0.5) * jitterAmt;
            const jy = (Math.random()-0.5) * jitterAmt;

            const size = 0.08 + (1.0-t)*0.08;

            addP(cx+jx, cy+jy, cz, size, 0.8, 2.0);
        }
    }

    // 2 Long Tentacles (Hunting arms)
    for (let arm = 0; arm < NUM_LONG; arm++) {
        const angle = Math.random() * Math.PI * 2;
        const armLen = 33.0; // Shortened

        for (let i = 0; i < 5000; i++) { // Increased count for solid line
            const t = i / 5000; 
            const cz = -t * armLen;
            
            // Wavy path
            const cx = Math.sin(t * 10.0 + angle) * 1.5;
            const cy = Math.cos(t * 8.0 + angle) * 1.5;

            // Thin Thread Logic
            const isClub = t > 0.9;
            const spread = isClub ? 0.6 : 0.04;

            const jx = (Math.random()-0.5) * spread;
            const jy = (Math.random()-0.5) * spread;

            const size = isClub ? 0.25 : 0.08;

            addP(cx+jx, cy+jy, cz, size, 1.0, 2.0);
        }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(particles, 3));
    geom.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geom.setAttribute('aColorMix', new THREE.Float32BufferAttribute(colorMix, 1));
    geom.setAttribute('aBodyPart', new THREE.Float32BufferAttribute(bodyPart, 1));
    return geom;
  }, []);

  // 4. Trail Geometry (Ink - Ring Buffer)
  const trailGeometry = useMemo(() => {
      const COUNT = 3000;
      const positions = new Float32Array(COUNT * 3);
      const birthTimes = new Float32Array(COUNT).fill(-1000); // Start invisible
      
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geom.setAttribute('aBirthTime', new THREE.BufferAttribute(birthTimes, 1));
      return geom;
  }, []);

  // 5. Bubble Geometry (Cursor - Ring Buffer)
  const bubbleGeometry = useMemo(() => {
    const COUNT = 3000;
    const positions = new Float32Array(COUNT * 3);
    const birthTimes = new Float32Array(COUNT).fill(-1000);
    const sizes = new Float32Array(COUNT);
    
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('aBirthTime', new THREE.BufferAttribute(birthTimes, 1));
    geom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    return geom;
  }, []);

  // Handle Mute State Changes smoothly
  useEffect(() => {
    if (!audioContextRef.current || !masterGainRef.current) return;
    
    const ctx = audioContextRef.current;
    const gain = masterGainRef.current;
    const now = ctx.currentTime;
    
    // Ensure context is running if we are unmuting
    if (!isMuted && ctx.state === 'suspended') {
      ctx.resume().catch(e => console.warn(e));
    }

    // Ramp volume
    const targetGain = isMuted ? 0 : 0.3;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(targetGain, now + 0.5); // Smooth 0.5s transition
    
  }, [isMuted]);

  useEffect(() => {
    if (!containerRef.current) return;

    // --- AUDIO INIT ---
    try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;

        const masterGain = ctx.createGain();
        masterGain.gain.value = 0.3;
        masterGain.connect(ctx.destination);
        masterGainRef.current = masterGain; // Store ref for mute control

        // Brown Noise Generator for Deep Ocean Ambience
        const bufferSize = ctx.sampleRate * 4;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            data[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = data[i];
            data[i] *= 3.5;
        }
        
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = buffer;
        noiseSrc.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;
        
        // LFO to modulate filter (Ocean Swell)
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.1;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 80;
        
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        
        const ambGain = ctx.createGain();
        ambGain.gain.value = 0.8;
        ambienceGainRef.current = ambGain;

        noiseSrc.connect(filter);
        filter.connect(ambGain);
        ambGain.connect(masterGain);
        
        // Procedural Bubbles / Distant Calls
        const bubbleInterval = setInterval(() => {
             if (audioContextRef.current && audioContextRef.current.state === 'running' && masterGainRef.current && masterGainRef.current.gain.value > 0) {
                 // Random chance
                 if (Math.random() < 0.3) {
                     // Bubble Sound (High Pitch Sine Burst)
                     const osc = ctx.createOscillator();
                     const gain = ctx.createGain();
                     osc.type = 'sine';
                     osc.frequency.setValueAtTime(800 + Math.random()*400, ctx.currentTime);
                     osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
                     
                     gain.gain.setValueAtTime(0.1, ctx.currentTime);
                     gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
                     
                     osc.connect(gain);
                     gain.connect(masterGain);
                     osc.start();
                     osc.stop(ctx.currentTime + 0.2);
                 } else if (Math.random() < 0.1) {
                     // Distant Creature Call (Low Pitch Sweep)
                     const osc = ctx.createOscillator();
                     const gain = ctx.createGain();
                     osc.type = 'triangle';
                     osc.frequency.setValueAtTime(150, ctx.currentTime);
                     osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 2.0);
                     
                     gain.gain.setValueAtTime(0.0, ctx.currentTime);
                     gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.5);
                     gain.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 2.5);

                     // Reverb simulation (simple delay)
                     const delay = ctx.createDelay();
                     delay.delayTime.value = 0.3;
                     const delayGain = ctx.createGain();
                     delayGain.gain.value = 0.4;
                     
                     osc.connect(gain);
                     gain.connect(masterGain);
                     gain.connect(delay);
                     delay.connect(delayGain);
                     delayGain.connect(masterGain);
                     
                     osc.start();
                     osc.stop(ctx.currentTime + 3.0);
                 }
             }
        }, 2000);

        noiseSrc.start();
        lfo.start();
    } catch (e) {
        console.warn('AudioContext not supported or blocked');
    }

    // --- SCENE INIT ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(THEME.background);
    scene.fog = new THREE.FogExp2(THEME.background, 0.012);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
    camera.position.set(0, 0, 60); 
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- MATERIALS ---
    const snowMaterial = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: snowVertexShader,
        fragmentShader: snowFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    const schoolMaterial = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: schoolVertexShader,
        fragmentShader: schoolFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    const squidMaterial = new THREE.ShaderMaterial({
        uniforms: { 
            uTime: { value: 0 },
            uSpeed: { value: 1.0 },
            uHover: { value: 0.0 },
            uTurn: { value: 0.0 },
            uClickState: { value: 0.0 }, // 0 = Normal, 1 = Clicked (Red)
            uClickColor: { value: new THREE.Vector3(1.0, 0.5, 0.0) } // Dynamic Click Color
        },
        vertexShader: squidVertexShader,
        fragmentShader: squidFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending, // Glow effect
    });

    const trailMaterial = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: trailVertexShader,
        fragmentShader: trailFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    const bubbleMaterial = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: bubbleVertexShader,
        fragmentShader: bubbleFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    // --- MESHES ---
    const snow = new THREE.Points(snowGeometry, snowMaterial);
    scene.add(snow);

    const school = new THREE.Points(schoolGeometry, schoolMaterial);
    school.position.set(-100, 0, -20);
    scene.add(school);
    schoolRef.current = school;

    const squid = new THREE.Points(squidGeometry, squidMaterial);
    scene.add(squid);
    squidRef.current = squid;

    const trail = new THREE.Points(trailGeometry, trailMaterial);
    scene.add(trail);
    trailRef.current = trail;

    const bubbles = new THREE.Points(bubbleGeometry, bubbleMaterial);
    scene.add(bubbles);
    bubbleRef.current = bubbles;
    
    // Raycaster settings
    raycaster.params.Points.threshold = 1.0;
    
    const clock = new THREE.Clock();
    
    // Trail state
    let trailIdx = 0;
    const trailPositions = trailGeometry.attributes.position.array as Float32Array;
    const trailBirths = trailGeometry.attributes.aBirthTime.array as Float32Array;

    // Bubble state
    let bubbleIdx = 0;
    const bubblePositions = bubbleGeometry.attributes.position.array as Float32Array;
    const bubbleBirths = bubbleGeometry.attributes.aBirthTime.array as Float32Array;
    const bubbleSizes = bubbleGeometry.attributes.aSize.array as Float32Array;

    const animate = () => {
      const dt = clock.getDelta();
      const time = clock.getElapsedTime();
      
      // Update Uniforms
      (snow.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
      (school.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
      (squid.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
      (trail.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
      (bubbles.material as THREE.ShaderMaterial).uniforms.uTime.value = time;

      // Handle Click Animation (Lerp towards active state)
      const clickTarget = clickStateRef.current.active ? 1.0 : 0.0;
      clickStateRef.current.value += (clickTarget - clickStateRef.current.value) * 0.1;
      (squid.material as THREE.ShaderMaterial).uniforms.uClickState.value = clickStateRef.current.value;

      // --- SQUID AI ---
      const ws = squidState.current;
      
      // Calculate Interaction (Hover / Agitation)
      const ndcPos = ws.position.clone().project(camera);
      const mouseDist = new THREE.Vector2(ndcPos.x, ndcPos.y).distanceTo(mouseRef.current);
      
      const hoverStrength = Math.max(0, 1.0 - mouseDist * 1.2);
      ws.hoverVal += (hoverStrength - ws.hoverVal) * 0.1; 
      
      ws.burstTimer += dt;
      let targetSpeed = 0.8; 
      const isMouseActive = Math.abs(mouseRef.current.x) <= 1.0 && Math.abs(mouseRef.current.y) <= 1.0;
      
      let mouseWorldPos = new THREE.Vector3(0,0,0);

      if (isMouseActive) {
          // Unproject mouse to world Z=0 plane (approx)
          const vec = new THREE.Vector3(mouseRef.current.x, mouseRef.current.y, 0.5);
          vec.unproject(camera);
          const dir = vec.sub(camera.position).normalize();
          const distance = -camera.position.z / dir.z;
          mouseWorldPos = camera.position.clone().add(dir.multiplyScalar(distance));
      }

      // --- BUBBLE TRAIL LOGIC ---
      if (isMouseActive && followRef.current) {
           const distMoved = mouseWorldPos.distanceTo(prevMouseWorldPosRef.current);
           const speed = distMoved / dt; // units per second
           
           // If moving fast enough, emit bubbles
           if (speed > 2.0) {
               // Number of bubbles proportional to speed
               const emissionCount = Math.min(10, Math.floor(speed * 0.1));
               
               for(let k=0; k<emissionCount; k++) {
                   bubbleIdx = (bubbleIdx + 1) % 3000;
                   // Add some random jitter around cursor
                   const jitter = 0.5 + Math.random() * 1.0;
                   
                   // Lerp between prev and current to fill gaps
                   const t = k / emissionCount;
                   const px = THREE.MathUtils.lerp(prevMouseWorldPosRef.current.x, mouseWorldPos.x, t);
                   const py = THREE.MathUtils.lerp(prevMouseWorldPosRef.current.y, mouseWorldPos.y, t);
                   const pz = THREE.MathUtils.lerp(prevMouseWorldPosRef.current.z, mouseWorldPos.z, t);

                   bubblePositions[bubbleIdx * 3] = px + (Math.random()-0.5)*jitter;
                   bubblePositions[bubbleIdx * 3 + 1] = py + (Math.random()-0.5)*jitter;
                   bubblePositions[bubbleIdx * 3 + 2] = pz + (Math.random()-0.5)*jitter;
                   bubbleBirths[bubbleIdx] = time;
                   bubbleSizes[bubbleIdx] = 2.0 + Math.random() * 4.0;
               }
               bubbleGeometry.attributes.position.needsUpdate = true;
               bubbleGeometry.attributes.aBirthTime.needsUpdate = true;
               bubbleGeometry.attributes.aSize.needsUpdate = true;
           }
      }
      prevMouseWorldPosRef.current.copy(mouseWorldPos);

      // --- SQUID FOLLOW LOGIC ---
      if (followRef.current && isMouseActive) {
          ws.target.copy(mouseWorldPos);
          ws.turnSpeed = 0.12; 
          
          const distToMouse = ws.position.distanceTo(mouseWorldPos);
          if (distToMouse > 20) {
              targetSpeed = 1.6; 
          } else if (distToMouse < 10) {
              targetSpeed = 0.5; 
          } else {
              targetSpeed = 1.2; 
          }
      } else {
          // Autonomous Wander
          ws.turnSpeed = 0.03; 
          const dist = ws.position.distanceTo(ws.target);
          if (dist < 10) {
              const r = Math.random();
              if (r < 0.25) { 
                  // 25% Chance of Close-up Shot: Target extremely near camera (Z=60)
                  // Target Z=50 to 55 means it swims within 5-10 units of the lens
                  ws.target.set(
                      (Math.random() - 0.5) * 30, 
                      (Math.random() - 0.5) * 20,
                      50 + Math.random() * 5 
                  );
              } else {
                  // Standard Deep/Wide Wander
                  ws.target.set(
                      (Math.random() - 0.5) * 120,
                      (Math.random() - 0.5) * 70,
                      (Math.random() * 160) - 100 // -100 to +60
                  );
              }
          }
      }

      if (ws.hoverVal > 0.6) {
           targetSpeed = Math.min(targetSpeed, 0.6); 
      } else if (!isMouseActive && followRef.current) { 
          if (ws.burstTimer > 5.0 && Math.random() < 0.01) {
             ws.speed = 2.5; 
             ws.burstTimer = 0;
          }
      }

      ws.speed += (targetSpeed - ws.speed) * 0.05;

      (squid.material as THREE.ShaderMaterial).uniforms.uHover.value = ws.hoverVal;
      (squid.material as THREE.ShaderMaterial).uniforms.uSpeed.value = ws.speed;

      // Steering
      const direction = new THREE.Vector3().subVectors(ws.target, ws.position).normalize();
      
      // Calculate Turn Intensity (Angle difference)
      // Save prev forward vector for calculation
      const prevFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(ws.rotation);
      
      const angle = prevFwd.angleTo(direction);
      
      // Update uTurn uniform (for tentacle splay)
      const uniforms = (squid.material as THREE.ShaderMaterial).uniforms;
      uniforms.uTurn.value = THREE.MathUtils.lerp(uniforms.uTurn.value, angle, 0.1);

      // 1. Dynamic Turn Rate
      // Turn slower if angle is large (heavy turn), fast if small adjustment
      let effectiveTurnSpeed = ws.turnSpeed;
      if (angle > 1.0) effectiveTurnSpeed *= 0.5; 

      // 2. Ideal Rotation
      // Handle 180 flip singularity
      const dot = prevFwd.dot(direction);
      let idealQ;
      if (dot < -0.99) {
          // If perfectly behind, rotate around up axis
          const axis = new THREE.Vector3(0,1,0);
          idealQ = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI).multiply(ws.rotation);
      } else {
          idealQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      }

      ws.rotation.slerp(idealQ, effectiveTurnSpeed);
      
      // 3. Momentum / Drift Physics
      // Forward thrust vector based on current orientation
      const thrustDir = new THREE.Vector3(0, 0, 1).applyQuaternion(ws.rotation);
      
      // Desired velocity is purely forward
      const desiredVelocity = thrustDir.clone().multiplyScalar(ws.speed * 8.0);
      
      // Inertial Interpolation (Drift)
      // Low lerp value = sliding on ice (more drift)
      // High lerp value = on rails
      const driftFactor = 0.05; 
      ws.velocity.lerp(desiredVelocity, driftFactor);
      
      // Apply movement
      ws.position.add(ws.velocity.clone().multiplyScalar(dt));
      
      squid.position.copy(ws.position);
      squid.quaternion.copy(ws.rotation);

      // 2. Trail Emission (Ink)
      const tailLocal = new THREE.Vector3(0, 0, -8);
      tailLocal.applyQuaternion(ws.rotation);
      tailLocal.add(ws.position);

      for(let k=0; k<2; k++) {
          trailIdx = (trailIdx + 1) % 3000;
          trailPositions[trailIdx * 3] = tailLocal.x + (Math.random()-0.5)*1.5;
          trailPositions[trailIdx * 3 + 1] = tailLocal.y + (Math.random()-0.5)*1.5;
          trailPositions[trailIdx * 3 + 2] = tailLocal.z + (Math.random()-0.5)*1.5;
          trailBirths[trailIdx] = time;
      }
      trailGeometry.attributes.position.needsUpdate = true;
      trailGeometry.attributes.aBirthTime.needsUpdate = true;

      // 3. School AI
      if (schoolRef.current) {
          schoolRef.current.position.x += 0.1;
          if (schoolRef.current.position.x > 100) schoolRef.current.position.x = -100;
      }

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    const animId = requestAnimationFrame(animate);

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
      
      // Resume audio on interaction if allowed by props
      if (!isMuted && audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };
    
    // --- CLICK INTERACTIONS ---
    const handleClick = (e: MouseEvent) => {
        if (!squidRef.current) return;
        
        // Raycast logic
        raycaster.setFromCamera(mouseRef.current, camera);
        const intersects = raycaster.intersectObject(squidRef.current);
        
        if (intersects.length > 0) {
            // Clicked on Squid
            clickStateRef.current.active = true;

            // Random Color Palette
            const CLICK_COLORS = [
                new THREE.Vector3(1.0, 0.0, 0.0), // Red (was Orange/Yellow)
                new THREE.Vector3(0.6, 0.0, 1.0), // Purple
                new THREE.Vector3(0.0, 0.5, 1.0), // Blue
                new THREE.Vector3(0.0, 1.0, 0.5)  // Green
            ];

            // Select a new color different from the last one
            let newIndex;
            do {
                newIndex = Math.floor(Math.random() * CLICK_COLORS.length);
            } while (newIndex === lastColorIndexRef.current);
            
            lastColorIndexRef.current = newIndex;
            const randCol = CLICK_COLORS[newIndex];
            
            // Update Uniform
            (squidRef.current.material as THREE.ShaderMaterial).uniforms.uClickColor.value.copy(randCol);
            
            // Clear existing timer if any to reset duration
            if (clickTimerRef.current) {
                clearTimeout(clickTimerRef.current);
            }
            // Reset after 3 seconds
            clickTimerRef.current = setTimeout(() => {
                clickStateRef.current.active = false;
            }, 3000) as unknown as number; // explicit cast to number
        }
    };

    const handleDblClick = () => {
        // Toggle follow behavior
        followRef.current = !followRef.current;
    };

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    window.addEventListener('dblclick', handleDblClick);
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('dblclick', handleDblClick);
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      snowGeometry.dispose();
      schoolGeometry.dispose();
      squidGeometry.dispose();
      trailGeometry.dispose();
      bubbleGeometry.dispose();
      if (audioContextRef.current) audioContextRef.current.close();
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, [snowGeometry, schoolGeometry, squidGeometry, trailGeometry, bubbleGeometry, raycaster]); // Note: isMuted is NOT here to avoid full re-init

  return <div ref={containerRef} className="absolute inset-0 z-0" />;
};

export default FluidCanvas;