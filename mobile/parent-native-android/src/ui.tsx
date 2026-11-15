import React, {createContext, useContext} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import type {TextInputProps} from 'react-native';

export const BrandColor = createContext('#4543c0');
export function Card({children}: {children: React.ReactNode}) { return <View style={styles.card}>{children}</View>; }
export function Title({children}: {children: React.ReactNode}) { return <Text accessibilityRole="header" style={styles.title}>{children}</Text>; }
export function Label({children}: {children: React.ReactNode}) { return <Text style={styles.label}>{children}</Text>; }
export function Copy({children}: {children: React.ReactNode}) { return <Text style={styles.copy}>{children}</Text>; }
export function Notice({children, error = false}: {children: React.ReactNode; error?: boolean}) {
  return <View style={[styles.notice, error && styles.error]}><Text accessibilityRole="alert" style={styles.copy}>{children}</Text></View>;
}
export function Button({title, onPress, disabled = false, secondary = false}: {title: string; onPress: () => void; disabled?: boolean; secondary?: boolean}) {
  const color = useContext(BrandColor);
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
    style={({pressed}) => [styles.button, {backgroundColor: secondary ? '#e8eaf6' : color, opacity: disabled ? 0.5 : pressed ? 0.75 : 1}]}>
    <Text style={[styles.buttonText, secondary && {color: '#1e1e2f'}]}>{title}</Text>
  </Pressable>;
}
export function Input({label, ...props}: TextInputProps & {label: string}) {
  const color = useContext(BrandColor);
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} accessibilityLabel={label}
    placeholderTextColor="#64748b" selectionColor={color} style={styles.input}/></View>;
}
export function Loading() { return <ActivityIndicator accessibilityLabel="Loading" color={useContext(BrandColor)} style={styles.loading}/>; }
export const styles = StyleSheet.create({
  page: {flex: 1, backgroundColor: '#f8fafc'}, content: {padding: 20, gap: 16, paddingBottom: 36, width: '100%', maxWidth: 760, alignSelf: 'center'},
  card: {padding: 20, backgroundColor: '#fff', borderRadius: 22, gap: 12, elevation: 1, shadowColor: '#1e1e2f', shadowOpacity: 0.05, shadowRadius: 12},
  title: {fontSize: 23, fontWeight: '700', color: '#1e1e2f'}, label: {fontSize: 16, fontWeight: '600', color: '#1e1e2f'},
  copy: {fontSize: 15, lineHeight: 23, color: '#475569'}, notice: {padding: 16, backgroundColor: '#edf0ff', borderRadius: 16}, error: {backgroundColor: '#fff0ed'},
  field: {gap: 8}, input: {borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#1e1e2f', backgroundColor: '#fff'},
  button: {borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 48},
  buttonText: {fontSize: 15, fontWeight: '700', color: '#fff', textAlign: 'center'},
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center'}, loading: {padding: 16},
  seal: {width: 76, height: 76, resizeMode: 'contain', alignSelf: 'center'}, center: {textAlign: 'center'},
});
