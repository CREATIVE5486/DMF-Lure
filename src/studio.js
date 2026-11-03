// Vue « atelier » : affichage 3D du leurre (conception, peinture) et du plateau d'impression.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildLure, disposeObject } from './lureModel.js';
import { soupToGeometry } from './geometry.js';
import { printSoupToThree } from './export.js';

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class Studio {
  constructor(renderer, dom) {
    this.renderer = renderer;
    this.dom = dom;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.9;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.5, 8000);
    this.camera.position.set(25, 18, 150);
    this.controls = new OrbitControls(this.camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 1200;

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(60, 120, 90);
    const rim = new THREE.DirectionalLight(0x9fe8ff, 0.8);
    rim.position.set(-80, 30, -100);
    this.scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.15));

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);

    this.grid = new THREE.GridHelper(400, 40, 0x2b5560, 0x173540);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.35;
    this.scene.add(this.grid);

    // marqueurs CG / CB
    this.markers = new THREE.Group();
    const mk = (color) => new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
    this.cgMarker = mk(0xff5a5a);
    this.cbMarker = mk(0x45c8ff);
    this.cgMarker.renderOrder = this.cbMarker.renderOrder = 10;
    this.markers.add(this.cgMarker, this.cbMarker);
    this.markers.visible = false;

    this.bed = this.makeBed();
    this.bed.visible = false;
    this.scene.add(this.bed);
    this.parts = new THREE.Group();
    this.scene.add(this.parts);

    this.mode = 'design';
    this.lure = null;
    this.tween = null;
    this.options = { hardware: true, wireframe: false, markers: false, xray: false };
  }

  makeBed() {
    const g = new THREE.Group();
    const size = 256;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(size, 2, size), new THREE.MeshStandardMaterial({ color: 0x1d2b31, roughness: 0.7, metalness: 0.2 }));
    plate.position.y = -1;
    const grid = new THREE.GridHelper(size, 32, 0x3f6f7a, 0x2a4a53);
    grid.position.y = 0.05;
    g.add(plate, grid);
    return g;
  }

  setLure(design, texture) {
    if (this.lure) { this.root.remove(this.lure); disposeObject(this.lure); }
    this.lure = buildLure(design, texture, { hardware: this.options.hardware });
    const L = design.body.length;
    this.lure.add(this.markers);
    this.root.add(this.lure);
    const bb0 = new THREE.Box3().setFromObject(this.lure);
    const c = bb0.getCenter(new THREE.Vector3());
    this.lure.position.set(-c.x, -c.y, 0);
    const first = !this.lureSize;
    this.lureSize = Math.max(L, bb0.max.x - bb0.min.x, (bb0.max.y - bb0.min.y) * 1.4);
    const body = this.lure.userData.body;
    body.material.wireframe = this.options.wireframe;
    if (this.options.xray) { body.material.transparent = true; body.material.opacity = 0.35; body.material.depthWrite = false; }
    const bb = new THREE.Box3().setFromObject(this.lure);
    this.floorY = bb.min.y - 6;
    this.shadow.position.y = this.floorY + 0.1;
    this.shadow.scale.set(L * 1.6, L * 0.7, 1);
    this.grid.position.y = this.floorY;
    if (first) this.view('reset', false);
  }

  setMarkers(cg, cb) {
    this.cgMarker.position.set(...cg);
    this.cbMarker.position.set(...cb);
  }

  setParts(parts) {
    for (const c of [...this.parts.children]) { this.parts.remove(c); c.geometry.dispose(); }
    const mat = {
      left: new THREE.MeshStandardMaterial({ color: 0xe9e1c6, roughness: 0.55 }),
      right: new THREE.MeshStandardMaterial({ color: 0xe9e1c6, roughness: 0.55 }),
      solid: new THREE.MeshStandardMaterial({ color: 0xe9e1c6, roughness: 0.55 }),
      lip: new THREE.MeshPhysicalMaterial({ color: 0xcfe9f5, roughness: 0.15, transparent: true, opacity: 0.85 }),
    };
    for (const p of parts) {
      const mesh = new THREE.Mesh(soupToGeometry(printSoupToThree(p.soup)), mat[p.key] || mat.left);
      mesh.userData.key = p.key;
      this.parts.add(mesh);
    }
  }

  setMode(mode) {
    this.mode = mode;
    const exp = mode === 'export';
    this.bed.visible = exp;
    this.parts.visible = exp;
    this.root.visible = !exp;
    this.shadow.visible = !exp;
    this.grid.visible = !exp && mode === 'design';
    this.markers.visible = mode === 'design' && this.options.markers;
    if (exp) this.view('bed', false); else if (mode === 'paint') this.view('left', false);
  }

  setOptions(o) {
    Object.assign(this.options, o);
    this.markers.visible = this.mode === 'design' && this.options.markers;
  }

  view(name, animate = true) {
    const L = this.lureSize || 60;
    const d = L * 2.7;
    const presets = {
      reset: [new THREE.Vector3(-L * 0.55, L * 0.35, d * 0.95), new THREE.Vector3(0, 0, 0)],
      left: [new THREE.Vector3(0, 0, d * 0.85), new THREE.Vector3(0, 0, 0)],
      right: [new THREE.Vector3(0, 0, -d * 0.85), new THREE.Vector3(0, 0, 0)],
      top: [new THREE.Vector3(0, d * 0.9, 0.01), new THREE.Vector3(0, 0, 0)],
      belly: [new THREE.Vector3(0, -d * 0.9, 0.01), new THREE.Vector3(0, 0, 0)],
      front: [new THREE.Vector3(-d * 0.9, 0, 0.01), new THREE.Vector3(0, 0, 0)],
      back: [new THREE.Vector3(d * 0.9, 0, 0.01), new THREE.Vector3(0, 0, 0)],
      bed: [new THREE.Vector3(0, 230, 190), new THREE.Vector3(0, 0, 0)],
    };
    const p = presets[name] || presets.reset;
    if (!animate) {
      this.camera.position.copy(p[0]);
      this.controls.target.copy(p[1]);
      this.tween = null;
      this.controls.update();
      return;
    }
    this.tween = { from: this.camera.position.clone(), fromT: this.controls.target.clone(), to: p[0], toT: p[1], t: 0 };
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  pick(clientX, clientY) {
    if (!this.lure) return null;
    const r = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const hit = rc.intersectObject(this.lure.userData.body, false)[0];
    return hit || null;
  }

  // Taille à l'écran (px) d'une longueur en mm au niveau du leurre
  pxPerMm() {
    const dist = this.camera.position.distanceTo(this.controls.target);
    const h = this.dom.clientHeight || 600;
    return h / (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
  }

  update(dt) {
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt * 2.6);
      const k = 1 - Math.pow(1 - tw.t, 3);
      this.camera.position.lerpVectors(tw.from, tw.to, k);
      this.controls.target.lerpVectors(tw.fromT, tw.toT, k);
      if (tw.t >= 1) this.tween = null;
    }
    this.controls.update();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  // Miniature rendue hors écran (sans scintillement)
  thumbnail(w = 320, h = 160) {
    if (!this.lure) return '';
    const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const cam = this.camera.clone();
    cam.aspect = w / h;
    const L = this.lureSize || 60;
    cam.position.set(-L * 0.3, L * 0.2, L * 2.3);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    const vis = [this.grid.visible, this.markers.visible];
    this.grid.visible = false;
    this.markers.visible = false;
    const r = this.renderer;
    r.setRenderTarget(rt);
    r.setClearColor(0x10262d, 1);
    r.clear();
    r.render(this.scene, cam);
    const px = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(rt, 0, 0, w, h, px);
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 0);
    [this.grid.visible, this.markers.visible] = vis;
    rt.dispose();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.8);
  }

  screenshot(w = 1600, h = 1000) {
    const r = this.renderer;
    const old = new THREE.Vector2();
    r.getSize(old);
    const oldPR = r.getPixelRatio();
    r.setPixelRatio(1);
    r.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    r.setClearColor(0x0d2128, 1);
    r.render(this.scene, this.camera);
    const url = r.domElement.toDataURL('image/png');
    r.setClearColor(0x000000, 0);
    r.setPixelRatio(oldPR);
    r.setSize(old.x, old.y, false);
    this.resize(old.x, old.y);
    return url;
  }
}
