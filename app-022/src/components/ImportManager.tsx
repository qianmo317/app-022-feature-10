import { useState } from 'react';
import type { JSX } from 'react';
import { Modal } from './Modal';
import { charDataSource, clearCustomStrokes, listCustomStrokes, removeCustomStroke } from '../lib/data';

/** 导入时间：YYYY-MM-DD HH:mm；旧版本迁移过来的记录显示「未知时间」 */
export function formatImportedAt(ts: number): string {
  if (!ts) return '未知时间';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

type ImportManagerProps = {
  onClose: () => void;
  /** 数据变更后通知父组件刷新（预览重画） */
  onDataChange: () => void;
  /** 点击某字时在编辑器里选中它 */
  onSelectChar?: (ch: string) => void;
};

/** 导入笔顺数据管理：列出全部导入字（笔画数/来源文件/导入时间），可单删、可清空退回内置 */
export function ImportManager({ onClose, onDataChange, onSelectChar }: ImportManagerProps): JSX.Element {
  const [, force] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [lastDeleted, setLastDeleted] = useState('');

  const items = listCustomStrokes();

  const deleteOne = (ch: string) => {
    removeCustomStroke(ch);
    setLastDeleted(ch);
    force((x) => x + 1);
    onDataChange();
  };

  const clearAll = () => {
    const n = clearCustomStrokes();
    if (n > 0) {
      setLastDeleted('');
      setConfirmClear(false);
      force((x) => x + 1);
      onDataChange();
    }
  };

  return (
    <Modal title="导入笔顺数据管理" onClose={onClose} testid="import-manager" width={560}>
      <p className="hint" data-testid="manager-count">
        共 {items.length} 个导入字；导入数据优先于内置数据，删除或清空后自动退回内置数据。
      </p>

      {items.length === 0 ? (
        <div className="manager-empty" data-testid="manager-empty">
          还没有导入过笔顺数据。
        </div>
      ) : (
        <ul className="manager-list" data-testid="manager-list">
          {items.map((it) => {
            const src = charDataSource(it.char);
            return (
              <li key={it.char} className="manager-item" data-testid="manager-item" data-char={it.char}>
                <button
                  className="manager-char"
                  data-testid="manager-char"
                  title="在编辑器中选中该字"
                  onClick={() => onSelectChar?.(it.char)}
                >
                  {it.char}
                </button>
                <div className="manager-meta">
                  <span className="manager-strokes" data-testid="manager-strokes">
                    {it.strokes} 画
                  </span>
                  <span className="manager-file" title={it.file} data-testid="manager-file">
                    来自 {it.file}
                  </span>
                  <span className="manager-time" data-testid="manager-time">
                    {formatImportedAt(it.importedAt)}
                  </span>
                  {src === 'custom-override' && (
                    <span className="badge badge-override" data-testid="manager-override">
                      覆盖内置同字
                    </span>
                  )}
                  {src === 'custom' && <span className="badge">内置无此字</span>}
                </div>
                <button
                  className="btn danger btn-sm"
                  data-testid="manager-delete"
                  onClick={() => deleteOne(it.char)}
                >
                  删除
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {lastDeleted && <p className="hint" data-testid="manager-deleted">已删除「{lastDeleted}」的导入数据</p>}

      <div className="modal-actions">
        {confirmClear ? (
          <>
            <span className="error" data-testid="clear-confirm-text">
              确定清空全部 {items.length} 个导入字？清空后一律退回内置数据，且无法撤销。
            </span>
            <button className="btn danger" data-testid="clear-confirm-btn" onClick={clearAll}>
              确定清空
            </button>
            <button className="btn" data-testid="clear-cancel" onClick={() => setConfirmClear(false)}>
              取消
            </button>
          </>
        ) : (
          <button
            className="btn danger"
            data-testid="clear-all"
            disabled={items.length === 0}
            onClick={() => setConfirmClear(true)}
          >
            清空并退回内置数据
          </button>
        )}
        <button className="btn" onClick={onClose}>
          完成
        </button>
      </div>
    </Modal>
  );
}
