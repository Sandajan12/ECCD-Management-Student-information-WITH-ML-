import AsyncStorage from '@react-native-async-storage/async-storage';
import {NativeModules} from 'react-native';
import {SessionManager} from './sessionCore';

interface NativeSessionBridge { baseUrl: string; clearCredentials(): Promise<void>; }
const nativeSession = NativeModules.NativeSession as NativeSessionBridge;
export const baseUrl = nativeSession.baseUrl;
export const session = new SessionManager({
  baseUrl, fetch: (...args) => fetch(...args),
  readPending: async () => (await AsyncStorage.getItem('ames_logout_pending')) === '1',
  writePending: async pending => { if (pending) await AsyncStorage.setItem('ames_logout_pending', '1'); else await AsyncStorage.removeItem('ames_logout_pending'); },
  clearCookie: () => nativeSession.clearCredentials(),
});
