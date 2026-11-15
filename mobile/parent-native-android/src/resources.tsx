import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {session} from './session';
import {messageOf, transient} from './sessionCore';
import {Loading, Notice} from './ui';
export interface Resource<T> {
  data: T | null; error: string; loading: boolean;
  reload: () => Promise<void>; update: (data: T) => void;
}
export function useResource<T>(path: string, revision = ''): Resource<T> {
  const [state, setState] = useState<{data: T | null; error: string; loading: boolean}>({data: null, error: '', loading: true});
  const version = useRef(0);
  const load = useCallback(async () => {
    const request = ++version.current;
    try {const data = await session.request<T>(path); if (version.current === request) setState({data, error: '', loading: false});}
    catch (e) {if (version.current === request) setState(old => ({data: transient(e) ? old.data : null, error: messageOf(e), loading: false}));}
  }, [path]);
  useEffect(() => {
    setState({data: null, error: '', loading: true}); void load();
    const timer = setInterval(() => {if (AppState.currentState === 'active') void load();}, 20000);
    const listener = AppState.addEventListener('change', value => {if (value === 'active') void load();});
    return () => {version.current++; clearInterval(timer); listener.remove();};
  }, [load, revision]);
  return {...state, reload: load, update: (data: T) => setState({data, error: '', loading: false})};
}
export function Feedback({error, loading}: {error: string; loading: boolean}) {
  return <>{loading && <Loading/>}{!!error && <Notice error>{error}</Notice>}</>;
}
