/**
 * 任务定义检查工具
 *
 *   node scripts/dev/missions.ts list              列出所有任务
 *   node scripts/dev/missions.ts show <id>         查看单个任务详情
 *   node scripts/dev/missions.ts validate          校验全部任务（CI 用）
 *
 * 作用：任务全部是 JSON 数据，48 个主线 + 支线之后，
 * 一个手滑的字段名错误会直接让任务在游戏里不触发。这里提前拦掉。
 */
import { readdir, readFile } from 'node:fs/promises';

const MISSION_DIR = 'content/missions';
const DIALOGUE_DIR = 'content/dialogues';

const CHAPTERS = ['Portland', 'Staunton Island', 'Shoreside Vale'];

/** 支持的目标类型 → 必填参数 */
const OBJECTIVES: Record<string, string[]> = {
  goto: ['target'],
  kill: ['target'],
  driveTo: ['target'],
  collect: ['item'],
  deliver: ['item', 'target'],
  survive: ['seconds'],
  race: ['target'],
  escort: ['target'],
  timed: ['seconds'],
  multiStage: ['stages'],
};

const FAIL_TYPES = ['timeout', 'death', 'wanted', 'arrest', 'bust', 'custom'];
const ONFAIL_TYPES = ['restart', 'respawn', 'abort', 'none'];
const TRIGGER_TYPES = ['startGame', 'enterZone', 'enterVehicle', 'phoneCall', 'afterMission', 'time'];

interface Issue {
  level: 'error' | 'warn';
  msg: string;
}

const issues: Issue[] = [];

function err(msg: string) {
  issues.push({ level: 'error', msg });
}
function warn(msg: string) {
  issues.push({ level: 'warn', msg });
}

async function listMissionFiles(): Promise<string[]> {
  try {
    const files = await readdir(MISSION_DIR);
    return files.filter((f) => f.endsWith('.json')).sort();
  } catch {
    return [];
  }
}

