import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  _loadCustomStore,
  _resetForTest,
  _setStorage,
  charDataSource,
  clearCustomStrokes,
  commitImport,
  dataStats,
  hasStrokes,
  listCustomStrokes,
  previewImport,
  removeCustomStroke,
  strokeCountOf,
} from '../../src/lib/data';
import type { StrokeData } from '../../src/lib/data';
import { TEMPLATES, worksheetFromTemplate } from '../../src/lib/templates';

// node 环境没有 localStorage，stub 一个
const store = new Map<string, string>();
type LS = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void; clear: () => void };
const ls: LS = {
  getItem: (k) => (store.has(k) ? store.get(k)! : null),
  setItem: (k, v) => void store.set(k, v),
  removeItem: (k) => void store.delete(k),
  clear: () => void store.clear(),
};
(globalThis as { localStorage?: LS }).localStorage = ls;

const bundled = JSON.parse(
  readFileSync(new URL('../../public/data/strokes.json', import.meta.url), 'utf8'),
) as StrokeData;

beforeEach(() => {
  store.clear();
  _setStorage(ls as unknown as Storage);
  _resetForTest(bundled);
});

describe('笔顺数据导入 previewImport / commitImport', () => {
  it('支持 {chars:{...}} 全量包格式（非法 entry 被忽略）', () => {
    const pending = previewImport({
      chars: {
        '㊙': undefined,
        '龘': { strokes: ['M0 0 L10 10'], medians: [[[5, 5]]] },
        '儸': { strokes: ['M0 0 L10 10', 'M10 0 L0 10'], medians: [[[5, 5]], [[5, 5]]] },
      },
    }, { file: 'a.json' });
    expect(Object.keys(pending.candidates)).toHaveLength(2);
    expect(pending.conflicts).toHaveLength(0);
    const r = commitImport(pending, 'replace', { file: 'a.json' });
    expect(r).toMatchObject({ count: 2, added: 2, replaced: 0, skipped: 0 });
  });

  it('支持 {strokes}(单字) 格式并绑定当前字', () => {
    const pending = previewImport({ strokes: ['M1 1 L2 2'], medians: [[[1.5, 1.5]]] }, { applyTo: '罕' });
    const r = commitImport(pending, 'replace', { file: 'b.json' });
    expect(r.count).toBe(1);
    const saved = JSON.parse(store.get('app022:customStrokes')!);
    expect(saved.version).toBe(2);
    expect(saved.entries['罕'].strokes).toEqual(['M1 1 L2 2']);
    expect(saved.entries['罕'].file).toBe('b.json');
    expect(saved.entries['罕'].importedAt).toBeGreaterThan(0);
  });

  it('非法 JSON 结构不产生候选', () => {
    expect(Object.keys(previewImport(null).candidates)).toHaveLength(0);
    expect(Object.keys(previewImport('abc' as unknown as object).candidates)).toHaveLength(0);
    expect(
      Object.keys(previewImport({ chars: { '龘': { strokes: [] } } }).candidates),
    ).toHaveLength(0);
  });

  it('撞内置字：keep-old 跳过，replace 覆盖', () => {
    // 火 内置 4 画；用 1 画的新数据模拟撞字
    const payload = { chars: { 火: { strokes: ['M0 0 L9 9'], medians: [] } } };
    const pending = previewImport(payload, { file: 'c.json' });
    expect(pending.conflicts).toEqual(['火']);
    const kept = commitImport(pending, 'keep-old', { file: 'c.json' });
    expect(kept).toMatchObject({ count: 0, skipped: 1, added: 0, replaced: 0 });
    expect(strokeCountOf('火')).toBe(4); // 仍是内置的 4 画
    const replaced = commitImport(pending, 'replace', { file: 'c.json' });
    expect(replaced).toMatchObject({ count: 1, replaced: 1 });
    expect(strokeCountOf('火')).toBe(1); // 换成新数据的 1 画
  });

  it('同字再次导入：与之前导入的数据也算撞字', () => {
    const p1 = previewImport({ chars: { 㐀: { strokes: ['M0 0 L9 9'] } } }, { file: 'one.json' });
    commitImport(p1, 'replace', { file: 'one.json' });
    const p2 = previewImport({ chars: { 㐀: { strokes: ['M0 0 L1 1', 'M2 2 L3 3'] } } }, { file: 'two.json' });
    expect(p2.conflicts).toEqual(['㐀']);
    const r = commitImport(p2, 'keep-old', { file: 'two.json' });
    expect(r.skipped).toBe(1);
    expect(strokeCountOf('㐀')).toBe(1); // 留旧的那份
  });
});

