import { describe, expect, it, beforeEach } from 'vitest';

// node 环境没有 localStorage，stub 一个
const store = new Map<string, string>();
type LS = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void; clear: () => void };
(globalThis as { localStorage?: LS }).localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k)! : null),
  setItem: (k, v) => void store.set(k, v),
  removeItem: (k) => void store.delete(k),
  clear: () => void store.clear(),
};

describe('笔顺数据导入 importStrokes', () => {
  beforeEach(() => store.clear());

  it('支持 {chars:{...}} 全量包格式', async () => {
    const { importStrokes } = await import('../../src/lib/data');
    const n = importStrokes({
      chars: {
        '㊙': undefined,
        '龘': { strokes: ['M0 0 L10 10'], medians: [[[5, 5]]] },
        '儸': { strokes: ['M0 0 L10 10', 'M10 0 L0 10'], medians: [[[5, 5]], [[5, 5]]] },
      },
    });
    expect(n).toBe(2); // 空 entry 被忽略
  });

  it('支持 {strokes}(单字) 格式并绑定当前字', async () => {
    const { importStrokes } = await import('../../src/lib/data');
    const n = importStrokes({ strokes: ['M1 1 L2 2'], medians: [[[1.5, 1.5]]] }, '罕');
    expect(n).toBe(1);
    expect(JSON.parse(store.get('app022:customStrokes')!)['罕'].strokes).toEqual(['M1 1 L2 2']);
  });

  it('非法 JSON 结构不写入', async () => {
    const { importStrokes } = await import('../../src/lib/data');
    expect(importStrokes(null)).toBe(0);
    expect(importStrokes('abc' as unknown as object)).toBe(0);
  });

  it('多字符的键不导入（字帖按单字管理）', async () => {
    const { importStrokes } = await import('../../src/lib/data');
    expect(importStrokes({ abc: { strokes: ['M1 1'], medians: [[[1, 1]]] } })).toBe(0);
  });
});

