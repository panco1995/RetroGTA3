import Phaser from 'phaser';
import { BAKED_CELL, CAR_RUNTIME, bakedTextureKey, carTextureKey } from '../assets/baked';
import type { BakedAnim, NpcId } from '../assets/baked';
import { StreetScene } from './StreetScene';

/**
 * 启动场景：加载素材
 *
 * 两批素材：
 *   1. 程序化图集 proc（atlas.png + atlas.json）—— 地面/车辆/道具/建筑
 *   2. 烘焙角色 spritesheet —— 8 方向精灵，3D 模型离线渲染出来的
 *
 * 烘焙素材是「按需」的：manifest 里列了哪些动画就加载哪些，
 * 没烘焙过（没跑 `npm run bake`）也不会报错，引擎会退回纸片人方案。
 */
/** 行人只用到这三个动画（run 用于看到车时逃跑，death 留给后续战斗） */
const NPC_ANIMS: BakedAnim[] = ['idle', 'walk', 'run'];

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
    const onProgress = (p: number) => bar.setSize(480 * p, 8);
    this.load.on('progress', onProgress);
    this.load.once('complete', () => {
      this.load.off('progress', onProgress);
      bar.destroy();
      label.destroy();
    });

    this.load.atlas('proc', 'assets/proc/atlas.png', 'assets/proc/atlas.json');
    // 用 text 而不是 json 载入：文件缺失时拿到的是 404 页面，
    // JSON.parse 会抛未捕获异常；用 text + try/catch 才能优雅降级。
    this.load.text('baked-manifest', 'assets/proc/baked/manifest.json');
    this.load.text('car-manifest', 'assets/proc/baked/vehicles/manifest.json');
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      if (file.key === 'baked-manifest') {
        console.warn('[RetroGTA3] 没找到烘焙角色素材（跑 `npm run bake` 生成）。');
      }
      if (file.key === 'car-manifest') {
        console.warn('[RetroGTA3] 没找到烘焙车辆素材（跑 `npm run bake:vehicles` 生成）。');
      }
    });
  }

  /** 素材缺失时的提示屏（不再退回程序化方案了，那套已经废弃） */
  private showMissingAssets(lines: string[]): void {
    this.add
      .text(640, 300, '素材缺失', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#e9c24a',
      })
      .setOrigin(0.5);
    this.add
      .text(640, 360, lines.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#8d95a1',
        align: 'center',
      })
      .setOrigin(0.5);
  }

  create(): void {
    const raw = this.cache.text.get('baked-manifest');
    let manifest:
      | { animations?: string[]; cell?: number; npcs?: { id: string; animations: string[] }[] }
      | undefined;
    try {
      manifest = raw ? JSON.parse(raw) : undefined;
    } catch {
      manifest = undefined;
    }
    const anims = manifest?.animations ?? [];
    const cell = manifest?.cell || BAKED_CELL;

    // 车辆 manifest 先解析，因为缺车也得提示
    const carRaw = this.cache.text.get('car-manifest');
    let carManifest:
      | { cell?: number; anchor?: { x: number; y: number }; cars?: { id: string }[] }
      | undefined;
    try {
      carManifest = carRaw ? JSON.parse(carRaw) : undefined;
    } catch {
      carManifest = undefined;
    }
    const carIds = carManifest?.cars ?? [];

    // 烘焙素材缺失 → 明确提示，不再退回纸片人/程序化车（那套已经废弃）
    if (!anims.length || !carIds.length) {
      const lines: string[] = [];
      if (!anims.length) lines.push('npm run bake            # 角色');
      if (!carIds.length) lines.push('npm run bake:vehicles   # 载具');
      this.showMissingAssets(lines);
      return;
    }

    // 第二批：按 manifest 加载 spritesheet
    for (const anim of anims) {
      this.load.spritesheet(`baked_${anim}`, `assets/proc/baked/${anim}.png`, {
        frameWidth: cell,
        frameHeight: cell,
      });
    }
    // 车辆：32 方向多角度精灵
    // 单元尺寸和锚点是烘焙脚本按「全部车型的投影范围」算出来的，
    // 会随车型表变化，所以运行时从 manifest 取，写进 CAR_RUNTIME 给 Vehicle 用。
    if (carManifest?.cell) CAR_RUNTIME.cell = carManifest.cell;
    if (carManifest?.anchor) CAR_RUNTIME.anchor = { ...carManifest.anchor };
    for (const car of carIds) {
      this.load.spritesheet(
        carTextureKey(car.id as never),
        `assets/proc/baked/vehicles/${car.id}.png`,
        { frameWidth: CAR_RUNTIME.cell, frameHeight: CAR_RUNTIME.cell },
      );
    }

    // NPC 变体：同一套模型换色烘焙出来的
    for (const npc of manifest?.npcs ?? []) {
      for (const anim of npc.animations) {
        if (!NPC_ANIMS.includes(anim as BakedAnim)) continue;
        this.load.spritesheet(
          bakedTextureKey(anim as BakedAnim, npc.id as NpcId),
          `assets/proc/baked/npc/${npc.id}/${anim}.png`,
          { frameWidth: cell, frameHeight: cell },
        );
      }
    }
    this.load.once('complete', () => this.scene.start('street'));
    // Phaser 3.60+：preload 批次结束后 loader 状态是 COMPLETE，
    // 必须显式重新 start() 才会消费新加的文件。
    this.load.start();
  }
}
