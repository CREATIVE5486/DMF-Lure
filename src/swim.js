// Scène 3D sous-marine de la simulation de nage.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildLure, disposeObject } from './lureModel.js';
import { lineTiePoint } from './geometry.js';
import { SwimPhysics, makeHydro, defaultSwimParams } from './swimPhysics.js';
import { fmtDepth } from './units.js';

const WATER_COLOR = 0x1d5d6c;

function sandTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7d7457';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 90 + Math.random() * 70;
    g.fillStyle = `rgba(${v + 20},${v + 12},${v - 10},${0.25 + Math.random() * 0.4})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 40);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.font = '700 56px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.shadowColor = 'rgba(0,0,0,0.4)';
  g.shadowBlur = 8;
  g.fillText(text, 128, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0.7, depthWrite: false, fog: true }));
  s.scale.set(0.1, 0.0375, 1);
  return s;
}

export class SwimView {
  constructor(renderer, dom) {
    this.renderer = renderer;
    this.dom = dom;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(WATER_COLOR);
    this.scene.fog = new THREE.FogExp2(WATER_COLOR, 0.42);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 200);
    this.controls = new OrbitControls(this.camera, dom);
    this.controls.enableDamping = true;
    this.controls.enabled = false;
    this.camMode = 'side';
    this.playback = 1;
    this.playing = true;
    this.params = defaultSwimParams();

    this.scene.add(new THREE.HemisphereLight(0xbfefff, 0x23302a, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.3, 1, 0.4);
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    // surface vue de dessous
    this.surfaceMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform float time; varying vec3 vW;
        void main(){
          vec2 p = vW.xz*3.0;
          float r = sin(p.x*2.1+time*1.3)*sin(p.y*1.7-time*1.1) + sin((p.x+p.y)*3.3+time*2.0)*0.5;
          float l = smoothstep(0.6,1.4,r);
          vec3 c = mix(vec3(0.42,0.75,0.8), vec3(0.85,0.97,1.0), l);
          gl_FragColor = vec4(c, 0.55 + l*0.3);
        }`,
    });
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), this.surfaceMat);
    surf.rotation.x = Math.PI / 2;
    this.scene.add(surf);
    this.surface = surf;

    this.bottom = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 1 }));
    this.bottom.rotation.x = -Math.PI / 2;
    this.scene.add(this.bottom);
    this.decor = new THREE.Group();
    this.scene.add(this.decor);

    // particules en suspension (champ infini autour de la caméra)
    const N = 2600;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) pos[i] = Math.random();
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particleSeed = pos.slice();
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const dg = dot.getContext('2d');
    const rg = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    dg.fillStyle = rg;
    dg.fillRect(0, 0, 32, 32);
    this.particles = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xd8eeea, size: 0.005, map: new THREE.CanvasTexture(dot), transparent: true, opacity: 0.75, depthWrite: false }));
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);

    // fil
    this.linePts = new Float32Array(40 * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePts, 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xe8f4f2, transparent: true, opacity: 0.75 }));
    this.line.frustumCulled = false;
    this.scene.add(this.line);

    // bulles
    this.bubbles = [];
    const bg = new THREE.SphereGeometry(1, 8, 6);
    const bm = new THREE.MeshBasicMaterial({ color: 0xe6fbff, transparent: true, opacity: 0.55 });
    for (let i = 0; i < 80; i++) {
      const b = new THREE.Mesh(bg, bm);
      b.visible = false;
      this.scene.add(b);
      this.bubbles.push({ mesh: b, life: 0, vy: 0 });
    }
    this.bubbleTimer = 0;

    this.markers = new THREE.Group();
    this.scene.add(this.markers);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.lure = null;
    this.camPos = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.onFinish = null;
    this.lastEventCount = 0;
  }

  setDesign(design, texture, mp) {
    this.design = design;
    this.mp = mp;
    if (this.lure) { this.pivot.remove(this.lure); disposeObject(this.lure); }
    this.lure = buildLure(design, texture, { hardware: true, simpleLip: true, nu: 110, nt: 80 });
    this.lure.scale.setScalar(0.001);
    this.lure.position.set(-mp.cg[0] * 0.001, -mp.cg[1] * 0.001, -mp.cg[2] * 0.001);
    this.pivot.add(this.lure);
    this.tieLocal = lineTiePoint(design).point.clone().sub(new THREE.Vector3(...mp.cg)).multiplyScalar(0.001);
    this.hydro = makeHydro(design, mp, this.params.water);
    if (!this.sim) this.sim = new SwimPhysics(this.hydro, this.params);
    else this.sim.setHydro(this.hydro);
    this.Lm = design.body.length / 1000;
  }

  setParams(p, { restart = true } = {}) {
    Object.assign(this.params, p);
    if (this.sim) this.sim.setParams(this.params);
    if (p.water && this.design) this.hydro = makeHydro(this.design, this.mp, this.params.water), this.sim.setHydro(this.hydro);
    if (restart) this.restart();
  }

  restart() {
    if (!this.sim) return;
    this.sim.reset();
    this.lastEventCount = 0;
    this.bottom.position.y = -this.params.depth;
    this.buildDecor();
    this.buildMarkers();
    this.playing = true;
    this.snapCamera = true;
  }

  buildDecor() {
    for (const c of [...this.decor.children]) { this.decor.remove(c); c.geometry.dispose(); }
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a5b52, roughness: 0.95, flatShading: true });
    const weedMat = new THREE.MeshStandardMaterial({ color: 0x3f6b35, roughness: 0.9, side: THREE.DoubleSide });
    const d = this.params.depth;
    let seed = 42;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 160; i++) {
      const s = 0.04 + r() * 0.22;
      const g = new THREE.DodecahedronGeometry(s, 0);
      const m = new THREE.Mesh(g, rockMat);
      m.position.set(r() * (this.params.cast + 8) - 3, -d + s * 0.3, (r() - 0.5) * 5);
      m.scale.y = 0.5 + r() * 0.5;
      m.rotation.set(r() * 3, r() * 3, r() * 3);
      this.decor.add(m);
    }
    for (let i = 0; i < 220; i++) {
      const hgt = 0.2 + r() * 0.8;
      const g = new THREE.PlaneGeometry(0.03, hgt, 1, 4);
      g.translate(0, hgt / 2, 0);
      const m = new THREE.Mesh(g, weedMat);
      m.position.set(r() * (this.params.cast + 8) - 3, -d, (r() - 0.5) * 5);
      m.rotation.y = r() * 3;
      m.userData.sway = r() * 6;
      this.decor.add(m);
    }
  }

  buildMarkers() {
    for (const c of [...this.markers.children]) { this.markers.remove(c); c.material.map?.dispose(); c.material.dispose(); }
    const max = Math.ceil(this.params.cast);
    for (let x = 1; x <= max; x++) {
      const s = labelSprite(fmtDepth(x, 0));
      s.userData.x = x;
      s.position.set(x, -0.5, -0.2);
      this.markers.add(s);
    }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setCamMode(m) {
    this.camMode = m;
    this.controls.enabled = m === 'free';
    this.snapCamera = true;
  }

  update(dtReal) {
    if (!this.sim) return;
    const sim = this.sim;
    const dt = Math.min(0.05, dtReal) * this.playback;
    if (this.playing && !sim.finished) {
      const sub = 1 / 500;
      let acc = dt;
      while (acc > 1e-6) { const s = Math.min(sub, acc); sim.step(s); acc -= s; }
      if (sim.finished && this.onFinish) this.onFinish(sim);
    }
    this.surfaceMat.uniforms.time.value += dt;

    const p = sim.pos;
    this.pivot.position.set(p.x, p.y, p.z);
    this.pivot.rotation.set(sim.roll, sim.yaw, sim.pitch, 'YZX');
    // hameçons : pendent sous l'effet de la gravité
    for (const hp of this.lure.userData.hookPivots) {
      const target = -sim.pitch * 0.85 + Math.sin(sim.phase * 0.5) * 0.08;
      hp.rotation.z += (target - hp.rotation.z) * Math.min(1, dt * 8);
      hp.rotation.x = -sim.roll * 0.6;
    }

    // fil
    const tie = this.tieLocal.clone().applyEuler(this.pivot.rotation).add(this.pivot.position);
    const rod = new THREE.Vector3(0, this.params.rodHeight, 0);
    const slack = Math.max(0, sim.lineLen - tie.distanceTo(rod));
    const mid = tie.clone().lerp(rod, 0.5);
    mid.y -= Math.min(2, slack * 0.6 + 0.02 * tie.distanceTo(rod) * (sim.tension < 0.01 ? 1 : 0.1));
    for (let i = 0; i < 40; i++) {
      const t = i / 39;
      const a = tie.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(mid, 2 * (1 - t) * t).addScaledVector(rod, t * t);
      this.linePts.set([a.x, a.y, a.z], i * 3);
    }
    this.line.geometry.attributes.position.needsUpdate = true;

    // bulles
    this.bubbleTimer -= dt;
    const fast = Math.hypot(sim.vel.x, sim.vel.y) > 1.3 || sim.dart > 0.6;
    const evs = sim.events.length;
    if (evs > this.lastEventCount) { for (let i = 0; i < 10; i++) this.spawnBubble(tie, 0.02); this.lastEventCount = evs; }
    if (fast && this.bubbleTimer <= 0) { this.spawnBubble(tie, 0.01); this.bubbleTimer = 0.04; }
    for (const b of this.bubbles) {
      if (!b.mesh.visible) continue;
      b.life -= dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.x += Math.sin(b.life * 9) * 0.0008;
      if (b.life <= 0 || b.mesh.position.y > 0) b.mesh.visible = false;
    }

    // décor : algues qui ondulent
    const tt = this.surfaceMat.uniforms.time.value;
    for (const m of this.decor.children) if (m.userData.sway !== undefined) m.rotation.z = Math.sin(tt * 0.8 + m.userData.sway) * 0.15;

    // repères de distance (à hauteur du leurre)
    for (const s of this.markers.children) {
      const near = Math.abs(s.userData.x - p.x) < 2.2;
      s.visible = near;
      if (near) s.position.y = p.y + this.Lm * 1.3;
    }

    this.updateCamera(dt);

    // particules : enroulement autour de la caméra
    const c = this.camera.position;
    const arr = this.particles.geometry.attributes.position.array;
    const box = 2.4;
    for (let i = 0; i < arr.length; i += 3) {
      const sx = this.particleSeed[i] * box, sy = this.particleSeed[i + 1] * box, sz = this.particleSeed[i + 2] * box;
      arr[i] = c.x - box / 2 + (((sx - c.x) % box) + box) % box;
      const py = c.y - box / 2 + (((sy - c.y + tt * 0.01) % box) + box) % box;
      arr[i + 1] = py > -0.005 ? -1000 : py;
      arr[i + 2] = c.z - box / 2 + (((sz - c.z) % box) + box) % box;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.sun.position.set(p.x + 0.3, 5, p.z + 0.4);
    this.sun.target.position.set(p.x, p.y, p.z);
  }

  spawnBubble(at, spread) {
    const b = this.bubbles.find((x) => !x.mesh.visible);
    if (!b) return;
    b.mesh.visible = true;
    b.mesh.position.set(at.x + (Math.random() - 0.5) * spread * 3, at.y + (Math.random() - 0.5) * spread, at.z + (Math.random() - 0.5) * spread);
    b.mesh.scale.setScalar(0.0008 + Math.random() * 0.0018);
    b.life = 1 + Math.random() * 1.5;
    b.vy = 0.08 + Math.random() * 0.12;
  }

  updateCamera(dt) {
    const p = this.pivot.position;
    const L = this.Lm || 0.06;
    let pos, target = p.clone();
    switch (this.camMode) {
      case 'top': pos = new THREE.Vector3(p.x + 0.0001, p.y + L * 6, p.z); break;
      case 'behind': pos = new THREE.Vector3(p.x + L * 5, p.y + L * 1.2, p.z + L * 0.6); break;
      case 'wide': pos = new THREE.Vector3(p.x + 0.4, p.y + 0.15, 1.6); target = new THREE.Vector3(p.x - 0.4, p.y, 0); break;
      case 'free': {
        if (this.snapCamera) {
          this.camera.position.set(p.x + L * 2, p.y + L * 2, p.z + L * 5);
          this.controls.target.copy(p);
          this.snapCamera = false;
        } else {
          const delta = p.clone().sub(this.controls.target);
          this.camera.position.add(delta);
          this.controls.target.copy(p);
        }
        this.controls.update();
        return;
      }
      default: pos = new THREE.Vector3(p.x - L * 0.4, p.y + L * 0.5, p.z + L * 4.6);
    }
    if (this.snapCamera) { this.camPos.copy(pos); this.camTarget.copy(target); this.snapCamera = false; }
    const k = Math.min(1, dt * 6 + 0.02);
    this.camPos.lerp(pos, k);
    this.camTarget.lerp(target, Math.min(1, k * 1.5));
    this.camera.position.copy(this.camPos);
    if (this.camera.position.y > -0.01 && this.camMode !== 'top') this.camera.position.y = -0.01;
    this.camera.lookAt(this.camTarget);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
