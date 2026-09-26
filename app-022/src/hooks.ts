import { useEffect, useReducer, useState } from 'react';
import type { Worksheet } from './types';
import { getWorksheet } from './lib/storage';
import { getDataVersion, subscribeDataChanges } from './lib/data';

/** 按路由 id 加载字帖文档；找不到时置 notFound */
export function useWorksheetDoc(id: string | undefined) {
  const [ws, setWs] = useState<Worksheet | undefined>(undefined);
  const [notFound, setNotFound] = useState(false);
  useEffect(() => {
    const found = id ? getWorksheet(id) : undefined;
    if (found) {
      setWs(found);
      setNotFound(false);
    } else {
      setWs(undefined);
      setNotFound(true);
    }
  }, [id]);
  return { ws, setWs, notFound };
}

/** 键盘事件目标是否在表单控件内（避免方向键/快捷键与输入冲突） */
export function isFormTarget(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}

/** 笔顺数据版本号：导入/删除/清空后递增，驱动预览与笔顺演示立即重画 */
export function useDataVersion(): number {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeDataChanges(force), []);
  return getDataVersion();
}
