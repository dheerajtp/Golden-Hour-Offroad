import * as THREE from 'three';
import { KEYS, CAMERA, LIGHT_GAIN, CONFIG } from '../config.js';

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

const SKY_FRAG = `
uniform vec3 uTop;
uniform vec3 uBot;
uniform float uStars;
varying vec3 vDir;
float hash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
}
void main() {
  float h = smoothstep(-0.06, 0.45, vDir.y);
  vec3 col = mix(uBot, uTop, pow(h, 0.85));
  vec3 cell = floor(vDir * 220.0);
  float s = hash(cell);
  float star = smoothstep(0.9965, 1.0, s) * uStars * smoothstep(0.0, 0.25, vDir.y);
  col += vec3(star);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

function lerpN(a, b, f) { return a + (b - a) * f; }

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.nightFactor = 0;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.t = 0;

    this.uniforms = {
      uTop: { value: new THREE.Color(KEYS[0].skyTop) },
      uBot: { value: new THREE.Color(KEYS[0].skyBot) },
      uStars: { value: 0 },
    };
    const geo = new THREE.SphereGeometry(CAMERA.far - 200, 32, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.dome = new THREE.Mesh(geo, mat);
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xffd9a0, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55;
    sc.near = 1; sc.far = 320;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffb88a, 0xc9a24b, 0.5);
    scene.add(this.hemi);

    this.fog = new THREE.Fog(0xffc9a0, 60, 260);
    scene.fog = this.fog;

    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 64;
    const gctx = glowCanvas.getContext('2d');
    const grad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 64, 64);
    const glowTex = new THREE.CanvasTexture(glowCanvas);

    this.moon = new THREE.Group();
    this.moonDisc = new THREE.Mesh(
      new THREE.CircleGeometry(16, 32),
      new THREE.MeshBasicMaterial({ color: 0xf2f5fa, transparent: true, fog: false, depthWrite: false }),
    );
    this.moonGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(96, 96),
      new THREE.MeshBasicMaterial({ map: glowTex, color: 0xdfe8ff, transparent: true, opacity: 0, fog: false, depthWrite: false }),
    );
    this.moonGlow.position.z = -1;
    this.moonDisc.frustumCulled = false;
    this.moonGlow.frustumCulled = false;
    this.moon.add(this.moonGlow, this.moonDisc);
    this.moon.visible = false;
    scene.add(this.moon);

    this._ca = new THREE.Color();
    this._cb = new THREE.Color();
    this._a = {};
    this._b = {};
  }

  #segment(t) {
    let k = 0;
    while (k < KEYS.length - 2 && KEYS[k + 1].t <= t) k++;
    const a = KEYS[k], b = KEYS[k + 1];
    const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
    return [a, b, Math.min(1, Math.max(0, f))];
  }

  #mixColor(target, ha, hb, f) {
    this._ca.setHex(ha);
    this._cb.setHex(hb);
    target.copy(this._ca).lerp(this._cb, f);
  }

  update(t, sunFollow) {
    this.t = t;
    const [a, b, f] = this.#segment(t);

    this.#mixColor(this.uniforms.uTop.value, a.skyTop, b.skyTop, f);
    this.#mixColor(this.uniforms.uBot.value, a.skyBot, b.skyBot, f);
    this.uniforms.uStars.value = lerpN(a.stars, b.stars, f);

    const fogC = this._ca.setHex(a.fog).lerp(this._cb.setHex(b.fog), f);
    this.fog.color.copy(fogC);

    this.sun.color.setHex(a.sun).lerp(this._cb.setHex(b.sun), f);
    this.sun.intensity = lerpN(a.sunI, b.sunI, f) * LIGHT_GAIN;
    this.hemi.color.setHex(a.hemiSky).lerp(this._cb.setHex(b.hemiSky), f);
    this.hemi.groundColor.setHex(a.hemiGround).lerp(this._cb.setHex(b.hemiGround), f);
    this.hemi.intensity = lerpN(a.hemiI, b.hemiI, f) * LIGHT_GAIN;

    const elev = lerpN(a.elev, b.elev, f) * Math.PI / 180;
    const az = (t - 0.25) * Math.PI * 2;
    this.sunDir.set(
      Math.sin(az) * Math.cos(elev),
      Math.sin(elev),
      Math.cos(az) * Math.cos(elev),
    ).normalize();

    const dark = Math.max(0, Math.min(1, (-elev * 180 / Math.PI + 4) / 14));
    this.nightFactor = dark;

    if (sunFollow) {
      this.sun.position.copy(sunFollow).addScaledVector(this.sunDir, 150);
      this.sun.target.position.copy(sunFollow);
      this.sun.target.updateMatrixWorld();
    }

    const moonOp = CONFIG.atmosphere.moon
      ? Math.max(0, Math.min(1, (this.nightFactor - 0.15) / 0.35))
      : 0;
    this.moon.visible = moonOp > 0.02 && !!sunFollow;
    if (this.moon.visible) {
      this.moon.position.copy(sunFollow).addScaledVector(this.sunDir, -900);
      this.moon.lookAt(sunFollow);
      this.moonDisc.material.opacity = moonOp;
      this.moonGlow.material.opacity = 0.12 * moonOp;
    }
  }
}
