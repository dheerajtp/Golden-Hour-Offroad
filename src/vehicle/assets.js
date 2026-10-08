import { GLTFLoader } from '../../vendor/loaders/GLTFLoader.js';

const BASE = 'assets/kenney/car-kit/';
const loader = new GLTFLoader();
const cache = new Map();

export function loadCar(name) {
  if (!cache.has(name)) {
    cache.set(name, new Promise((resolve, reject) => {
      loader.load(BASE + name, (gltf) => resolve(gltf.scene), undefined, reject);
    }));
  }
  return cache.get(name);
}
