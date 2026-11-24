/**
 * 精灵图烘焙页（在无头 Chromium 里跑）
 *
 * 职责：加载一个带骨骼的 3D 模型，把指定动画的每一帧、
 * 从 8 个方位角用正交相机渲染成 2D 精灵。
 *
 * 这就是「3D → 2D 烘焙」：一次烘焙，引擎侧拿到的还是普通 PNG 图集，
 * 完全不用改游戏代码。
 *
 * 取景策略（关键）：
 *   1) 先用「大视野探针相机」把每一帧都渲一遍，量出真实的 alpha 包围盒；
 *   2) 用所有帧、所有方向的最大范围，反算出一台**保证不裁切**的正交相机；
 *   3) 这台相机对所有方向/帧完全一致 —— 缩放一致，脚底锚点一致，
 *      所以 8 个方向拼在一起不会有忽大忽小或跳动。
 *
 * 早期版本用「模型静止包围盒 × 系数」估算视野，结果走路摆臂时手臂
 * 会被切掉。现在改成实测包围盒，永远不会裁切。
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** 测量用探针分辨率（像素） */
const PROBE = 512;
/** 探针视野边长（世界单位），要足够大以免测量时就被裁掉 */
const PROBE_VIEW = 8;

const state = {
  renderer: null,
  scene: null,
  camera: null,
  model: null,
  mixer: null,
  clipsRaw: [],
  cellW: 64,
  cellH: 64,
  /** 相机俯角（度）。90 = 纯俯视，越小越接近侧面 */
  pitch: 70,
  /** 模型自身朝向与"屏幕下方"的夹角补偿（弧度） */
  forwardOffset: 0,
  /** 角色脚底锚点在单元里的纵向位置（0=顶部，1=底部） */
  anchorY: 0.66,
  /** 安全边距（相机视野放大倍数） */
  margin: 1.06,
  lightDir: new THREE.Vector3(-0.7, 1.0, 0.5),
  /** 'character' = 骨骼角色（8 方向 × 动画帧）；'object' = 静态物件（任意角度数） */
  mode: 'character',
  /** 物体模式的归一化目标长度（世界单位，取模型最长水平边） */
  objLength: 4,
};

function status(msg) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
}

