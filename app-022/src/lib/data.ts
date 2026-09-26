/**
 * 离线笔顺数据。全部本地资源（public/data/），不请求外部接口。
 * 格式：hanzi-writer v1 —— { strokes: string[], medians: number[][][] }
 * 部首/结构来自精选字典（charinfo.ts），未收录不展示。
 *
 * 导入的自定义笔顺优先于内置数据（老师可借此修正内置字形）；
 * 删除导入记录后自动退回内置数据。每条导入记录附带来源文件与导入时间，
 * 旧版本存储的记录没有元信息，按「早期导入」展示。
 */
import { CHAR_META } from './charinfo';

export type StrokeEntry = { strokes: string[]; medians: number[][][] };
export type StrokeData = { format: string; count: number; chars: Record<string, StrokeEntry> };
export type CharMeta = { radical?: string; structure?: string };

/** 导入的笔顺记录：StrokeEntry + 来源元信息（旧数据可能没有这两个字段） */
export type ImportedStrokeEntry = StrokeEntry & { fileName?: string; importedAt?: number };

/** 单条导入字的管理信息（列表展示用） */
export type ImportedCharInfo = {
  char: string;
  strokeCount: number;
  /** 来源文件名；旧数据为「（早期导入）」 */
  fileName: string;
  /** 导入时间戳；旧数据为 null */
  importedAt: number | null;
  /** 内置数据里也有该字（导入数据正在覆盖内置） */
  overridesBuiltin: boolean;
};

/** 导入计划中的一条候选记录 */
export type ImportCandidate = {
  char: string;
  entry: StrokeEntry;
  /** 冲突来源：custom=之前导入过，builtin=内置已有，null=全新字 */
  conflictWith: 'custom' | 'builtin' | null;
  existingStrokeCount?: number;
  /** conflictWith === 'custom' 时旧记录的来源信息 */
  existingFileName?: string;
  existingImportedAt?: number | null;
};

let strokeData: StrokeData | null = null;
/** 用户导入的补充笔顺数据（含 localStorage 持久化） */
let customStrokes: Record<string, ImportedStrokeEntry> = {};

const LS_CUSTOM = 'app022:customStrokes';
/** 旧版本导入的记录没有来源元信息，统一显示这个名 */
const LEGACY_FILE_NAME = '（早期导入）';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`加载 ${url} 失败: ${res.status}`);
  return res.json() as Promise<T>;
}

/** 校验并清洗单条记录：字必须是单个字符，strokes 必须是非空数组 */
function isValidEntry(ch: string, entry: unknown): entry is ImportedStrokeEntry {
  if ([...ch].length !== 1) return false;
  const e = entry as ImportedStrokeEntry | null | undefined;
  return Boolean(e && Array.isArray(e.strokes) && e.strokes.length > 0);
}

/** 从 localStorage 重新加载导入数据（启动时调用；损坏/旧格式数据会被清洗） */
export function loadCustomStrokes(): void {
  let raw: unknown = {};
  try {
    raw = JSON.parse(localStorage.getItem(LS_CUSTOM) || '{}');
  } catch {
    raw = {};
  }
  const out: Record<string, ImportedStrokeEntry> = {};
  if (raw && typeof raw === 'object') {
    for (const [ch, entry] of Object.entries(raw as Record<string, unknown>)) {
      if (isValidEntry(ch, entry)) out[ch] = entry;
    }
  }
  customStrokes = out;
}

function persistCustom(): void {
  localStorage.setItem(LS_CUSTOM, JSON.stringify(customStrokes));
}

export async function initData(): Promise<void> {
  if (strokeData) return;
  strokeData = await fetchJson<StrokeData>('/data/strokes.json');
  loadCustomStrokes();
}

export function hasStrokes(ch: string): boolean {
  return Boolean(customStrokes[ch] || strokeData?.chars[ch]);
}

/** 内置数据里是否有该字 */
export function hasBuiltinStrokes(ch: string): boolean {
  return Boolean(strokeData?.chars[ch]);
}

/** 笔顺路径（按 order 排序）；无数据返回 undefined —— 调用方必须显式提示「无笔顺数据」 */
export function getStrokes(ch: string): { path: string; order: number }[] | undefined {
  // 导入数据优先于内置数据：删除导入记录后自然退回内置
  const e = customStrokes[ch] ?? strokeData?.chars[ch];
  if (!e || !Array.isArray(e.strokes) || e.strokes.length === 0) return undefined;
  return e.strokes.map((path, i) => ({ path, order: i + 1 }));
}

export function strokeCountOf(ch: string): number | undefined {
  const s = getStrokes(ch);
  return s ? s.length : undefined;
}