async function dialogueExists(id: string): Promise<boolean> {
  try {
    await readFile(`${DIALOGUE_DIR}/${id}.json`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

function validateMission(m: any, file: string) {
  const at = (p: string) => `${file}${p}`;

  if (!m.id) err(at(': 缺少 id'));
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.id)) err(at(`: id "${m.id}" 应为 kebab-case`));
  if (!m.title) err(at(': 缺少 title'));
  if (!m.chapter) err(at(': 缺少 chapter'));
  else if (!CHAPTERS.includes(m.chapter)) err(at(`: chapter "${m.chapter}" 不在 ${CHAPTERS.join(' / ')} 里`));

  if (!Array.isArray(m.triggers) || m.triggers.length === 0) {
    warn(at(': 没有 triggers，任务可能无法触发'));
  } else {
    for (const [i, t] of m.triggers.entries()) {
      if (!TRIGGER_TYPES.includes(t.type)) warn(at(`: triggers[${i}].type "${t.type}" 未知`));
    }
  }

  if (!Array.isArray(m.stages) || m.stages.length === 0) {
    err(at(': stages 为空'));
    return;
  }

  m.stages.forEach((s: any, i: number) => {
    const o = s.objective;
    if (!o) {
      err(at(`: stages[${i}] 缺少 objective`));
      return;
    }
    const spec = OBJECTIVES[o.type];
    if (!spec) {
      err(at(`: stages[${i}].objective.type "${o.type}" 不支持（可用：${Object.keys(OBJECTIVES).join(', ')}）`));
    } else {
      for (const key of spec) {
        if (o[key] === undefined) err(at(`: stages[${i}].objective 缺少必填字段 "${key}"`));
      }
    }
    if (s.fail) {
      if (!FAIL_TYPES.includes(s.fail.type)) {
        warn(at(`: stages[${i}].fail.type "${s.fail.type}" 未知`));
      }
      if (s.fail.type === 'timeout' && typeof s.fail.seconds !== 'number') {
        err(at(`: stages[${i}].fail 为 timeout 但没有 seconds`));
      }
    }
    if (s.onFail && !ONFAIL_TYPES.includes(s.onFail.type)) {
      warn(at(`: stages[${i}].onFail.type "${s.onFail.type}" 未知`));
    }
    if (s.dialogue) {
      dialogueExists(s.dialogue).then((ok) => {
        if (!ok) err(at(`: stages[${i}].dialogue 引用了不存在的对白 "${s.dialogue}"`));
      });
    }
  });
}

/* ---------------- 命令 ---------------- */

async function cmdList() {
  const files = await listMissionFiles();
  if (!files.length) {
    console.log(`  ${MISSION_DIR} 里还没有任务定义`);
    return;
  }
  console.log('');
  console.log(`  ${'ID'.padEnd(18)}${'章节'.padEnd(18)}${'目标'.padEnd(6)}标题`);
  console.log('  ' + '─'.repeat(84));
  for (const f of files) {
    const m = JSON.parse(await readFile(`${MISSION_DIR}/${f}`, 'utf8'));
    const stages = Array.isArray(m.stages) ? m.stages.length : 0;
    console.log(
      `  ${String(m.id ?? '?').padEnd(18)}${String(m.chapter ?? '?').padEnd(18)}${String(stages).padEnd(6)}${m.title ?? ''}`,
    );
  }
  console.log('');
}

async function cmdShow(id: string) {
  const files = await listMissionFiles();
  const file = files.find((f) => f.replace(/\.json$/, '') === id);
  if (!file) {
    console.log(`  找不到任务 "${id}"`);
    console.log(`  可用：${files.map((f) => f.replace(/\.json$/, '')).join(', ') || '(无)'}`);
    process.exitCode = 1;
    return;
  }
  const m = JSON.parse(await readFile(`${MISSION_DIR}/${file}`, 'utf8'));
  console.log('');
  console.log(`  ${m.title}  (${m.id})`);
  console.log(`  章节：${m.chapter}`);
  console.log(`  触发：${(m.triggers ?? []).map((t: any) => t.type).join(' → ') || '-'}`);
  console.log('');
  (m.stages ?? []).forEach((s: any, i: number) => {
    const o = s.objective ?? {};
    console.log(`  阶段 ${i + 1}  [${o.type}]${o.hint ? '  ' + o.hint : ''}`);
    if (o.target) console.log(`         target: ${o.target}${o.radius ? '  radius: ' + o.radius : ''}`);
    if (o.item) console.log(`         item: ${o.item}`);
    if (o.seconds) console.log(`         seconds: ${o.seconds}`);
    if (s.fail) console.log(`         fail: ${s.fail.type}${s.fail.seconds ? ' / ' + s.fail.seconds + 's' : ''}`);
    if (s.dialogue) console.log(`         dialogue: ${s.dialogue}`);
  });
  console.log('');
  if (m.rewards) console.log(`  奖励：${JSON.stringify(m.rewards)}`);
  if (m.unlocks) console.log(`  解锁：${JSON.stringify(m.unlocks)}`);
  console.log('');
}

async function cmdValidate() {
  const files = await listMissionFiles();
  if (!files.length) {
    console.log('  没有任务定义，跳过');
    return;
  }
  const seen = new Set<string>();
  for (const f of files) {
    const m = JSON.parse(await readFile(`${MISSION_DIR}/${f}`, 'utf8'));
    if (m.id && seen.has(m.id)) err(`${f}: id "${m.id}" 重复`);
    if (m.id) seen.add(m.id);
    validateMission(m, f);
  }
  // 等异步对白检查跑完
  await new Promise((r) => setTimeout(r, 50));

  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  for (const i of issues) {
    const tag = i.level === 'error' ? '✗ 错误' : '⚠ 警告';
    console.log(`  ${tag}  ${i.msg}`);
  }
  console.log('');
  console.log(`  检查 ${files.length} 个任务：${errors.length} 个错误，${warns.length} 个警告`);
  if (errors.length) process.exitCode = 1;
}

const cmd = process.argv[2] ?? 'list';
if (cmd === 'list') await cmdList();
else if (cmd === 'show') await cmdShow(process.argv[3] ?? '');
else if (cmd === 'validate') await cmdValidate();
else {
  console.log(`  用法: node scripts/dev/missions.ts [list|show <id>|validate]`);
  process.exitCode = 1;
}