async function loadModel(url, opts = {}) {
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;
  state.renderer = renderer;

  const scene = new THREE.Scene();
  state.scene = scene;

  scene.add(new THREE.AmbientLight(0xffffff, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.copy(state.lightDir).multiplyScalar(8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd4ff, 0.45);
  rim.position.set(2, 3, -4);
  scene.add(rim);

  status('加载模型…');
  let model;
  if (opts.mode === 'object') {
    const gltf = await new GLTFLoader().loadAsync(url);
    model = gltf.scene;
  } else {
    model = await new FBXLoader().loadAsync(url);
  }
  state.model = model;
  scene.add(model);

  // 收集动画
  const clips = model.animations || [];
  state.clips = clips.map((c) => ({ name: c.name, duration: c.duration, tracks: c.tracks.length }));
  const mixer = new THREE.AnimationMixer(model);
  state.mixer = mixer;

  // 贴图与材质是否加载成功
  const textures = [];
  const materials = [];
  let hasVertexColor = false;
  let hasUv = false;
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry && o.geometry.attributes.color) hasVertexColor = true;
    if (o.geometry && o.geometry.attributes.uv) hasUv = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      materials.push({
        mesh: o.name,
        name: m.name,
        type: m.type,
        color: m.color ? m.color.getHexString() : null,
        hasMap: !!m.map,
        mapUrl: m.map ? m.map.name || '(unnamed)' : null,
        imageLoaded: !!(m.map && m.map.image && m.map.image.width),
        vertexColors: !!m.vertexColors,
      });
      if (m && m.map) {
        textures.push({
          mesh: o.name,
          material: m.name,
          map: m.map.name || '(unnamed)',
          imageLoaded: !!(m.map.image && m.map.image.width),
          width: m.map.image ? m.map.image.width : 0,
        });
      }
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  // 归一化：
  //   角色 → 身高缩放到 2 个单位（避免相机近远裁剪穿模）
  //   物件 → 最长水平边缩放到 objLength 个单位（车这类物件按长度归一更好控尺寸）
  const isObj = opts.mode === 'object';
  const s = isObj ? state.objLength / Math.max(size.x, size.z) : 2 / size.y;
  model.scale.setScalar(s);
  model.position.y = 0;
  model.updateMatrixWorld(true);
  if (isObj) {
    // 物体不逐帧重新居中（那样会让车在旋转时左右抖）：
    // 只在这里居中一次，之后车就绕自己的中心转。
    const b2 = new THREE.Box3().setFromObject(model);
    const c2 = b2.getCenter(new THREE.Vector3());
    model.position.x -= c2.x;
    model.position.z -= c2.z;
    model.position.y -= b2.min.y;
    model.updateMatrixWorld(true);
  }

  // 贴图：Quaternius 的模型用 UV 指向一张色区图集，
  // 但 FBX 导出时没带贴图路径，所以这里手动挂上去
  if (isObj) {
    // glTF 默认是 PBR 材质，角色的材质是 Phong —— 两套光照模型画在一起会不一致。
    // 这里统一换成 Phong，贴图（含 KHR_texture_transform 的偏移）原样带过去。
    model.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const next = mats.map((m) => {
        if (!m) return m;
        const phong = new THREE.MeshPhongMaterial({
          map: m.map || null,
          color: 0xffffff,
          shininess: 8,
          side: THREE.DoubleSide,
        });
        return phong;
      });
      o.material = Array.isArray(o.material) ? next : next[0];
    });
  }

  let textureApplied = false;
  if (opts.texture && !isObj) {
    const tex = await new THREE.TextureLoader().loadAsync(opts.texture);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.flipY = opts.flipY ?? true;
    tex.needsUpdate = true;
    model.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        m.map = tex;
        m.color = new THREE.Color(0xffffff);
        m.needsUpdate = true;
      }
    });
    textureApplied = true;
  }

  return {
    clips: state.clips,
    textures,
    materials,
    hasVertexColor,
    hasUv,
    textureApplied,
    meshes: model.children.map((c) => c.name),
    bounds: { size: { x: size.x, y: size.y, z: size.z }, min: box.min, max: box.max },
    scale: s,
  };
}

/** 造一台正交相机：水平方向贴住 X，俯角 pitch 决定 Y/Z 如何投影 */
function buildCamera({ visW, visH, targetY }) {
  const pitchRad = THREE.MathUtils.degToRad(state.pitch);
  const R = 12;
  const target = new THREE.Vector3(0, targetY, 0);
  const cam = new THREE.OrthographicCamera(-visW / 2, visW / 2, visH / 2, -visH / 2, 0.1, 100);
  cam.position.set(0, targetY + Math.sin(pitchRad) * R, Math.cos(pitchRad) * R);
  cam.lookAt(target);
  cam.updateProjectionMatrix();
  return cam;
}

/**
 * 每帧重新归位：消掉根骨位移造成的漂移。
 * 效果 = 角色永远站在同一个点，帧与帧之间不会平移。
 */
function normalizePose() {
  const box = new THREE.Box3().setFromObject(state.model);
  const c = box.getCenter(new THREE.Vector3());
  state.model.position.x -= c.x;
  state.model.position.z -= c.z;
  state.model.position.y -= box.min.y;
  state.model.updateMatrixWorld(true);
}

/**
 * 摆一个姿势。测量和正式渲染都走这里，保证两边姿态完全一致。
 * azimuth: 0 = 屏幕正下方(S)，顺时针递增。
 */
function poseFrame(clipName, frame, frameCount, azimuth, range = 1) {
  const clip = state.clipsRaw.find((c) => c.name === clipName);
  if (!clip) throw new Error(`没有这个动画: ${clipName}`);
  const action = state.mixer.clipAction(clip);
  state.mixer.stopAllAction();
  action.reset();
  action.play();
  action.setLoop(THREE.LoopRepeat, Infinity);
  // range < 1 时只采样动画的前一段（有些 clip 后半段是坏的）
  state.mixer.setTime((frame / frameCount) * clip.duration * range);

  // 模型原生朝向是 +Z（正对相机 = 屏幕下方 = 游戏里的 S）。
  // 顺时针转就是 +Y 轴正向旋转：+Z → +X 即面向游戏里的东。
  state.model.rotation.y = azimuth * (Math.PI / 4) + state.forwardOffset;
  state.model.updateMatrixWorld(true);
  normalizePose();
}

