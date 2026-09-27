// OWNER: systems engineer. Street-crime actors: thugs + civilians built from public/assets/thug.glb (same skeleton as
// Spider-Man, so the clips of spiderman.glb play on it directly, see public/assets/SPIDERMAN.md).
//   const A = createActors(ctx); await A.ready();  const a = A.spawn({ pos, yaw, variant: 'a'|'b'|'c', role: 'thug'|'victim' })
//   a.play('fightIdle') · a.face(vec3) · a.runTo(vec3, speed) · a.hit() · a.knockDown() · a.dispose()
// Actors are plain objects so the combat module can take them over (crime.enemies[i].actor / .object):
//   set actor.external = true and drive actor.root / actor.mixer yourself; this module then only ticks the mixer.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const VARIANT_TEX = { b: `${import.meta.env.BASE_URL}assets/tex/thug_basecolor_b.webp`, c: `${import.meta.env.BASE_URL}assets/tex/thug_basecolor_c.webp` };
const LOOPS = new Set(['idle', 'idleLook', 'walk', 'jog', 'run', 'sprint', 'fightIdle', 'jumpCrouch']);
const SPEED = { walk: 1.25, jog: 3.2, run: 5.8, sprint: 9.0 };

export function createActors(ctx) {
  let gltf = null, loading = null, clips = new Map();
  const tex = {};
  const actors = new Set();
  let seq = 0;

  function clipList() {
    // Spider-Man's clips may animate helper bones the thug rig doesn't have (e.g. glutes): drop those tracks so
    // PropertyBinding doesn't warn, and keep one filtered copy per clip
    const src = ctx.player?.rig?.allClips || [];
    const names = new Set(); gltf.scene.traverse(o => names.add(o.name));
    for (const c of src) {
      const tracks = c.tracks.filter(t => names.has(THREE.PropertyBinding.parseTrackName(t.name).nodeName));
      clips.set(c.name, tracks.length === c.tracks.length ? c : new THREE.AnimationClip(c.name, c.duration, tracks));
    }
  }
  function load() {
    if (loading) return loading;
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    loading = loader.loadAsync(`${import.meta.env.BASE_URL}assets/thug.glb`).then(g => {
      gltf = g; clipList();
      g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      return true;
    }).catch(e => { console.warn('[crimes] thug.glb unavailable', e); return false; });
    return loading;
  }
  function variantMap(v) {
    if (!VARIANT_TEX[v]) return null;
    if (!tex[v]) { tex[v] = new THREE.TextureLoader().load(VARIANT_TEX[v]); tex[v].colorSpace = THREE.SRGBColorSpace; tex[v].flipY = false; tex[v].anisotropy = 4; }
    return tex[v];
  }

  function spawn({ pos, yaw = 0, variant = 'a', role = 'thug' }) {
    if (!gltf) return null;
    const root = skeletonClone(gltf.scene); root.name = `crime-${role}-${++seq}`;
    root.traverse(o => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      const m = variantMap(variant); if (m) { o.material.map = m; o.material.needsUpdate = true; }
    });
    const g = new THREE.Group(); g.add(root); g.position.copy(pos); g.rotation.y = yaw;
    ctx.scene.add(g);
    const mixer = new THREE.AnimationMixer(root);
    const a = {
      id: `${role}_${seq}`, role, root: g, object: g, mixer, alive: true, down: false, hp: 2, external: false,
      cur: null, curName: '', move: null, faceTarget: null, lastHit: 0,
      play(name, { fade = 0.25, timeScale = 1, once = !LOOPS.has(name), then = null } = {}) {
        const clip = clips.get(name); if (!clip) return null;
        if (a.curName === name && !once) { a.cur.timeScale = timeScale; return a.cur; }
        const act = mixer.clipAction(clip); act.reset(); act.enabled = true; act.timeScale = timeScale;
        act.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); act.clampWhenFinished = once;
        if (a.cur && a.cur !== act) { act.crossFadeFrom(a.cur, fade, false); }
        act.play(); a.cur = act; a.curName = name; a.then = then; a.clipDur = clip.duration / Math.max(0.01, timeScale); a.clipT = 0;
        return act;
      },
      face(p, snap = false) { a.faceTarget = p.clone ? p.clone() : p; if (snap) { g.rotation.y = Math.atan2(p.x - g.position.x, p.z - g.position.z); } },
      runTo(p, speed = 5.8, clip = speed > 7 ? 'sprint' : speed > 4 ? 'run' : speed > 2 ? 'jog' : 'walk') {
        a.move = { to: p.clone(), speed }; a.play(clip, { timeScale: speed / (SPEED[clip] || speed) });
      },
      stop(clip = 'fightIdle') { a.move = null; a.play(clip); },
      hit() {
        if (a.down) return false;
        a.hp--; a.lastHit = performance.now();
        if (a.hp <= 0) { a.knockDown(); return true; }
        a.play('hitReact', { fade: 0.08, then: 'fightIdle' });
        return false;
      },
      knockDown() { a.down = true; a.alive = false; a.move = null; a.play('knockdown', { fade: 0.08 }); },
      update(dt) {
        mixer.update(dt);
        if (a.cur && a.then) { a.clipT += dt; if (a.clipT >= a.clipDur - 0.12) { const n = a.then; a.then = null; a.play(n, { fade: 0.2 }); } }
        if (a.external) return;
        if (a.move) {
          const d = new THREE.Vector3(a.move.to.x - g.position.x, 0, a.move.to.z - g.position.z); const L = d.length();
          if (L < 0.4) { a.move = null; a.onArrive?.(); }
          else {
            d.divideScalar(L); const st = Math.min(L, a.move.speed * dt);
            g.position.x += d.x * st; g.position.z += d.z * st;
            g.rotation.y = dampAngle(g.rotation.y, Math.atan2(d.x, d.z), 10, dt);
          }
        } else if (a.faceTarget && !a.down) {
          g.rotation.y = dampAngle(g.rotation.y, Math.atan2(a.faceTarget.x - g.position.x, a.faceTarget.z - g.position.z), 6, dt);
        }
        g.position.y = ctx.world.groundHeight(g.position.x, g.position.z, g.position.y + 1);
      },
      dispose() {
        actors.delete(a); ctx.scene.remove(g); mixer.stopAllAction();
        g.traverse(o => { if (o.isMesh) o.material.dispose(); });
      },
    };
    actors.add(a);
    a.play(role === 'victim' ? 'jumpCrouch' : 'fightIdle', { fade: 0 });
    return a;
  }

  return {
    ready: load, spawn, get loaded() { return !!gltf; }, actors,
    update(dt) { for (const a of actors) a.update(dt); },
  };
}

function dampAngle(a, b, rate, dt) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * (1 - Math.exp(-rate * dt)); }
