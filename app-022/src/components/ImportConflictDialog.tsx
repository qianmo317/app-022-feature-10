/**
 * 导入冲突选择弹窗：文件里的字与现有数据（内置/之前导入）重复时，
 * 逐字让老师选择「保留旧数据」还是「用新数据」，也可一键全选。
 */
import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import type { ImportCandidate } from '../lib/data';

type Props = {
  plan: ImportCandidate[];
  fileName: string;
  onCancel: () => void;
  /** 确认导入；overwrite 为选择「用新数据」的字集合 */
  onConfirm: (overwrite: ReadonlySet<string>) => void;
};

function existingLabel(c: ImportCandidate): string {
  return c.conflictWith === 'builtin' ? '内置数据' : `导入：${c.existingFileName ?? '（早期导入）'}`;
}

export function ImportConflictDialog({ plan, fileName, onCancel, onConfirm }: Props): JSX.Element {
  const conflicts = useMemo(() => plan.filter((c) => c.conflictWith), [plan]);
  const freshCount = plan.length - conflicts.length;
  // 默认全部「保留旧数据」（不覆盖，最安全）
  const [useNew, setUseNew] = useState<ReadonlySet<string>>(new Set());

  const setAll = (all: boolean) =>
    setUseNew(all ? new Set(conflicts.map((c) => c.char)) : new Set());

  const toggle = (ch: string, v: boolean) => {
    const next = new Set(useNew);
    if (v) next.add(ch);
    else next.delete(ch);
    setUseNew(next);
  };

  return (
    <div className="modal-mask" data-testid="conflict-dialog">
      <div className="modal" role="dialog" aria-label="处理重复的笔顺数据">
        <h3>处理重复的字</h3>
        <p className="hint">
          「{fileName}」共 {plan.length} 字：{freshCount} 个新字将直接导入；
          以下 {conflicts.length} 个字已存在，请为每个字选择保留哪一份。
        </p>
        <div className="conflict-bulk">
          <button className="btn" data-testid="choose-all-old" onClick={() => setAll(false)}>
            全部保留旧数据
          </button>
          <button className="btn" data-testid="choose-all-new" onClick={() => setAll(true)}>
            全部用新数据
          </button>
        </div>
        <div className="import-table-wrap">
          <table className="import-table">
            <thead>
              <tr>
                <th>字</th>
                <th>现有数据</th>
                <th>新数据</th>
                <th>选择</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((c) => (
                <tr key={c.char} data-testid={`conflict-row-${c.char}`}>
                  <td className="import-char">{c.char}</td>
                  <td>
                    {existingLabel(c)}（{c.existingStrokeCount} 笔）
                  </td>
                  <td>{c.entry.strokes.length} 笔</td>
                  <td>
                    <div className="conflict-choice">
                      <label>
                        <input
                          type="radio"
                          name={`conflict-${c.char}`}
                          data-testid={`keep-old-${c.char}`}
                          checked={!useNew.has(c.char)}
                          onChange={() => toggle(c.char, false)}
                        />
                        保留旧
                      </label>
                      <label>
                        <input
                          type="radio"
                          name={`conflict-${c.char}`}
                          data-testid={`use-new-${c.char}`}
                          checked={useNew.has(c.char)}
                          onChange={() => toggle(c.char, true)}
                        />
                        用新的
                      </label>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button className="btn" data-testid="cancel-import" onClick={onCancel}>
            取消导入
          </button>
          <button className="btn primary" data-testid="confirm-import" onClick={() => onConfirm(useNew)}>
            确认导入
          </button>
        </div>
      </div>
    </div>
  );
}