describe('导入数据管理（plan/apply/列表/删除/清空）', () => {
  beforeEach(async () => {
    store.clear();
    const { clearImportedChars } = await import('../../src/lib/data');
    clearImportedChars(); // 同时清掉模块内存状态
    store.clear(); // 清掉 clearImportedChars 写入的 '{}'
  });

  it('planImport 区分全新字与已导入冲突，不写入数据', async () => {
    const { importStrokes, planImport, listImportedChars } = await import('../../src/lib/data');
    importStrokes({ chars: { 龘: { strokes: ['M0 0'], medians: [[[0, 0]]] } } }, undefined, 'a.json');
    const plan = planImport({
      chars: {
        龘: { strokes: ['M1 1', 'M2 2'], medians: [[[1, 1]], [[2, 2]]] },
        儸: { strokes: ['M3 3'], medians: [[[3, 3]]] },
      },
    });
    expect(plan).toHaveLength(2);
    const conflict = plan.find((c) => c.char === '龘')!;
    expect(conflict.conflictWith).toBe('custom');
    expect(conflict.existingStrokeCount).toBe(1);
    expect(conflict.existingFileName).toBe('a.json');
    expect(plan.find((c) => c.char === '儸')!.conflictWith).toBeNull();
    // plan 只是计划，不写入
    expect(listImportedChars()).toHaveLength(1);
  });

  it('applyImport 只覆盖 overwrite 集合中的冲突字', async () => {
    const { importStrokes, planImport, applyImport, getStrokes } = await import('../../src/lib/data');
    importStrokes({ chars: { 龘: { strokes: ['M0 0'], medians: [[[0, 0]]] } } });
    const plan = planImport({
      chars: {
        龘: { strokes: ['M1 1', 'M2 2'], medians: [[[1, 1]], [[2, 2]]] },
        儸: { strokes: ['M3 3'], medians: [[[3, 3]]] },
      },
    });
    // 保留旧数据：冲突字跳过，新字照常导入
    expect(applyImport(plan, { overwrite: new Set() })).toBe(1);
    expect(getStrokes('龘')).toHaveLength(1);
    expect(getStrokes('儸')).toHaveLength(1);
    // 选择用新数据：冲突字被覆盖（重新 plan 后再 apply）
    const plan2 = planImport({ chars: { 龘: { strokes: ['M1 1', 'M2 2'], medians: [[[1, 1]], [[2, 2]]] } } });
    expect(applyImport(plan2, { overwrite: new Set(['龘']) })).toBe(1);
    expect(getStrokes('龘')).toHaveLength(2);
  });

  it('导入记录附带来源文件与导入时间，列表可查', async () => {
    const { importStrokes, listImportedChars } = await import('../../src/lib/data');
    const before = Date.now();
    importStrokes({ chars: { 龘: { strokes: ['M0 0', 'M1 1'], medians: [[[0, 0]], [[1, 1]]] } } }, undefined, 'pack.json');
    const list = listImportedChars();
    expect(list).toHaveLength(1);
    expect(list[0].char).toBe('龘');
    expect(list[0].strokeCount).toBe(2);
    expect(list[0].fileName).toBe('pack.json');
    expect(list[0].importedAt).toBeGreaterThanOrEqual(before);
  });

  it('removeImportedChar 删除单个字并持久化，getStrokes 立即失效', async () => {
    const { importStrokes, removeImportedChar, getStrokes, listImportedChars } = await import('../../src/lib/data');
    importStrokes({ chars: { 龘: { strokes: ['M0 0'], medians: [[[0, 0]]] } } });
    expect(getStrokes('龘')).toBeDefined();
    expect(removeImportedChar('龘')).toBe(true);
    expect(removeImportedChar('龘')).toBe(false); // 已删除，再删返回 false
    expect(getStrokes('龘')).toBeUndefined(); // node 环境无内置数据，退回后即无数据
    expect(listImportedChars()).toHaveLength(0);
    expect(JSON.parse(store.get('app022:customStrokes')!)).toEqual({});
  });

  it('clearImportedChars 一次清空并返回条数', async () => {
    const { importStrokes, clearImportedChars, listImportedChars } = await import('../../src/lib/data');
    importStrokes({
      chars: {
        龘: { strokes: ['M0 0'], medians: [[[0, 0]]] },
        儸: { strokes: ['M1 1'], medians: [[[1, 1]]] },
      },
    });
    expect(clearImportedChars()).toBe(2);
    expect(listImportedChars()).toHaveLength(0);
    expect(clearImportedChars()).toBe(0);
  });

  it('旧格式数据（无元信息）兼容加载，显示为早期导入', async () => {
    store.set(
      'app022:customStrokes',
      JSON.stringify({ 龘: { strokes: ['M0 0'], medians: [[[0, 0]]] }, 坏: { noStrokes: true } }),
    );
    const { loadCustomStrokes, listImportedChars, getStrokes } = await import('../../src/lib/data');
    loadCustomStrokes();
    const list = listImportedChars();
    expect(list).toHaveLength(1); // 损坏记录被清洗
    expect(list[0].fileName).toBe('（早期导入）');
    expect(list[0].importedAt).toBeNull();
    expect(getStrokes('龘')).toHaveLength(1);
  });

  it('strokeSourceOf 报告当前生效的数据来源', async () => {
    const { importStrokes, strokeSourceOf, removeImportedChar } = await import('../../src/lib/data');
    expect(strokeSourceOf('龘')).toBeUndefined();
    importStrokes({ chars: { 龘: { strokes: ['M0 0'], medians: [[[0, 0]]] } } }, undefined, 'b.json');
    expect(strokeSourceOf('龘')).toEqual({ kind: 'custom', fileName: 'b.json' });
    removeImportedChar('龘');
    expect(strokeSourceOf('龘')).toBeUndefined();
  });
});

describe('模板库', () => {
  it('5 个模板，且拼音模板使用四线格', async () => {
    const { TEMPLATES } = await import('../../src/lib/templates');
    expect(TEMPLATES.length).toBe(5);
    const py = TEMPLATES.find((t) => t.id === 'pinyin')!;
    expect(py.layoutPatch?.fourLine).toBe(true);
    expect(py.layoutPatch?.grid).toBe('line');
    const nameTpl = TEMPLATES.find((t) => t.id === 'name')!;
    expect(nameTpl.layoutPatch?.cellMm).toBe(25);
  });

  it('worksheetFromTemplate 生成唯一 id', async () => {
    const { TEMPLATES, worksheetFromTemplate } = await import('../../src/lib/templates');
    const a = worksheetFromTemplate(TEMPLATES[0]);
    const b = worksheetFromTemplate(TEMPLATES[0]);
    expect(a.id).not.toBe(b.id);
    expect(a.chars.length).toBeGreaterThan(0);
  });
});
