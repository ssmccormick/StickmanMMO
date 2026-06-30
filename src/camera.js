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
    this.pitch = 0.42;       // looking slightly down
    this.neutralPitch = 0.42; // pitch at which aim is level (the resting framing)
    this.dist = 9;
    this.minDist = 4;
    this.maxDist = 18;
    this.baseSensitivity = 0.0024;
    this.sensitivity = 0.0024;   // = baseSensitivity * settings.lookSens
    this.invertY = false;
    this.target = new THREE.Vector3();
    this._pos = new THREE.Vector3();
  }

  handleLook(dx, dy) {
    this.yaw -= dx * this.sensitivity;
    this.pitch += (this.invertY ? -dy : dy) * this.sensitivity;
    // Wider vertical range so you can look up at the sky (and flying foes) or
    // steeply down. Negative = looking up, positive = looking down.
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.75, 1.45);
  }
  handleZoom(w) {
    this.dist = THREE.MathUtils.clamp(this.dist + w * 1.2, this.minDist, this.maxDist);
  }

  // The horizontal forward direction the camera faces (for movement).
  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }
  // The forward direction for AIMING — includes vertical tilt so you can fire
  // up or down. Level at the resting framing (neutralPitch); looking up/down
  // angles the shot up/down. Used by ranged attacks, projectiles, and beams.
  aimForward() {
    const a = THREE.MathUtils.clamp(this.pitch - this.neutralPitch, -1.25, 1.25);
    const cp = Math.cos(a), sp = Math.sin(a);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, -sp, -Math.cos(this.yaw) * cp).normalize();
  }
  right() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }

  update(targetPos, dt) {
    // Aim at roughly chest height.
    this.target.lerp(new THREE.Vector3(targetPos.x, targetPos.y + 1.6, targetPos.z), Math.min(1, dt * 12));

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // Unit vector from the focus out to the camera: behind by yaw, raised or
    // (when looking up) LOWERED by pitch.
    const back = new THREE.Vector3(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);

    // Place the camera `dist` behind the focus, then — if that would clip into
    // the ground (which happens when you look up and the camera dips low) — pull
    // it IN toward the player along the same ray until it clears the terrain.
    // Sliding inward keeps the view DIRECTION (so it stays tilted skyward) and
    // brings the camera toward the player, instead of shoving it straight up and
    // flattening the view.
    const clear = 0.9;
    const lo = this.minDist * 0.4;
    let dist = this.dist;
    let pos = this.target.clone().addScaledVector(back, dist);
    let g = heightAt(pos.x, pos.z) + clear;
    let guard = 12;
    while (pos.y < g && dist > lo && guard-- > 0) {
      dist = Math.max(lo, dist - this.dist * 0.1);
      pos = this.target.clone().addScaledVector(back, dist);
      g = heightAt(pos.x, pos.z) + clear;
    }
    if (pos.y < g) pos.y = g; // still buried (steep terrain) — ride just above it
    this._pos.copy(pos);

    this.cam.position.lerp(this._pos, Math.min(1, dt * 14));
    // Look along the orbit's view direction (-back) rather than straight at the
    // player. On the ideal ray this is identical to looking at the focus, but if
    // terrain pushed the camera off the ray it still aims where the pitch points
    // (up at the sky when you look up) instead of flattening back onto the player.
    const viewDir = back.clone().multiplyScalar(-1);
    this.cam.lookAt(this.cam.position.clone().add(viewDir));
  }
}
