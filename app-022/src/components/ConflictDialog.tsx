import { useState } from 'react';
import type { JSX } from 'react';
import { Modal } from './Modal';
import { strokeCountOf } from '../lib/data';
import type { ConflictPolicy, PendingImport } from '../lib/data';

type ConflictState = {
  pending: PendingImport;
  /** 旧数据来源描述（内置文件名 / 之前导入的文件名与时间） */
  oldInfo: Record<string, string>;
  file: string;
};

type ConflictDialogProps = {
  state: ConflictState;
  onCancel: () => void;
  onCommit: (policy: ConflictPolicy) => void;
};

/**
 * 导入撞字时让老师逐字看新旧两份（笔画数、来源），统一选择：
 * 全部留旧（跳过冲突字）还是全部换成新数据。
 */
export function ConflictDialog({ state, onCancel, onCommit }: ConflictDialogProps): JSX.Element {
  const { pending, oldInfo, file } = state;
  const [policy, setPolicy] = useState<ConflictPolicy>('replace');
  const newCount = Object.keys(pending.candidates).length;
  const conflictN = pending.conflicts.length;

  return (
    <Modal title="导入的字与已有数据撞字" onClose={onCancel} testid="conflict-dialog" width={600}>
      <p className="hint">
        本文件共 {newCount} 字，其中 <b data-testid="conflict-count">{conflictN}</b> 个字已有笔顺数据。请选择如何处理撞字（不撞字的会正常新增）：
      </p>
      <ul className="conflict-list" data-testid="conflict-list">
        {pending.conflicts.map((ch) => (
          <li key={ch} className="conflict-item" data-testid="conflict-item" data-char={ch}>
            <span className="conflict-char">{ch}</span>
            <span className="conflict-side old">
              旧：{strokeCountOf(ch) ?? '?'} 画 · {oldInfo[ch] ?? '已有数据'}
            </span>
            <span className="conflict-arrow">→</span>
            <span className="conflict-side new">
              新：{pending.candidates[ch].strokes.length} 画 · {file}
            </span>
          </li>
        ))}
      </ul>
      <div className="conflict-choices" role="radiogroup" aria-label="撞字处理方式">
        <label>
          <input
            type="radio"
            name="conflict-policy"
            data-testid="conflict-replace"
            checked={policy === 'replace'}
            onChange={() => setPolicy('replace')}
          />
          换成新数据（{conflictN} 个撞字以本次导入为准）
        </label>
        <label>
          <input
            type="radio"
            name="conflict-policy"
            data-testid="conflict-keep"
            checked={policy === 'keep-old'}
            onChange={() => setPolicy('keep-old')}
          />
          保留旧数据（{conflictN} 个撞字跳过，只新增其余 {newCount - conflictN} 字）
        </label>
      </div>
      <div className="modal-actions">
        <button className="btn primary" data-testid="conflict-commit" onClick={() => onCommit(policy)}>
          按所选方式导入
        </button>
        <button className="btn" data-testid="conflict-cancel" onClick={onCancel}>
          取消
        </button>
      </div>
    </Modal>
  );
}

export type { ConflictState };
