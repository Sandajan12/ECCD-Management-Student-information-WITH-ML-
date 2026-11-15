import {useEffect, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {DraftStore} from './draftStore';
export const drafts = new DraftStore(AsyncStorage);
export function useDraft<T>(key: string, owner: number) {
  const [, redraw] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true; setReady(false);
    const unsubscribe = drafts.subscribe(() => {if (active) redraw(n => n + 1);});
    void drafts.load<T>(key, owner).then(() => {if (active) setReady(true);}).catch(() => {});
    return () => {active = false; unsubscribe();};
  }, [key, owner]);
  return {snapshot: drafts.peek<T>(key, owner), ready, storageError: drafts.error(key)};
}
