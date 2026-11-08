import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

type Row = {key: string; isLoading: boolean};

// Keep the complete catalog/scroll extent, but admit one poster row per tick.
// A provider change invalidates the reveal set synchronously, before effects.
export const useStagedHomeRows = <T extends Row>(rows: T[], scope: string, enabled: boolean, active = true) => {
  const [revealed, setRevealed] = useState<{scope: string; keys: Set<string>}>(() => ({scope, keys: new Set()}));
  const priorities = useRef<number[]>([]);
  const firstKey = rows[0]?.key;
  const keys = revealed.scope === scope ? revealed.keys : new Set<string>();
  const pending = enabled && rows.some(row => !row.isLoading && row.key !== firstKey && !keys.has(row.key));
  const onViewableItemsChanged = useCallback(({viewableItems}: {viewableItems: Array<{index: number | null}>}) => {
    priorities.current = viewableItems.flatMap(item => item.index === null ? [] : [item.index]);
  }, []);

  useEffect(() => {
    if (!pending || !active) return;
    const timer = setTimeout(() => {
      setRevealed(previous => {
        const next = new Set(previous.scope === scope ? previous.keys : []);
        const candidates = [...priorities.current, ...rows.map((_, index) => index)];
        const index = candidates.find(i => rows[i] && !rows[i].isLoading && rows[i].key !== firstKey && !next.has(rows[i].key));
        if (index !== undefined) next.add(rows[index].key);
        return {scope, keys: next};
      });
    }, 32);
    return () => clearTimeout(timer);
  }, [rows, scope, pending, firstKey, revealed, active]);

  return {
    rows: useMemo(() => rows.map(row => ({...row, deferPosts: enabled && !row.isLoading && row.key !== firstKey && !keys.has(row.key)})), [rows, enabled, firstKey, keys]),
    onViewableItemsChanged,
  };
};