/** 渲染单帧，返回 PNG dataURL */
function renderFrame(opts) {
  const { azimuth, clipName, frame, frameCount, range } = opts;
  poseFrame(clipName, frame, frameCount, azimuth, range ?? 1);
  state.renderer.setSize(state.cellW, state.cellH, false);
  state.renderer.render(state.scene, state.camera);
  return state.renderer.domElement.toDataURL('image/png');
}

/**
 * 测量：把每个动画的每一帧、每个方位角都用探针相机渲一遍，
 * 量出真实的 alpha 包围盒，汇总成全局范围。
 *
 * 返回值用的是「投影坐标」(u, rel)：
 *   u   = 世界 X（屏幕左右）
 *   rel = y*cos(pitch) - z*sin(pitch)（屏幕上下的投影量，跟相机垂直目标无关）
 * 这样换相机时范围可以直接复用。
 */
function measureContent(entries, frameCount) {
  const box = new THREE.Box3().setFromObject(state.model);
  const size = box.getSize(new THREE.Vector3());
  const probe = { visW: PROBE_VIEW, visH: PROBE_VIEW, targetY: size.y * 0.5 };
  const probeCam = buildCamera(probe);
  const savedCam = state.camera;
  state.camera = probeCam;
  state.renderer.setSize(PROBE, PROBE, false);

  const c2 = document.createElement('canvas');
  c2.width = PROBE;
  c2.height = PROBE;
  const ctx = c2.getContext('2d', { willReadFrequently: true });

  const cosP = Math.cos(THREE.MathUtils.degToRad(state.pitch));
  let uMin = Infinity;
  let uMax = -Infinity;
  let relMin = Infinity;
  let relMax = -Infinity;
  let empty = 0;

  for (const entry of entries) {
    const clipName = entry.name;
    const range = entry.range ?? 1;
    for (let f = 0; f < frameCount; f++) {
      for (let az = 0; az < 8; az++) {
        poseFrame(clipName, f, frameCount, az, range);
        state.renderer.render(state.scene, probeCam);
        ctx.drawImage(state.renderer.domElement, 0, 0, PROBE, PROBE);
        const data = ctx.getImageData(0, 0, PROBE, PROBE).data;

        let px0 = PROBE;
        let px1 = -1;
        let py0 = PROBE;
        let py1 = -1;
        for (let y = 0; y < PROBE; y++) {
          const row = y * PROBE * 4;
          for (let x = 0; x < PROBE; x++) {
            if (data[row + x * 4 + 3] > 4) {
              if (x < px0) px0 = x;
              if (x > px1) px1 = x;
              if (y < py0) py0 = y;
              if (y > py1) py1 = y;
            }
          }
        }
        if (px1 < 0) {
          empty++;
          continue;
        }

        const u0 = (px0 + 0.5) / PROBE * probe.visW - probe.visW / 2;
        const u1 = (px1 + 0.5) / PROBE * probe.visW - probe.visW / 2;
        const vTop = probe.visH / 2 - (py0 + 0.5) / PROBE * probe.visH;
        const vBot = probe.visH / 2 - (py1 + 0.5) / PROBE * probe.visH;

        if (u0 < uMin) uMin = u0;
        if (u1 > uMax) uMax = u1;
        const relTop = vTop + probe.targetY * cosP;
        const relBot = vBot + probe.targetY * cosP;
        if (relBot < relMin) relMin = relBot;
        if (relTop > relMax) relMax = relTop;
      }
    }
  }

  state.camera = savedCam;
  return { uMin, uMax, relMin, relMax, empty, probe, clipCount: entries.length };
}

/**
 * 反算最终相机：
 *   脚底锚点固定在单元纵向 anchorY 处（0.66 = 距顶 66%）
 *   视野高度至少要装下锚点上方的头 和 锚点下方的前脚
 */
