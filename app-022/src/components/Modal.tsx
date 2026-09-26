import { useEffect, useRef } from 'react';
import type { JSX, ReactNode } from 'react';

type ModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testid?: string;
  /** 宽度 px，默认 520 */
  width?: number;
};

/** 居中弹层：Esc 关闭、点击遮罩关闭、打开时聚焦容器 */
export function Modal({ title, onClose, children, testid, width = 520 }: ModalProps): JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    boxRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-mask" data-testid={testid} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" ref={boxRef} tabIndex={-1} style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost modal-close" aria-label="关闭" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
