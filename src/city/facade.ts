/**
 * 运行时把立面贴进 Phaser。
 * 拼装规则在 facade-draw.ts：按开间组合窗框 / 砖缝 / 招牌 / 空调机位，不进离线图集。
 */
import Phaser from 'phaser';
import { paintFacade, type FacadeSpec } from './facade-draw';

export {
  composeFacade,
  facadeSpec,
  paintFacade,
  pickWallHeight,
  FACADE_SHORT,
  FACADE_TALL,
} from './facade-draw';
export type {
  AcMode,
  Bond,
  FacadePlan,
  FacadeSpec,
  FacadeStyle,
  FrameStyle,
  GroundKind,
  Opening,
  OpeningKind,
  Rect,
  SignKind,
} from './facade-draw';

/** 每个 scene 一个 texture 计数器，保证 key 唯一 */
const counters = new WeakMap<Phaser.Scene, number>();
/** 每个 scene 记录自己创建的 texture，scene 关闭时销毁 */
const owned = new WeakMap<Phaser.Scene, string[]>();

/**
 * 生成一栋楼的立面并作为 Image 放进场景。
 * 贴图上沿是檐口，下沿是店面。南侧楼要翻过来，店面才朝向马路。
 */
export function createFacadeImage(
  scene: Phaser.Scene,
  spec: FacadeSpec,
  x: number,
  y: number,
): Phaser.GameObjects.Image {
  const n = (counters.get(scene) ?? 0) + 1;
  counters.set(scene, n);
  const key = `facade_${n}`;

  const tex = scene.textures.createCanvas(key, spec.width, spec.height);
  if (!tex) throw new Error(`创建立面贴图失败: ${key}`);
  paintFacade(tex.getContext(), spec);
  tex.refresh();

  const list = owned.get(scene) ?? [];
  list.push(key);
  owned.set(scene, list);

  return scene.add.image(x, y, key).setOrigin(0.5, 0.5);
}

/**
 * 场景关闭时销毁运行时生成的贴图，避免 TextureManager 泄漏。
 * 在 StreetScene 的 create() 里调一次即可。
 */
export function registerFacadeCleanup(scene: Phaser.Scene): void {
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    const list = owned.get(scene) ?? [];
    for (const key of list) {
      if (scene.textures.exists(key)) scene.textures.remove(key);
    }
    owned.set(scene, []);
    counters.set(scene, 0);
  });
}
