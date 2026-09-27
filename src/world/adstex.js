// OWNER: billboards agent. (r3) ONE shared GPU copy of the ad atlas ts_ads.webp (4096^2, ~85 MB with mips): Times Square,
// city signage and street-prop ad faces all sample the same texture instead of uploading it three times.
import * as THREE from 'three';
let tex = null;
export function adsTexture() {
  if (!tex) {
    tex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/city/tex/ts_ads.webp`);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  }
  return tex;
}