/** 该字当前实际生效的笔顺来源（导入优先）；无数据返回 undefined */
export function strokeSourceOf(ch: string): { kind: 'custom'; fileName: string } | { kind: 'builtin' } | undefined {
  const rec = customStrokes[ch];
  if (rec) return { kind: 'custom', fileName: rec.fileName ?? LEGACY_FILE_NAME };
  if (strokeData?.chars[ch]) return { kind: 'builtin' };
  return undefined;
}

export function charMetaOf(ch: string): CharMeta | undefined {
  const m = CHAR_META[ch];
  return m ? { radical: m[0], structure: m[1] } : undefined;
}

/** 解析导入文件为候选列表（不写入），并标注每个字与现有数据的冲突情况 */
export function planImport(json: unknown, applyTo?: string): ImportCandidate[] {
  const obj = json as Record<string, unknown>;
  let merged: Record<string, unknown> = {};
  if (obj && typeof obj === 'object') {
    if (obj.chars && typeof obj.chars === 'object') merged = obj.chars as Record<string, unknown>;
    else if (obj.strokes && Array.isArray(obj.strokes) && applyTo) merged = { [applyTo]: obj };
    else merged = obj as Record<string, unknown>;
  }
  const out: ImportCandidate[] = [];
  for (const [ch, entry] of Object.entries(merged)) {
    if (!isValidEntry(ch, entry)) continue;
    const prev = customStrokes[ch];
    if (prev) {
      out.push({
        char: ch,
        entry,
        conflictWith: 'custom',
        existingStrokeCount: prev.strokes.length,
        existingFileName: prev.fileName ?? LEGACY_FILE_NAME,
        existingImportedAt: typeof prev.importedAt === 'number' ? prev.importedAt : null,
      });
    } else if (strokeData?.chars[ch]) {
      out.push({
        char: ch,
        entry,
        conflictWith: 'builtin',
        existingStrokeCount: strokeData.chars[ch].strokes.length,
      });
    } else {
      out.push({ char: ch, entry, conflictWith: null });
    }
  }
  return out;
}

/**
 * 应用导入计划：无冲突的字直接写入；冲突的字只有包含在 overwrite 中才覆盖。
 * 返回实际导入的条数。
 */
export function applyImport(
  candidates: ImportCandidate[],
  opts: { fileName?: string; overwrite?: ReadonlySet<string> | 'all' } = {},
): number {
  const now = Date.now();
  let n = 0;
  for (const c of candidates) {
    const overwrite =
      opts.overwrite === 'all' || (opts.overwrite instanceof Set && opts.overwrite.has(c.char));
    if (c.conflictWith && !overwrite) continue;
    const rec: ImportedStrokeEntry = { strokes: c.entry.strokes, medians: c.entry.medians, importedAt: now };
    if (opts.fileName) rec.fileName = opts.fileName;
    customStrokes[c.char] = rec;
    n++;
  }
  persistCustom();
  return n;
}

/** 导入常见笔顺数据格式：{chars:{...}} 全量包 / {字:{strokes,...}} 单字映射 / {strokes}(应用到当前字)。冲突一律覆盖。 */
export function importStrokes(json: unknown, applyTo?: string, fileName?: string): number {
  return applyImport(planImport(json, applyTo), { fileName, overwrite: 'all' });
}

/** 全部导入字的管理信息，按导入时间倒序（无时间戳的旧数据排最后） */
export function listImportedChars(): ImportedCharInfo[] {
  return Object.entries(customStrokes)
    .map(([char, rec]) => ({
      char,
      strokeCount: rec.strokes.length,
      fileName: rec.fileName ?? LEGACY_FILE_NAME,
      importedAt: typeof rec.importedAt === 'number' ? rec.importedAt : null,
      overridesBuiltin: Boolean(strokeData?.chars[char]),
    }))
    .sort((a, b) => (b.importedAt ?? 0) - (a.importedAt ?? 0) || a.char.localeCompare(b.char, 'zh'));
}

/** 删除单个导入字；删除后该字退回内置数据。返回是否确有此字 */
export function removeImportedChar(ch: string): boolean {
  if (!(ch in customStrokes)) return false;
  delete customStrokes[ch];
  persistCustom();
  return true;
}

/** 清空全部导入数据，退回内置。返回删除的条数 */
export function clearImportedChars(): number {
  const n = Object.keys(customStrokes).length;
  customStrokes = {};
  persistCustom();
  return n;
}

export function dataStats(): { bundled: number; custom: number; overriding: number } {
  const chars = Object.keys(customStrokes);
  const builtin = strokeData?.chars;
  return {
    bundled: builtin ? Object.keys(builtin).length : 0,
    custom: chars.length,
    overriding: builtin ? chars.filter((c) => builtin[c]).length : 0,
  };
}