describe('导入数据管理：列表 / 单删 / 清空 / 来源', () => {
  it('列表含笔画数、来源文件、导入时间，按导入时间倒序', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-01T10:00:00Z'));
      commitImport(previewImport({ chars: { 龘: { strokes: ['M0 0 L1 1'] } } }), 'replace', { file: 'first.json' });
      vi.setSystemTime(new Date('2026-09-02T10:00:00Z'));
      commitImport(previewImport({ chars: { 罕: { strokes: ['M0 0 L1 1', 'M2 2 L3 3'] } } }), 'replace', { file: 'second.json' });
      const list = listCustomStrokes();
      expect(list.map((i) => i.char)).toEqual(['罕', '龘']);
      expect(list[0]).toMatchObject({ char: '罕', strokes: 2, file: 'second.json' });
      expect(list[0].importedAt).toBe(new Date('2026-09-02T10:00:00Z').getTime());
    } finally {
      vi.useRealTimers();
    }
  });

  it('覆盖内置字时标注 overridesBundled，新字不标注', () => {
    commitImport(
      previewImport({
        chars: {
          火: { strokes: ['M0 0 L9 9'] },
          㐀: { strokes: ['M0 0 L9 9'] },
        },
      }),
      'replace',
      { file: 'x.json' },
    );
    const byChar = new Map(listCustomStrokes().map((i) => [i.char, i]));
    expect(byChar.get('火')?.overridesBundled).toBe(true);
    expect(byChar.get('㐀')?.overridesBundled).toBe(false);
  });

  it('删除单个导入字后退回内置数据', () => {
    commitImport(previewImport({ chars: { 火: { strokes: ['M0 0 L9 9'] } } }), 'replace', { file: 'x.json' });
    expect(strokeCountOf('火')).toBe(1);
    expect(charDataSource('火')).toBe('custom-override');
    expect(removeCustomStroke('火')).toBe(true);
    expect(strokeCountOf('火')).toBe(4); // 退回内置
    expect(charDataSource('火')).toBe('bundled');
    expect(removeCustomStroke('火')).toBe(false);
  });

  it('删除内置没有的导入字后恢复无数据', () => {
    commitImport(previewImport({ chars: { 㐀: { strokes: ['M0 0 L9 9'] } } }), 'replace', { file: 'y.json' });
    expect(charDataSource('㐀')).toBe('custom');
    expect(hasStrokes('㐀')).toBe(true);
    removeCustomStroke('㐀');
    expect(hasStrokes('㐀')).toBe(false);
    expect(charDataSource('㐀')).toBeUndefined();
  });

  it('清空后全部退回内置数据，计数归零', () => {
    commitImport(
      previewImport({ chars: { 火: { strokes: ['M0 0 L9 9'] }, 㐀: { strokes: ['M0 0 L9 9'] } } }),
      'replace',
      { file: 'z.json' },
    );
    expect(dataStats().custom).toBe(2);
    const n = clearCustomStrokes();
    expect(n).toBe(2);
    expect(dataStats().custom).toBe(0);
    expect(strokeCountOf('火')).toBe(4);
    expect(hasStrokes('㐀')).toBe(false);
    expect(store.get('app022:customStrokes')).toContain('"entries":{}');
  });

  it('旧版 localStorage 纯映射会被迁移为带元信息的 v2', () => {
    store.set(
      'app022:customStrokes',
      JSON.stringify({ 㐂: { strokes: ['M0 0 L9 9'], medians: [] }, 坏数据: { strokes: [] } }),
    );
    _loadCustomStore();
    const list = listCustomStrokes();
    expect(list).toHaveLength(1); // 非法 entry 不迁移
    expect(list[0]).toMatchObject({
      char: '㐂',
      strokes: 1,
      file: '早期导入（无文件名记录）',
      importedAt: 0,
    });
    // 已回写为 v2 结构
    const saved = JSON.parse(store.get('app022:customStrokes')!);
    expect(saved.version).toBe(2);
    expect(saved.entries['㐂'].strokes).toEqual(['M0 0 L9 9']);
  });
});

describe('模板库', () => {
  it('5 个模板，且拼音模板使用四线格', () => {
    expect(TEMPLATES.length).toBe(5);
    const py = TEMPLATES.find((t) => t.id === 'pinyin')!;
    expect(py.layoutPatch?.fourLine).toBe(true);
    expect(py.layoutPatch?.grid).toBe('line');
    const nameTpl = TEMPLATES.find((t) => t.id === 'name')!;
    expect(nameTpl.layoutPatch?.cellMm).toBe(25);
  });

  it('worksheetFromTemplate 生成唯一 id', () => {
    const a = worksheetFromTemplate(TEMPLATES[0]);
    const b = worksheetFromTemplate(TEMPLATES[0]);
    expect(a.id).not.toBe(b.id);
    expect(a.chars.length).toBeGreaterThan(0);
  });
});
