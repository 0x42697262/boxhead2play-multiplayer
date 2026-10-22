import { sign } from '../math/scalar.ts';
import { BRIGHTNESS_STEP, INITIAL_BRIGHTNESS, SHAKE_DAMPING, SHAKE_LIMIT_PX, SHAKE_REST_PX } from './tuning.ts';

export class ScreenEffects {
  shakeX = 0;
  shakeY = 0;
  brightness: number = INITIAL_BRIGHTNESS;

  get shakeLength(): number {
    return Math.sqrt(this.shakeX * this.shakeX + this.shakeY * this.shakeY);
  }

  shake(dx: number, dy: number): void {
    if (this.shakeLength >= SHAKE_LIMIT_PX) return;
    this.shakeX += dx;
    this.shakeY += dy;
  }

  decayShake(): void {
    this.shakeX *= SHAKE_DAMPING;
    this.shakeY *= SHAKE_DAMPING;
    if (this.shakeLength < SHAKE_REST_PX) {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  flash(level: number): void {
    this.brightness = level;
  }

  decayBrightness(): number {
    if (this.brightness === 0) return 0;
    this.brightness -= BRIGHTNESS_STEP * sign(this.brightness);
    if (Math.abs(this.brightness) < BRIGHTNESS_STEP) this.brightness = 0;
    return this.brightness;
  }
}
