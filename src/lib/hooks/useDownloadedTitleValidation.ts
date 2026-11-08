import {useFocusEffect} from '@react-navigation/native';
import {useCallback, useEffect, useRef, useState} from 'react';
import {reconcileCompletedDownloadOutputs} from '../downloadReconciliation';
import {scheduleWhenIdle} from '../performance/idleWork';

// Scope changes cancel pending native results. Record removal during validation
// must not restart the job; only a new title/season or focus starts another pass.
export const useDownloadedTitleValidation = (
  scope: string,
  recordIds: readonly string[],
): boolean => {
  const latestIds = useRef(recordIds);
  useEffect(() => {latestIds.current = recordIds;}, [recordIds]);
  const [validatedScope, setValidatedScope] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    setValidatedScope(null);
    const ids = new Set(latestIds.current);
    return scheduleWhenIdle(async signal => {
      await reconcileCompletedDownloadOutputs(signal, ids).catch(error => {
        if (!signal.aborted) console.warn('Title file validation failed:', error);
      });
      if (!signal.aborted) setValidatedScope(scope);
    }, 0, true);
  }, [scope]));
  return validatedScope !== scope;
};
