import { CameraControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import CameraControlsImpl from 'camera-controls';
import { EYE_HEIGHT } from '../lib/defaults';
import { bounds, planSegments, pointInPolygon, type Seg, type Vec2 } from '../lib/geometry';
import type { Design, ViewMode } from '../lib/types';
import { IN } from '../lib/units';
import type { Viewpoint } from '../lib/views';
import { viewpoints } from '../lib/views';
import { useStore } from '../store';
import { dragApi } from './Items';
import { hitPlane } from './placement';

const ORBIT_FOV = 36;
const PLAN_FOV = 30;

/** Latest camera pose (meters), for UI logic like "add this where I'm looking". */
export const viewInfo = { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) };

export const cameraApi = {
  goto: (_vp: Viewpoint) => {},
  home: () => {},
};

function distToSeg(p: Vec2, s: Seg) {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / l2));
  return Math.hypot(p.x - (s.a.x + dx * t), p.y - (s.a.y + dy * t));
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function CameraRig({ design }: { design: Design }) {
  const controls = useRef<CameraControlsImpl>(null!);
  const { camera, gl } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const mode = useStore((s) => s.mode);
  const dragging = useStore((s) => s.dragging);
  const renderActive = useStore((s) => s.render.active);
  const b = bounds(design.room.corners);
  const H = design.room.ceiling;

  const walk = useRef({ yaw: 0, pitch: 0, keys: new Set<string>(), goal: null as Vec2 | null, looking: false, lx: 0, ly: 0 });
  const tween = useRef<null | { t: number; dur: number; p0: THREE.Vector3; p1: THREE.Vector3; l0: THREE.Vector3; l1: THREE.Vector3; done?: () => void }>(null);
  const fovTarget = useRef(ORBIT_FOV);
  const segs = useRef<Seg[]>([]);
  segs.current = planSegments(design.room);
  const corners = useRef(design.room.corners);
  corners.current = design.room.corners;

  const home = () => {
    const d = Math.max(b.w, b.h);
    const pos = new THREE.Vector3((b.maxX + d * 0.95) * IN, (H * 2.3) * IN, (b.minY - d * 1.15) * IN);
    const target = new THREE.Vector3(b.cx * IN, 30 * IN, b.cy * IN);
    return { pos, target };
  };

  const planPose = () => {
    const d = Math.max(b.w, b.h) * 1.35;
    const dist = d / 2 / Math.tan(THREE.MathUtils.degToRad(PLAN_FOV / 2));
    return { pos: new THREE.Vector3(b.cx * IN, dist * IN, (b.cy + 0.01) * IN), target: new THREE.Vector3(b.cx * IN, 0, b.cy * IN) };
  };

  const lookDir = () => {
    const w = walk.current;
    return new THREE.Vector3(Math.sin(w.yaw) * Math.cos(w.pitch), Math.sin(w.pitch), Math.cos(w.yaw) * Math.cos(w.pitch));
  };

  const startTween = (p1: THREE.Vector3, l1: THREE.Vector3, dur: number, done?: () => void) => {
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const l0 = cam.position.clone().addScaledVector(dir, cam.position.distanceTo(l1));
    tween.current = { t: 0, dur, p0: cam.position.clone(), p1, l0, l1, done };
  };

  const enterWalk = (vp: Viewpoint) => {
    const p1 = new THREE.Vector3(vp.x * IN, EYE_HEIGHT * IN, vp.y * IN);
    const l1 = new THREE.Vector3(vp.lookX * IN, vp.lookH * IN, vp.lookY * IN);
    fovTarget.current = useStore.getState().fov;
    startTween(p1, l1, 1.4, () => {
      const d = l1.clone().sub(p1).normalize();
      walk.current.yaw = Math.atan2(d.x, d.z);
      walk.current.pitch = Math.asin(d.y);
    });
  };

  const applyMode = (m: ViewMode, first = false) => {
    if (m === 'walk') {
      const vps = viewpoints(design);
      enterWalk(vps[0] ?? { id: 'c', label: '', x: b.cx, y: b.cy, lookX: b.cx, lookY: b.minY, lookH: EYE_HEIGHT });
      return;
    }
    const c = controls.current;
    if (!c) return;
    tween.current = null;
    // Hand the current pose to the controls, then let them glide to the new one.
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const cur = cam.position.clone();
    c.setLookAt(cur.x, cur.y, cur.z, cur.x + dir.x, cur.y + dir.y, cur.z + dir.z, false);
    const pose = m === 'plan' ? planPose() : home();
    if (m === 'plan') {
      c.minPolarAngle = 0;
      c.maxPolarAngle = 0.0001;
      c.mouseButtons.left = CameraControlsImpl.ACTION.TRUCK;
      c.minAzimuthAngle = -Infinity;
      fovTarget.current = PLAN_FOV;
    } else {
      c.minPolarAngle = 0.05;
      c.maxPolarAngle = Math.PI * 0.495;
      c.mouseButtons.left = CameraControlsImpl.ACTION.ROTATE;
      fovTarget.current = ORBIT_FOV;
    }
    c.smoothTime = first ? 1.1 : 0.45;
    c.setLookAt(pose.pos.x, pose.pos.y, pose.pos.z, pose.target.x, pose.target.y, pose.target.z, true).then(() => {
      c.smoothTime = 0.25;
    });
  };

  // Intro: start high and far, glide in.
  useEffect(() => {
    const c = controls.current;
    const pose = home();
    c.setLookAt(pose.pos.x * 2.6, pose.pos.y * 3.2, pose.pos.z * 3.4, pose.target.x, pose.target.y, pose.target.z, false);
    requestAnimationFrame(() => applyMode('orbit', true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevMode = useRef(mode);
  useEffect(() => {
    if (prevMode.current !== mode) applyMode(mode);
    prevMode.current = mode;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    cameraApi.goto = (vp) => {
      if (useStore.getState().mode !== 'walk') {
        prevMode.current = 'walk';
        useStore.getState().setMode('walk');
      }
      enterWalk(vp);
    };
    cameraApi.home = () => applyMode(useStore.getState().mode);
  });

  // Walk-mode input
  useEffect(() => {
    const el = gl.domElement;
    const w = walk.current;
    const typing = (e: Event) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };
    const down = (e: PointerEvent) => {
      if (useStore.getState().mode !== 'walk' || e.button !== 0) return;
      w.looking = true;
      w.lx = e.clientX;
      w.ly = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (!w.looking || useStore.getState().dragging || dragApi.holding) return;
      const dx = e.clientX - w.lx;
      const dy = e.clientY - w.ly;
      w.lx = e.clientX;
      w.ly = e.clientY;
      const sens = 0.0032 * (useStore.getState().fov / 60);
      w.yaw -= dx * sens * -1;
      w.pitch = THREE.MathUtils.clamp(w.pitch + dy * sens, -1.3, 1.3);
      tween.current = null;
      w.goal = null;
    };
    const up = () => {
      w.looking = false;
    };
    const keydown = (e: KeyboardEvent) => {
      if (typing(e) || useStore.getState().mode !== 'walk') return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e', 'shift'].includes(k)) {
        w.keys.add(k);
        if (k.startsWith('arrow')) e.preventDefault();
      }
    };
    const keyup = (e: KeyboardEvent) => w.keys.delete(e.key.toLowerCase());
    const wheel = (e: WheelEvent) => {
      if (useStore.getState().mode !== 'walk') return;
      e.preventDefault();
      const f = THREE.MathUtils.clamp(useStore.getState().fov + e.deltaY * 0.03, 28, 90);
      useStore.setState({ fov: f });
      fovTarget.current = f;
    };
    const dbl = (e: MouseEvent) => {
      if (useStore.getState().mode !== 'walk') return;
      const r = el.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
      const p = hitPlane(ray.ray, 0);
      if (p && pointInPolygon(p, corners.current)) w.goal = p;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', () => w.keys.clear());
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('dblclick', dbl);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('dblclick', dbl);
    };
  }, [gl, cam]);

  const blocked = (p: Vec2) => {
    if (!pointInPolygon(p, corners.current)) return true;
    return segs.current.some((s) => distToSeg(p, s) < 7);
  };

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    viewInfo.pos.copy(cam.position);
    cam.getWorldDirection(viewInfo.dir);
    if (useStore.getState().render.active) return;
    // FOV glide
    if (Math.abs(cam.fov - fovTarget.current) > 0.01) {
      cam.fov = THREE.MathUtils.damp(cam.fov, fovTarget.current, 6, dt);
      cam.updateProjectionMatrix();
    }
    const tw = tween.current;
    if (tw) {
      tw.t += Math.min(rawDt, 0.25) / tw.dur;
      const k = ease(Math.min(1, tw.t));
      // Arc upward slightly mid-flight for a more cinematic path
      cam.position.lerpVectors(tw.p0, tw.p1, k);
      // Swoop in from outside with a gentle arc; moves within the room stay at eye level.
      if (tw.p0.y > EYE_HEIGHT * IN * 1.6) cam.position.y += Math.sin(k * Math.PI) * 0.04 * tw.p0.distanceTo(tw.p1);
      const look = new THREE.Vector3().lerpVectors(tw.l0, tw.l1, k);
      cam.lookAt(look);
      if (tw.t >= 1) {
        tween.current = null;
        tw.done?.();
      }
      return;
    }
    if (useStore.getState().mode !== 'walk') return;
    const w = walk.current;
    const speed = (w.keys.has('shift') ? 70 : 38) * dt; // inches / frame
    const fwd = new THREE.Vector2(Math.sin(w.yaw), Math.cos(w.yaw));
    const right = new THREE.Vector2(-fwd.y, fwd.x);
    const mv = new THREE.Vector2();
    if (w.keys.has('w') || w.keys.has('arrowup')) mv.add(fwd);
    if (w.keys.has('s') || w.keys.has('arrowdown')) mv.sub(fwd);
    if (w.keys.has('d') || w.keys.has('arrowright')) mv.add(right);
    if (w.keys.has('a') || w.keys.has('arrowleft')) mv.sub(right);
    if (w.keys.has('q')) w.yaw += 1.6 * dt;
    if (w.keys.has('e')) w.yaw -= 1.6 * dt;
    const pos = { x: cam.position.x / IN, y: cam.position.z / IN };
    if (w.goal) {
      const d = { x: w.goal.x - pos.x, y: w.goal.y - pos.y };
      const l = Math.hypot(d.x, d.y);
      if (l < 1) w.goal = null;
      else mv.set(d.x / l, d.y / l).multiplyScalar(Math.min(1, l / 12));
    }
    if (mv.lengthSq() > 0) {
      if (!w.goal) mv.normalize();
      const nx = { x: pos.x + mv.x * speed, y: pos.y };
      if (!blocked(nx)) pos.x = nx.x;
      const ny = { x: pos.x, y: pos.y + mv.y * speed };
      if (!blocked(ny)) pos.y = ny.y;
    }
    cam.position.x = THREE.MathUtils.damp(cam.position.x, pos.x * IN, 20, dt);
    cam.position.z = THREE.MathUtils.damp(cam.position.z, pos.y * IN, 20, dt);
    cam.position.y = THREE.MathUtils.damp(cam.position.y, EYE_HEIGHT * IN, 8, dt);
    const target = cam.position.clone().add(lookDir());
    cam.lookAt(target);
  });

  // drei updates the controls every frame even when disabled, so they must not exist while walking.
  if (mode === 'walk') return null;
  return (
    <CameraControls
      ref={controls}
      makeDefault
      enabled={!dragging && !renderActive}
      dollyToCursor
      minDistance={0.5}
      maxDistance={14}
      smoothTime={0.25}
      draggingSmoothTime={0.1}
      azimuthRotateSpeed={0.55}
      polarRotateSpeed={0.55}
      dollySpeed={0.6}
      maxPolarAngle={Math.PI * 0.495}
    />
  );
}
