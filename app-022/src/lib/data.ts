/**
 * 离线笔顺数据。全部本地资源（public/data/），不请求外部接口。
 * 格式：hanzi-writer v1 —— { strokes: string[], medians: number[][][] }
 * 部首/结构来自精选字典（charinfo.ts），未收录不展示。
 *
 * 数据分两层：
 * - 内置数据（strokes.json，只读）作为基线；
 * - 老师导入的数据（customStrokes，localStorage 持久化）优先于内置数据，
 *   同字冲突时以导入为准，删除/清空导入后自动退回内置数据。
 * 每条导入数据都保留来源文件名与导入时间，供「导入管理」查看与单条删除。
 */
import { CHAR_META } from './charinfo';

export type StrokeEntry = { strokes: string[]; medians: number[][][] };
export type StrokeData = { format: string; count: number; chars: Record<string, StrokeEntry> };
export type CharMeta = { radical?: string; structure?: string };

/** 一条导入记录：笔顺数据 + 来源元信息 */
export type CustomEntry = StrokeEntry & { file: string; importedAt: number };

/** 冲突时的取舍：留旧数据 / 换成新数据 */
export type ConflictPolicy = 'keep-old' | 'replace';

export type ImportOptions = {
  /** {strokes:[...]} 单字格式时绑定到当前字 */
  applyTo?: string;
  /** 来源文件名 */
  file?: string;
};

export type ImportResult = {
  /** 实际写入条数（新增 + 替换） */
  count: number;
  added: number;
  /** 与已有数据（内置或之前导入）撞字、被新数据替换的条数 */
  replaced: number;
  /** 撞字但按策略保留旧数据而跳过的条数 */
  skipped: number;
  /** 文件中撞字的字（不区分最终取舍） */
  conflicts: string[];
};

type CustomStore = { version: 2; entries: Record<string, CustomEntry> };

let strokeData: StrokeData | null = null;
/** 用户导入的笔顺数据（含 localStorage 持久化与来源元信息） */
let customStrokes: Record<string, CustomEntry> = {};

const LS_CUSTOM = 'app022:customStrokes';
const UNKNOWN_FILE = '早期导入（无文件名记录）';

/** 测试用：node 环境没有 localStorage，可注入一个同构存储 */
let storage: Storage | undefined;
function getStorage(): Storage | undefined {
  if (storage) return storage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* 隐私模式等场景下 localStorage 访问可能抛错 */
  }
  return undefined;
}
/** @internal 仅供单元测试注入存储实现 */
export function _setStorage(s: Storage | undefined): void {
  storage = s;
}

/** @internal 仅供单元测试直接触发 localStorage 读取与旧格式迁移 */
export function _loadCustomStore(): void {
  loadCustomStore();
}

/** @internal 仅供单元测试：注入内置数据并清空内存中的导入状态 */
export function _resetForTest(data?: StrokeData): void {
  strokeData = data ?? null;
  customStrokes = {};
}

/** 数据变更通知：删除/清空/导入后让预览与笔顺演示立即重画 */
const listeners = new Set<() => void>();
let dataVersion = 0;
export function subscribeDataChanges(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function bumpDataVersion(): void {
  dataVersion++;
  listeners.forEach((fn) => fn());
}
export function getDataVersion(): number {
  return dataVersion;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`加载 ${url} 失败: ${res.status}`);
  return res.json() as Promise<T>;
}

function isValidEntry(entry: unknown): entry is StrokeEntry {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  return Array.isArray(e.strokes) && e.strokes.length > 0 && e.strokes.every((p) => typeof p === 'string');
}

function normalizeEntry(entry: StrokeEntry): StrokeEntry {
  return { strokes: entry.strokes, medians: Array.isArray(entry.medians) ? entry.medians : [] };
}

/**
 * 读取并迁移持久化的导入数据。
 * 旧版本只存 { 字: {strokes, medians} }，迁移时补上占位元信息并回写。
 */
function loadCustomStore(): void {
  const ls = getStorage();
  if (!ls) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(ls.getItem(LS_CUSTOM) || '{}');
  } catch {
    parsed = {};
  }
  if (!parsed || typeof parsed !== 'object') {
    customStrokes = {};
    return;
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.version === 2 && obj.entries && typeof obj.entries === 'object') {
    customStrokes = obj.entries as Record<string, CustomEntry>;
    return;
  }
  // 旧格式：字 → StrokeEntry 的纯映射
  const migrated: Record<string, CustomEntry> = {};
  for (const [ch, entry] of Object.entries(obj)) {
    if (isValidEntry(entry)) {
      migrated[ch] = { ...normalizeEntry(entry), file: UNKNOWN_FILE, importedAt: 0 };
    }
  }
  customStrokes = migrated;
  persist();
}

export async function initData(): Promise<void> {
  if (strokeData) return;
  strokeData = await fetchJson<StrokeData>('/data/strokes.json');
  loadCustomStore();
  // 其他标签页导入/删除/清空后，本页预览与笔顺演示也立即跟着退回
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === LS_CUSTOM) {
        loadCustomStore();
        bumpDataVersion();
      }
    });
  }
}

function persist(): void {
  const store: CustomStore = { version: 2, entries: customStrokes };
  try {
    getStorage()?.setItem(LS_CUSTOM, JSON.stringify(store));
  } catch {
    /* 配额超限/存储不可用时静默：内存数据仍生效到本次会话 */
  }
}

export function hasStrokes(ch: string): boolean {
  return Boolean(customStrokes[ch] || strokeData?.chars[ch]);
}

