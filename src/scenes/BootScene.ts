import Phaser from 'phaser';
import { StreetScene } from './StreetScene';

/**
 * 启动场景：加载程序化生成的图集
 *
 * 素材是 `npm run gen` 生成的 atlas.png + atlas.json，
 * 一张纹理，62 个帧。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    const bar = this.add.rectangle(640, 360, 0, 8, 0x7edc85).setOrigin(0.5, 0.5);
    const label = this.add
      .text(640, 396, '载入素材…', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#8d95a1',
      })
      .setOrigin(0.5);
    this.load.on('progress', (p: number) => bar.setSize(480 * p, 8));
    this.load.on('complete', () => {
      bar.destroy();
      label.destroy();
    });

    this.load.atlas('proc', 'assets/proc/atlas.png', 'assets/proc/atlas.json');
  }

  create(): void {
    this.scene.start('street');
  }
}
