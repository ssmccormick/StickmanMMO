// ============================================================
// Orbit-follow camera. Mouse-look drives yaw/pitch; the camera
// trails the player at an adjustable distance (scroll to zoom).
// Collides against terrain so it never sinks underground.
// ============================================================
import * as THREE from 'three';
import { heightAt } from './world.js';

export class FollowCamera {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0;
    this.pitch = 0.2;        // resting framing: near-level, slightly down
    this.dist = 9;
    this.minDist = 4;
    this.maxDist = 18;
    this.baseSensitivity = 0.0024;
    this.sensitivity = 0.0024;   // = baseSensitivity * settings.lookSens
    this.invertY = false;
    this.target = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    // Scratch vectors reused every frame in update() — no per-frame allocation.
    this._aimTarget = new THREE.Vector3();
    this._back = new THREE.Vector3();
    this._scratchPos = new THREE.Vector3();
  }

  handleLook(dx, dy) {
    this.yaw -= dx * this.sensitivity;
    this.pitch += (this.invertY ? -dy : dy) * this.sensitivity;
    // Full vertical range: you can crane essentially straight up at the sky (and
    // flying foes) or look steeply down. Negative = looking up.
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.52, 1.45);
  }
  handleZoom(w) {
    this.dist = THREE.MathUtils.clamp(this.dist + w * 1.2, this.minDist, this.maxDist);
  }

  // The horizontal forward direction the camera faces (for movement).
  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }
  // The forward direction for AIMING — this is EXACTLY the camera's view
  // direction, so the crosshair points where shots go. Looking up aims (and
  // fires) up; looking down aims down. Used by ranged attacks, projectiles,
  // and beams.
  aimForward() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, -sp, -Math.cos(this.yaw) * cp).normalize();
  }
  right() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }

  update(targetPos, dt) {
    // Aim at roughly chest height.
    this._aimTarget.set(targetPos.x, targetPos.y + 1.6, targetPos.z);
    this.target.lerp(this._aimTarget, Math.min(1, dt * 12));

    // The camera POSITION orbits using a pitch that won't tuck it directly under
    // the player (so the player never blocks a straight-up view) — but the LOOK
    // direction below uses the TRUE pitch, so you can still aim fully skyward.
    const pp = Math.max(this.pitch, -0.85);
    const cp = Math.cos(pp), sp = Math.sin(pp);
    // Unit vector from the focus out to the camera: behind by yaw, raised or
    // (when looking up) LOWERED by pitch.
    const back = this._back.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);

    // Place the camera `dist` behind the focus, then — if that would clip into
    // the ground (which happens when you look up and the camera dips low) — pull
    // it IN toward the player along the same ray until it clears the terrain.
    // Sliding inward keeps the view DIRECTION (so it stays tilted skyward) and
    // brings the camera toward the player, instead of shoving it straight up and
    // flattening the view.
    const clear = 0.6;
    const lo = 1.0;              // how close the camera may slide to the player
    let dist = this.dist;
    const pos = this._scratchPos.copy(this.target).addScaledVector(back, dist);
    let g = heightAt(pos.x, pos.z) + clear;
    let guard = 16;
    while (pos.y < g && dist > lo && guard-- > 0) {
      dist = Math.max(lo, dist - this.dist * 0.08);
      pos.copy(this.target).addScaledVector(back, dist);
      g = heightAt(pos.x, pos.z) + clear;
    }
    if (pos.y < g) pos.y = g; // still buried (very steep terrain) — ride just above it
    this._pos.copy(pos);

    this.cam.position.lerp(this._pos, Math.min(1, dt * 14));
    // Orient straight from yaw/pitch (YXZ euler) rather than lookAt — this is
    // stable even pointing essentially straight up/down (no gimbal flip), and it
    // matches aimForward() exactly, so the crosshair and shots always agree.
    this.cam.rotation.order = 'YXZ';
    this.cam.rotation.set(-this.pitch, this.yaw, 0);
  }
}
