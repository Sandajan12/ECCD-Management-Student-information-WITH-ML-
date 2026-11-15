import React, {useEffect, useState, useSyncExternalStore} from 'react';
import {AppState, Image, KeyboardAvoidingView, Platform, ScrollView, StatusBar, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {AuthScreen} from './src/AuthScreen';
import {ChildPortal} from './src/ChildPortal';
import {baseUrl, session} from './src/session';
import {BrandColor, Button, Card, Copy, Loading, Notice, Title, styles} from './src/ui';
import type {Branding} from './src/contracts';

const fallback: Branding = {school_name: 'AMES Parent', primary_color: '#4543c0', logo_url: null};
function Content() {
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  const [brand, setBrand] = useState<Branding>(fallback);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    void session.restore();
    void fetch(`${baseUrl}/api/settings`).then(async r => { if (!r.ok) return; const value = await r.json() as Branding; setBrand({
      school_name: typeof value.school_name === 'string' && value.school_name.trim() ? value.school_name : fallback.school_name,
      primary_color: /^#[0-9a-f]{6}$/i.test(value.primary_color) ? value.primary_color : fallback.primary_color,
      logo_url: typeof value.logo_url === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(value.logo_url) ? value.logo_url : null,
    }); }).catch(() => {});
    const timer = setInterval(() => { if (AppState.currentState === 'active') void session.renewIfNeeded().catch(() => {}); }, 30000);
    const listener = AppState.addEventListener('change', value => { if (value === 'active') void session.renewIfNeeded().catch(() => {}); });
    return () => { clearInterval(timer); listener.remove(); };
  }, []);
  const logout = async () => { setSigningOut(true); try { await session.logout(); } finally { setSigningOut(false); } };
  return <BrandColor.Provider value={brand.primary_color}><SafeAreaView style={styles.page}>
    <StatusBar barStyle="dark-content" backgroundColor="#f8fafc"/>
    <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{gap: 10}}><Image accessibilityLabel="School seal" style={styles.seal} source={brand.logo_url ? {uri: brand.logo_url} : require('./assets/school-seal.png')}/>
          <Title>{brand.school_name}</Title><Copy>AMES Parent · Your child’s learning, together</Copy></View>
        {!!state.message && <Notice>{state.message}</Notice>}
        {state.loading || signingOut ? <Loading/> : !state.session ? <><AuthScreen/>{!!state.message && <Button secondary title="Retry session restore" onPress={() => void session.restore()}/>}</> : <>
          {state.session.user.role !== 'user' ? <Card><Title>For parent accounts</Title><Copy>You signed in with a Teacher or Chairman account. AMES Parent supports parent accounts only. Switch accounts to continue.</Copy>
            <Button title="Switch Account (Logout)" onPress={() => void logout()}/></Card> : <>
            <ChildPortal key={state.session.user.id} user={state.session.user}/><Button secondary title="Logout" onPress={() => void logout()}/>
          </>}
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView></BrandColor.Provider>;
}
export default function App() { return <SafeAreaProvider><Content/></SafeAreaProvider>; }
