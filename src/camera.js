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
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.25, 1.25);
  }
  handleZoom(w) {
    this.dist = THREE.MathUtils.clamp(this.dist + w * 1.2, this.minDist, this.maxDist);
  }

  // The horizontal forward direction the camera faces (for movement).
  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }
  right() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }

  update(targetPos, dt) {
    // Aim at roughly chest height.
    this.target.lerp(new THREE.Vector3(targetPos.x, targetPos.y + 1.6, targetPos.z), Math.min(1, dt * 12));

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * cp,
      sp,
      Math.cos(this.yaw) * cp
    ).multiplyScalar(this.dist);

    this._pos.copy(this.target).add(offset);

    // Keep the camera above the terrain.
    const ground = heightAt(this._pos.x, this._pos.z) + 1.2;
    if (this._pos.y < ground) this._pos.y = ground;

    this.cam.position.lerp(this._pos, Math.min(1, dt * 14));
    this.cam.lookAt(this.target);
  }
}