/**
 * 笔顺路径（按 order 排序）；无数据返回 undefined —— 调用方必须显式提示「无笔顺数据」。
 * 导入数据优先于内置数据：老师导入的同字数据会覆盖内置那份，删除导入后自动退回内置。
 */
export function getStrokes(ch: string): { path: string; order: number }[] | undefined {
  const e = customStrokes[ch] ?? strokeData?.chars[ch];
  if (!e || !Array.isArray(e.strokes) || e.strokes.length === 0) return undefined;
  return e.strokes.map((path, i) => ({ path, order: i + 1 }));
}

export function strokeCountOf(ch: string): number | undefined {
  const s = getStrokes(ch);
  return s ? s.length : undefined;
}

export function charMetaOf(ch: string): CharMeta | undefined {
  const m = CHAR_META[ch];
  return m ? { radical: m[0], structure: m[1] } : undefined;
}

/** 解析三种常见导入结构为 字 → entry 的候选映射（不合法的字直接丢弃） */
function parseImport(json: unknown, applyTo?: string): Record<string, StrokeEntry> {
  const obj = json as Record<string, unknown>;
  let merged: Record<string, unknown> = {};
  if (obj && typeof obj === 'object') {
    if (obj.chars && typeof obj.chars === 'object') merged = obj.chars as Record<string, unknown>;
    else if (obj.strokes && Array.isArray(obj.strokes) && applyTo) merged = { [applyTo]: obj };
    else merged = obj;
  }
  const out: Record<string, StrokeEntry> = {};
  for (const [ch, entry] of Object.entries(merged)) {
    if (isValidEntry(entry)) out[ch] = normalizeEntry(entry);
  }
  return out;
}

export type PendingImport = {
  candidates: Record<string, StrokeEntry>;
  /** 撞字的字：内置已有或之前已经导入过 */
  conflicts: string[];
};

/** 导入预检：解析文件并算出哪些字撞了已有数据（供老师选留旧还是换新） */
export function previewImport(json: unknown, opts: ImportOptions = {}): PendingImport {
  const candidates = parseImport(json, opts.applyTo);
  const conflicts: string[] = [];
  for (const ch of Object.keys(candidates)) {
    if (customStrokes[ch] || strokeData?.chars[ch]) conflicts.push(ch);
  }
  return { candidates, conflicts };
}

/** 按冲突策略提交一次导入；返回新增/替换/跳过明细 */
export function commitImport(
  pending: PendingImport,
  policy: ConflictPolicy,
  opts: ImportOptions = {},
): ImportResult {
  const file = opts.file || '导入数据';
  const now = Date.now();
  let added = 0;
  let replaced = 0;
  let skipped = 0;
  for (const [ch, raw] of Object.entries(pending.candidates)) {
    const exists = Boolean(customStrokes[ch] || strokeData?.chars[ch]);
    if (exists && pending.conflicts.includes(ch) && policy === 'keep-old') {
      skipped++;
      continue;
    }
    customStrokes[ch] = { ...raw, file, importedAt: now };
    if (exists) replaced++;
    else added++;
  }
  persist();
  bumpDataVersion();
  return { count: added + replaced, added, replaced, skipped, conflicts: pending.conflicts };
}

/**
 * 导入常见笔顺数据格式：{chars:{...}} 全量包 / {字:{strokes,...}} 单字映射 / {strokes}(应用到当前字)。
 * 保留旧签名：撞字时一律换成新数据（需要交互式取舍请用 previewImport + commitImport）。
 */
export function importStrokes(json: unknown, applyTo?: string): number {
  const pending = previewImport(json, { applyTo });
  return commitImport(pending, 'replace').count;
}

export type CustomListItem = {
  char: string;
  strokes: number;
  file: string;
  importedAt: number;
  /** 该字同时存在于内置数据：当前显示的是导入这份 */
  overridesBundled: boolean;
};

/** 列出所有导入过的字（最近导入的在前），含笔画数、来源文件、导入时间 */
export function listCustomStrokes(): CustomListItem[] {
  return Object.entries(customStrokes)
    .map(([char, e]) => ({
      char,
      strokes: e.strokes.length,
      file: e.file,
      importedAt: e.importedAt,
      overridesBundled: Boolean(strokeData?.chars[char]),
    }))
    .sort((a, b) => b.importedAt - a.importedAt || a.char.localeCompare(b.char));
}

/** 删除单个导入字；该字有内置数据时自动退回内置，返回是否删到了数据 */
export function removeCustomStroke(ch: string): boolean {
  if (!customStrokes[ch]) return false;
  delete customStrokes[ch];
  persist();
  bumpDataVersion();
  return true;
}

/** 一次清空全部导入数据，全部退回内置数据（内置没有的字恢复为无数据） */
export function clearCustomStrokes(): number {
  const n = Object.keys(customStrokes).length;
  if (n === 0) return 0;
  customStrokes = {};
  persist();
  bumpDataVersion();
  return n;
}

export type CharDataSource = 'bundled' | 'custom' | 'custom-override';

/** 某字当前用的是哪一份数据（内置 / 仅导入 / 导入覆盖内置） */
export function charDataSource(ch: string): CharDataSource | undefined {
  if (customStrokes[ch]) return strokeData?.chars[ch] ? 'custom-override' : 'custom';
  if (strokeData?.chars[ch]) return 'bundled';
  return undefined;
}

export function dataStats(): { bundled: number; custom: number } {
  return {
    bundled: strokeData ? Object.keys(strokeData.chars).length : 0,
    custom: Object.keys(customStrokes).length,
  };
}
