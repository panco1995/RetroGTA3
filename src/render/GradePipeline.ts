/**
 * 全画面统一质感。
 *
 * 烘焙出来的角色/车是 3D 软光，程序化的街和楼是平涂。
 * 进游戏之后都走这一道：色阶把两边的明暗和饱和度收到一起，
 * 强边缘描一圈暗线，暗角把视线收在路中间。
 * 挂在主相机上，HUD 不走这道（见 StreetScene）。
 */
import Phaser from 'phaser';

const FRAG = [
  '#define SHADER_NAME GRADE_FS',
  'precision mediump float;',
  'uniform sampler2D uMainSampler;',
  'uniform vec2 uTexel;',
  'varying vec2 outTexCoord;',
  'float luma(vec3 c) {',
  '  return dot(c, vec3(0.299, 0.587, 0.114));',
  '}',
  'void main() {',
  '  vec4 src = texture2D(uMainSampler, outTexCoord);',
  '  vec3 c = src.rgb;',
  '  c = clamp((c - 0.035) / 0.90, 0.0, 1.0);',
  '  c = pow(c, vec3(0.96));',
  '  c = (c - 0.5) * 1.14 + 0.48;',
  '  float y = luma(c);',
  '  c = mix(vec3(y), c, 0.84);',
  '  c = mix(c, c * vec3(0.90, 0.93, 1.02), smoothstep(0.55, 0.08, y));',
  '  float l = luma(c);',
  '  float lL = luma(texture2D(uMainSampler, outTexCoord + vec2(-uTexel.x, 0.0)).rgb);',
  '  float lR = luma(texture2D(uMainSampler, outTexCoord + vec2(uTexel.x, 0.0)).rgb);',
  '  float lU = luma(texture2D(uMainSampler, outTexCoord + vec2(0.0, -uTexel.y)).rgb);',
  '  float lD = luma(texture2D(uMainSampler, outTexCoord + vec2(0.0, uTexel.y)).rgb);',
  '  float edge = length(vec2(lR - lL, lD - lU));',
  '  float ink = smoothstep(0.22, 0.50, edge);',
  '  c = mix(c, vec3(0.06, 0.065, 0.07), ink * 0.88);',
  '  vec2 p = (outTexCoord - 0.5) * vec2(1.15, 1.0);',
  '  float vig = smoothstep(0.38, 0.92, length(p));',
  '  c *= mix(1.0, 0.58, vig);',
  '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);',
  '}',
].join('\n');

export class GradePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({ game, name: 'Grade', fragShader: FRAG });
  }

  onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
    const w = this.renderer.width || 1;
    const h = this.renderer.height || 1;
    this.set2f('uTexel', 1 / w, 1 / h);
    this.bindAndDraw(renderTarget);
  }
}

/** 主相机挂上统一后处理。没有 WebGL 时跳过，游戏照常跑。 */
export function mountGrade(scene: Phaser.Scene): void {
  const renderer = scene.game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
  renderer.pipelines.addPostPipeline('Grade', GradePipeline);
  const cam = scene.cameras.main;
  if (!cam.hasPostPipeline) cam.setPostPipeline('Grade');
}