function computeFinalCamera(content) {
  const { uMin, uMax, relMin, relMax } = content;
  const anchorY = state.anchorY;
  const margin = state.margin;
  const aspect = state.cellW / state.cellH;

  const needH = Math.max(relMax / anchorY, -relMin / (1 - anchorY));
  const needW = Math.max(uMax, -uMin) * 2;

  let visH = needH * margin;
  let visW = Math.max(needW * margin, visH * aspect);
  visH = visW / aspect;

  const cosP = Math.cos(THREE.MathUtils.degToRad(state.pitch));
  const targetY = (visH * (anchorY - 0.5)) / cosP;
  return { visW, visH, targetY };
}

window.__BAKE__ = {
  async load(url, opts = {}) {
    state.cellW = opts.cellW ?? 64;
    state.cellH = opts.cellH ?? 64;
    state.pitch = opts.pitch ?? 70;
    state.forwardOffset = opts.forwardOffset ?? 0;
    state.anchorY = opts.anchorY ?? 0.66;
    state.margin = opts.margin ?? 1.06;
    /**
     * 物体模式下「模型最长水平边」要缩放到多少世界单位。
     * 逐车型给不同值，车的实际大小才有区别（卡丁车不能跟轿车一样长）。
     */
    state.objLength = opts.objLength ?? state.objLength;
    const info = await loadModel(url, opts);
    state.clipsRaw = state.model.animations || [];
    const canvas = document.getElementById('c');
    canvas.width = state.cellW;
    canvas.height = state.cellH;
    normalizePose();
    // 先用探针相机占位，等 measureAndFrame 换成精确相机
    state.camera = buildCamera({ visW: PROBE_VIEW, visH: PROBE_VIEW, targetY: 1 });
    status('模型就绪');
    return info;
  },

  /** 量出内容范围 → 反算无裁切相机 → 装上 */
  measureAndFrame(entries, frameCount) {
    const content = measureContent(entries, frameCount);
    const final = computeFinalCamera(content);
    state.camera = buildCamera(final);
    status('取景完成');
    return { content, final };
  },

  renderFrame,

  /**
   * 物体模式：实测所有角度的内容范围。
   * 返回的是「相对地面中心」的投影范围 (u, rel)：
   *   u   = 世界 X（屏幕左右）
   *   rel = y*cos(pitch) - z*sin(pitch)（屏幕上下的投影量）
   * 地面中心（0,0,0）的 rel 恒为 0，所以范围是绝对可比的。
   */
  measureObject(yaws, probeView = 12) {
    const probe = { visW: probeView, visH: probeView, targetY: 0 };
    const probeCam = buildCamera(probe);
    const savedCam = state.camera;
    state.camera = probeCam;
    state.renderer.setSize(PROBE, PROBE, false);

    const c2 = document.createElement('canvas');
    c2.width = PROBE;
    c2.height = PROBE;
    const ctx = c2.getContext('2d', { willReadFrequently: true });
    const cosP = Math.cos(THREE.MathUtils.degToRad(state.pitch));

    let uMin = Infinity;
    let uMax = -Infinity;
    let relMin = Infinity;
    let relMax = -Infinity;

    for (const yaw of yaws) {
      state.model.rotation.y = yaw;
      state.model.updateMatrixWorld(true);
      state.renderer.render(state.scene, probeCam);
      ctx.drawImage(state.renderer.domElement, 0, 0, PROBE, PROBE);
      const data = ctx.getImageData(0, 0, PROBE, PROBE).data;

      let px0 = PROBE;
      let px1 = -1;
      let py0 = PROBE;
      let py1 = -1;
      for (let y = 0; y < PROBE; y++) {
        const row = y * PROBE * 4;
        for (let x = 0; x < PROBE; x++) {
          if (data[row + x * 4 + 3] > 4) {
            if (x < px0) px0 = x;
            if (x > px1) px1 = x;
            if (y < py0) py0 = y;
            if (y > py1) py1 = y;
          }
        }
      }
      if (px1 < 0) continue;

      const u0 = (px0 + 0.5) / PROBE * probe.visW - probe.visW / 2;
      const u1 = (px1 + 0.5) / PROBE * probe.visW - probe.visW / 2;
      const vTop = probe.visH / 2 - (py0 + 0.5) / PROBE * probe.visH;
      const vBot = probe.visH / 2 - (py1 + 0.5) / PROBE * probe.visH;

      if (u0 < uMin) uMin = u0;
      if (u1 > uMax) uMax = u1;
      // probe 的 targetY = 0，所以 rel = v（地面中心 rel=0）
      if (vBot < relMin) relMin = vBot;
      if (vTop > relMax) relMax = vTop;
    }

    state.camera = savedCam;
    return { uMin, uMax, relMin, relMax };
  },

  /**
   * 物体模式：设一台固定视野的正交相机。
   * 车的多角度精灵要保证「所有角度同一缩放」，所以相机是显式给的，
   * 不用角色那套实测包围盒（车的包围盒随角度变化太大）。
   */
  setObjectCamera(cam) {
    state.camera = buildCamera(cam);
    return cam;
  },

  /** 物体模式：渲染一个角度 */
  renderObjectFrame(opts) {
    state.model.rotation.y = opts.yaw;
    state.model.updateMatrixWorld(true);
    state.renderer.setSize(state.cellW, state.cellH, false);
    state.renderer.render(state.scene, state.camera);
    return state.renderer.domElement.toDataURL('image/png');
  },

  /** 换贴图：同一套模型换色 = 另一个 NPC，不用重新加载模型 */
  async setTexture(url) {
    const tex = await new THREE.TextureLoader().loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.flipY = true;
    tex.needsUpdate = true;
    state.model.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        m.map = tex;
        m.color = new THREE.Color(0xffffff);
        m.needsUpdate = true;
      }
    });
    return true;
  },

  /** 调试：把探针相机看到的那一帧原样导出来 */
  probeDump(clipName, frame, frameCount, azimuth) {
    const box = new THREE.Box3().setFromObject(state.model);
    const size = box.getSize(new THREE.Vector3());
    const probe = { visW: PROBE_VIEW, visH: PROBE_VIEW, targetY: size.y * 0.5 };
    const probeCam = buildCamera(probe);
    const savedCam = state.camera;
    state.camera = probeCam;
    state.renderer.setSize(PROBE, PROBE, false);
    poseFrame(clipName, frame, frameCount, azimuth);
    state.renderer.render(state.scene, probeCam);
    const c2 = document.createElement('canvas');
    c2.width = PROBE;
    c2.height = PROBE;
    const ctx = c2.getContext('2d');
    ctx.drawImage(state.renderer.domElement, 0, 0, PROBE, PROBE);
    state.camera = savedCam;
    return c2.toDataURL('image/png');
  },

  setOptions(opts) {
    if (opts.pitch !== undefined) state.pitch = opts.pitch;
    if (opts.forwardOffset !== undefined) state.forwardOffset = opts.forwardOffset;
    if (opts.cellW !== undefined) state.cellW = opts.cellW;
    if (opts.cellH !== undefined) state.cellH = opts.cellH;
    if (opts.anchorY !== undefined) state.anchorY = opts.anchorY;
    if (opts.margin !== undefined) state.margin = opts.margin;
  },

  /** 调试：看探针相机到底拍到了什么 */
  debugProbe(opts = {}) {
    const probe = { visW: opts.visW ?? 12, visH: opts.visH ?? 12, targetY: opts.targetY ?? 0 };
    const probeCam = buildCamera(probe);
    state.renderer.setSize(PROBE, PROBE, false);
    state.renderer.render(state.scene, probeCam);
    const c2 = document.createElement('canvas');
    c2.width = PROBE;
    c2.height = PROBE;
    const ctx = c2.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(state.renderer.domElement, 0, 0, PROBE, PROBE);
    const data = ctx.getImageData(0, 0, PROBE, PROBE).data;
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 4) opaque++;
    const box = state.model ? new THREE.Box3().setFromObject(state.model) : null;
    return {
      pitch: state.pitch,
      sceneChildren: state.scene.children.length,
      modelPos: state.model ? state.model.position.toArray() : null,
      modelScale: state.model ? state.model.scale.toArray() : null,
      camPos: probeCam.position.toArray(),
      camNear: probeCam.near,
      camFar: probeCam.far,
      box: box
        ? { min: box.min.toArray(), max: box.max.toArray() }
        : null,
      canvasSize: [state.renderer.domElement.width, state.renderer.domElement.height],
      opaquePixels: opaque,
    };
  },
};

window.__BAKE_READY__ = true;
status('烘焙页就绪');
