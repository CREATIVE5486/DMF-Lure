// Scène 3D sous-marine de la simulation de nage (lancer-ramener, traîne derrière bateau, arrêt / flottaison).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildLure, disposeObject } from './lureModel.js';
import { lineTiePoint } from './geometry.js';
import { SwimPhysics, makeHydro, defaultSwimParams } from './swimPhysics.js';
import { fmtDepth } from './units.js';

const WATER_COLOR = 0x1d5d6c;
const TILE = 60; // décor répété (monde infini pour la traîne)

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
  t.repeat.set(60, 60);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.font = '700 52px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.shadowColor = 'rgba(0,0,0,0.4)';
  g.shadowBlur = 8;
  g.fillText(text, 128, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0.65, depthWrite: false, fog: true }));
  s.scale.set(0.1, 0.0375, 1);
  return s;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#8fc9ec');
  gr.addColorStop(1, '#e8f6ff');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SwimView {
  constructor(renderer, dom) {
    this.renderer = renderer;
    this.dom = dom;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(WATER_COLOR);
    this.scene.fog = new THREE.FogExp2(WATER_COLOR, 0.38);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 300);
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
    this.scene.add(sun, sun.target);
    this.sun = sun;

    this.surfaceMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform float time; varying vec3 vW;
        void main(){
          vec2 p = vW.xz*3.0;
          float r = sin(p.x*2.1+time*1.3)*sin(p.y*1.7-time*1.1) + sin((p.x+p.y)*3.3+time*2.0)*0.5;
          float l = smoothstep(0.6,1.4,r);
          vec3 c = mix(vec3(0.42,0.75,0.8), vec3(0.85,0.97,1.0), l);
          gl_FragColor = vec4(c, 0.55 + l*0.3);
        }`,
    });
    this.surface = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.surfaceMat);
    this.surface.rotation.x = Math.PI / 2;
    this.scene.add(this.surface);

    this.bottom = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 1 }));
    this.bottom.rotation.x = -Math.PI / 2;
    this.scene.add(this.bottom);
    this.decor = new THREE.Group();
    this.scene.add(this.decor);
    this.buildDecor();

    // vue « aquarium » au ras de l'eau (mode arrêt) : ciel derrière + vitre teintée sous la surface
    this.sky = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), new THREE.MeshBasicMaterial({ map: skyTexture(), fog: false }));
    this.glass = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), new THREE.MeshBasicMaterial({ color: 0x1b6a7a, transparent: true, opacity: 0.32, depthWrite: false, fog: false }));
    this.waterline = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-3, 0, 0), new THREE.Vector3(3, 0, 0)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false }));
    this.sky.visible = this.glass.visible = this.waterline.visible = false;
    this.scene.add(this.sky, this.glass, this.waterline);

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
    this.particles = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xd8eeea, size: 0.006, map: new THREE.CanvasTexture(dot), transparent: true, opacity: 0.75, depthWrite: false }));
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);

    this.linePts = new Float32Array(48 * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePts, 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xe8f4f2, transparent: true, opacity: 0.75 }));
    this.line.frustumCulled = false;
    this.scene.add(this.line);

    // bateau (traîne)
    this.boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 2.2), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 }));
    hull.position.y = 0.2;
    const keel = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 4), new THREE.MeshStandardMaterial({ color: 0x2a3b4a }));
    keel.rotation.z = Math.PI / 2;
    keel.position.set(-3.6, 0.2, 0);
    this.boat.add(hull, keel);
    this.scene.add(this.boat);

    this.bubbles = [];
    const bg = new THREE.SphereGeometry(1, 8, 6);
    const bm = new THREE.MeshBasicMaterial({ color: 0xe6fbff, transparent: true, opacity: 0.55 });
    for (let i = 0; i < 90; i++) {
      const b = new THREE.Mesh(bg, bm);
      b.visible = false;
      this.scene.add(b);
      this.bubbles.push({ mesh: b, life: 0, vy: 0 });
    }
    this.bubbleTimer = 0;

    this.markers = new THREE.Group();
    this.scene.add(this.markers);
    this.markerCache = new Map();

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.lure = null;
    this.camPos = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.onFinish = null;
    this.lastEventCount = 0;
  }

  setDesign(design, painter, mp) {
    this.design = design;
    this.mp = mp;
    if (this.lure) { this.pivot.remove(this.lure); disposeObject(this.lure); }
    this.lure = buildLure(design, painter?.texture, { hardware: true, simpleLip: true, nu: 110, nt: 80, foil: painter?.foilTexture });
    this.lure.scale.setScalar(0.001);
    this.lure.position.set(-mp.cg[0] * 0.001, -mp.cg[1] * 0.001, -mp.cg[2] * 0.001);
    this.pivot.add(this.lure);
    this.tieLocal = lineTiePoint(design).point.clone().sub(new THREE.Vector3(...mp.cg)).multiplyScalar(0.001);
    this.hydro = makeHydro(design, mp, this.params.water);
    if (!this.sim) this.sim = new SwimPhysics(this.hydro, this.params);
    else this.sim.setHydro(this.hydro);
    this.Lm = Math.max(0.04, design.body.length / 1000);
    this.Wm = (mp.dims.width || 20) / 1000;
  }

  // Réglages appliqués à chaud : la simulation continue
  setParams(p, { restart = false } = {}) {
    Object.assign(this.params, p);
    if (!this.sim) return;
    this.sim.setParams(p);
    if (p.water && this.design) { this.hydro = makeHydro(this.design, this.mp, this.params.water); this.sim.setHydro(this.hydro); }
    if (p.depth !== undefined) this.bottom.position.y = -this.params.depth;
    if (p.scenario) this.snapCamera = true;
    if (restart) this.restart();
  }

  restart() {
    if (!this.sim) return;
    this.sim.reset();
    this.lastEventCount = 0;
    this.bottom.position.y = -this.params.depth;
    this.playing = true;
    this.snapCamera = true;
  }

  buildDecor() {
    for (const c of [...this.decor.children]) { this.decor.remove(c); c.geometry.dispose(); }
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a5b52, roughness: 0.95, flatShading: true });
    const weedMat = new THREE.MeshStandardMaterial({ color: 0x3f6b35, roughness: 0.9, side: THREE.DoubleSide });
    let seed = 42;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 170; i++) {
      const s = 0.05 + r() * 0.35;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
      m.userData = { bx: r() * TILE - TILE / 2, by: s * 0.3, kind: 'rock' };
      m.position.z = (r() - 0.5) * 8;
      m.scale.y = 0.5 + r() * 0.5;
      m.rotation.set(r() * 3, r() * 3, r() * 3);
      this.decor.add(m);
    }
    for (let i = 0; i < 240; i++) {
      const hgt = 0.2 + r() * 1.2;
      const g = new THREE.PlaneGeometry(0.035, hgt, 1, 4);
      g.translate(0, hgt / 2, 0);
      const m = new THREE.Mesh(g, weedMat);
      m.userData = { bx: r() * TILE - TILE / 2, by: 0, kind: 'weed', sway: r() * 6 };
      m.position.z = (r() - 0.5) * 8;
      m.rotation.y = r() * 3;
      this.decor.add(m);
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

  depthLabel(d) {
    if (!this.markerCache.has(d)) {
      const s = labelSprite(fmtDepth(d, 0));
      this.markerCache.set(d, s);
      this.markers.add(s);
    }
    return this.markerCache.get(d);
  }

  update(dtReal) {
    if (!this.sim) return;
    const sim = this.sim;
    const dt = Math.min(0.05, dtReal) * this.playback;
    if (this.playing && !sim.finished) {
      const sub = 1 / 500;
      let acc = dt;
      while (acc > 1e-6) { const s = Math.min(sub, acc); sim.step(s); acc -= s; }
      if (sim.finished) {
        if (this.onFinish) this.onFinish(sim);
        // lancer suivant automatique : la nage continue sans intervention
        this.autoRecast = 1.2;
      }
    } else if (sim.finished && this.autoRecast !== undefined && this.playing) {
      this.autoRecast -= dt;
      if (this.autoRecast <= 0) { this.autoRecast = undefined; this.restart(); }
    }
    const tt = (this.surfaceMat.uniforms.time.value += dt);
    const p = sim.pos;
    const stop = this.params.scenario === 'stop';
    this.pivot.position.set(p.x, p.y, p.z);
    this.pivot.rotation.set(sim.roll, sim.yaw, sim.pitch, 'YZX');
    for (const hp of this.lure.userData.hookPivots) {
      const target = -sim.pitch * 0.85 + Math.sin(sim.phase * 0.5) * 0.08;
      hp.rotation.z += (target - hp.rotation.z) * Math.min(1, dt * 8);
      hp.rotation.x = -sim.roll * 0.6;
    }
    const speed = Math.hypot(sim.vel.x, sim.vel.y);
    const ud = this.lure.userData;
    if (ud.skirt) ud.skirt.userData.update(tt, speed);
    if (ud.paddle) ud.paddle.rotation.y = Math.sin(sim.phase * 1.4) * 0.5 * Math.min(1, speed / 0.4);

    // fil (vers le scion, ou vers le bateau en traîne)
    const tie = this.tieLocal.clone().applyEuler(this.pivot.rotation).add(this.pivot.position);
    const rod = new THREE.Vector3(sim.rodX, this.params.rodHeight, 0);
    this.line.visible = !stop;
    if (!stop) {
      const dist = tie.distanceTo(rod);
      const slack = Math.max(0, sim.lineLen - dist);
      const mid = tie.clone().lerp(rod, 0.5);
      mid.y -= Math.min(3, slack * 0.6 + 0.015 * dist * (sim.tension < 0.01 ? 1 : 0.15));
      for (let i = 0; i < 48; i++) {
        const t = i / 47;
        const a = tie.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(mid, 2 * (1 - t) * t).addScaledVector(rod, t * t);
        this.linePts.set([a.x, a.y, a.z], i * 3);
      }
      this.line.geometry.attributes.position.needsUpdate = true;
    }
    this.boat.visible = this.params.scenario === 'troll';
    this.boat.position.set(sim.rodX - 2.5, 0, 0);

    // bulles
    this.bubbleTimer -= dt;
    const fast = speed > 1.3 || sim.dart > 0.6;
    const evs = sim.events.length;
    if (evs > this.lastEventCount) { for (let i = 0; i < 10; i++) this.spawnBubble(tie, 0.02); this.lastEventCount = evs; }
    if (fast && this.bubbleTimer <= 0 && p.y < -0.02) { this.spawnBubble(tie, 0.01); this.bubbleTimer = 0.04; }
    for (const b of this.bubbles) {
      if (!b.mesh.visible) continue;
      b.life -= dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.x += Math.sin(b.life * 9) * 0.0008;
      if (b.life <= 0 || b.mesh.position.y > 0) b.mesh.visible = false;
    }

    // décor répété autour du leurre
    const d = this.params.depth;
    for (const m of this.decor.children) {
      const u = m.userData;
      m.position.x = p.x + ((((u.bx - p.x + TILE / 2) % TILE) + TILE) % TILE) - TILE / 2;
      m.position.y = -d + u.by;
      if (u.kind === 'weed') m.rotation.z = Math.sin(tt * 0.8 + u.sway) * 0.15;
    }
    this.bottom.position.x = p.x;

    // repères de profondeur près du leurre
    for (const s of this.markerCache.values()) s.visible = false;
    if (!stop) {
      const step = d > 15 ? 2 : 1;
      const center = Math.round(Math.max(0, -p.y) / step) * step;
      for (let k = -2; k <= 2; k++) {
        const dd = center + k * step;
        if (dd <= 0 || dd > d) continue;
        const s = this.depthLabel(dd);
        s.visible = true;
        s.position.set(p.x - this.Lm * 3, -dd, -0.25);
      }
    }

    // vue au ras de l'eau en mode arrêt
    this.sky.visible = this.glass.visible = this.waterline.visible = stop;
    if (stop) {
      this.sky.position.set(p.x, 1, p.z - 0.6);
      this.glass.position.set(p.x, -1, p.z + this.Wm * 0.5 + 0.004);
      this.waterline.position.set(p.x, 0.0005, p.z + this.Wm * 0.5 + 0.005);
      this.waterline.scale.set(this.Lm * 0.45, 1, 1);
    }

    this.updateCamera(dt);

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
    const stop = this.params.scenario === 'stop';
    let mode = this.camMode;
    if (stop && mode !== 'free' && mode !== 'top' && this.hydro?.restFloating && p.y > -0.2) mode = 'waterline';
    switch (mode) {
      case 'waterline': pos = new THREE.Vector3(p.x, 0.0001, p.z + L * 3.4); target = new THREE.Vector3(p.x, 0, p.z); break;
      case 'top': pos = new THREE.Vector3(p.x + 0.0001, p.y + L * 6, p.z); break;
      case 'behind': pos = new THREE.Vector3(p.x + L * 5, p.y + L * 1.2, p.z + L * 0.6); break;
      case 'wide': pos = new THREE.Vector3(p.x + 0.4, p.y + 0.25, 2.2); target = new THREE.Vector3(p.x - 0.6, p.y, 0); break;
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
    if (mode !== 'top' && mode !== 'waterline' && this.camera.position.y > -0.01) this.camera.position.y = -0.01;
    this.camera.lookAt(this.camTarget);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
