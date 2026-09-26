/**
 * 导入笔顺数据管理弹窗：列出所有导入过的字（笔画数 / 来源文件 / 导入时间 / 是否覆盖内置），
 * 支持删除单个字、一键清空退回内置数据。删除后调用方负责触发预览与笔顺演示重画。
 */
import { useState } from 'react';
import type { JSX } from 'react';
import { clearImportedChars, listImportedChars, removeImportedChar } from '../lib/data';

/** 导入时间格式化（手动拼，避免 locale 差异）；旧数据无时间戳显示 — */
function formatTime(ts: number | null): string {
  if (ts == null) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Props = {
  onClose: () => void;
  /** 导入数据发生变化（删除/清空）后回调，用于触发预览重画与统计刷新 */
  onChanged: () => void;
};

export function ImportedCharsManager({ onClose, onChanged }: Props): JSX.Element {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const list = listImportedChars();

  const onRemove = (ch: string) => {
    removeImportedChar(ch);
    onChanged();
  };

  const onClear = () => {
    clearImportedChars();
    setConfirmingClear(false);
    onChanged();
  };

  return (
    <div className="modal-mask" data-testid="import-manager">
      <div className="modal" role="dialog" aria-label="管理导入的笔顺数据">
        <h3>已导入的笔顺数据（{list.length} 字）</h3>
        {list.length === 0 ? (
          <p className="hint" data-testid="import-empty">
            还没有导入过笔顺数据，当前全部使用内置数据。
          </p>
        ) : (
          <>
            <p className="hint">导入数据优先于内置数据使用；删除后该字立即退回内置数据。</p>
            <div className="import-table-wrap">
              <table className="import-table">
                <thead>
                  <tr>
                    <th>字</th>
                    <th>笔画</th>
                    <th>来源文件</th>
                    <th>导入时间</th>
                    <th>说明</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((info) => (
                    <tr key={info.char} data-testid={`import-row-${info.char}`}>
                      <td className="import-char">{info.char}</td>
                      <td>{info.strokeCount}</td>
                      <td>{info.fileName}</td>
                      <td>{formatTime(info.importedAt)}</td>
                      <td>{info.overridesBuiltin ? <span className="tag-warn">覆盖内置</span> : '—'}</td>
                      <td>
                        <button
                          className="btn danger small"
                          data-testid={`remove-import-${info.char}`}
                          onClick={() => onRemove(info.char)}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="modal-actions">
          {list.length > 0 &&
            (confirmingClear ? (
              <>
                <span className="hint">确定删除全部 {list.length} 个导入字？删除后退回内置数据。</span>
                <button className="btn danger" data-testid="confirm-clear-imports" onClick={onClear}>
                  确认清空
                </button>
                <button className="btn" onClick={() => setConfirmingClear(false)}>
                  取消
                </button>
              </>
            ) : (
              <button className="btn danger" data-testid="clear-imports" onClick={() => setConfirmingClear(true)}>
                全部删除（退回内置数据）
              </button>
            ))}
          <button className="btn primary" data-testid="close-manager" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
