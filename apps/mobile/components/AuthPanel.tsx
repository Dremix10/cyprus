import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Btn } from './Btn';
import { GlassCard, GoldTitle, Hall } from './Olympus';
import { color, radius } from '@/lib/theme';
import { useAuth } from '@/lib/authStore';
import { useT } from '@/lib/i18n';

WebBrowser.maybeCompleteAuthSession();

type Mode = 'login' | 'register' | 'forgot';

export function AuthPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const error = useAuth((s) => s.error);
  const clearError = useAuth((s) => s.clearError);
  const googleClientId = useAuth((s) => s.googleClientId);
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const loginWithGoogle = useAuth((s) => s.loginWithGoogle);
  const loginWithApple = useAuth((s) => s.loginWithApple);
  const forgotPassword = useAuth((s) => s.forgotPassword);

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: googleClientId ?? undefined,
    iosClientId: googleClientId ?? undefined,
    webClientId: googleClientId ?? undefined,
  });

  useEffect(() => {
    if (Platform.OS === 'ios') {
      void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params?.id_token ?? response.authentication?.idToken;
    if (!idToken) return;
    void loginWithGoogle(idToken).then((ok) => { if (ok) onClose(); });
  }, [response, loginWithGoogle, onClose]);

  const submit = async () => {
    setBusy(true);
    setNote(null);
    if (mode === 'forgot') {
      const result = await forgotPassword(email.trim());
      setBusy(false);
      setNote(result.success ? (result.message ?? 'Check your email') : (result.error ?? 'Failed'));
      return;
    }
    const ok = mode === 'login'
      ? await login(username.trim(), password)
      : await register(username.trim(), password, displayName.trim(), email.trim());
    setBusy(false);
    if (ok) onClose();
  };

  const apple = async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!cred.identityToken) return;
      const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ');
      const ok = await loginWithApple(cred.identityToken, name || null);
      if (ok) onClose();
    } catch {
      /* user cancelled the Apple sheet */
    }
  };

  return (
    <Hall>
      <View style={styles.body}>
        <GoldTitle title={t('auth.signIn')} subtitle={t('lobby.subtitle')} />
        <GlassCard>
          {mode !== 'login' && (
            <Field label={t('auth.email')} value={email} onChangeText={setEmail} keyboard="email-address" />
          )}
          {mode !== 'forgot' && (
            <Field label={mode === 'login' ? t('auth.usernameOrEmail') : t('auth.username')} value={username} onChangeText={setUsername} />
          )}
          {mode === 'register' && (
            <Field label={t('auth.displayName')} value={displayName} onChangeText={setDisplayName} />
          )}
          {mode !== 'forgot' && (
            <Field label={t('auth.password')} value={password} onChangeText={setPassword} secure />
          )}
          {error ? <Text style={styles.err}>{error}</Text> : null}
          {note ? <Text style={styles.note}>{note}</Text> : null}
          <Btn
            label={busy ? t('lobby.loading') : mode === 'login' ? t('auth.signIn') : mode === 'register' ? t('auth.createAccount') : t('auth.sendResetLink')}
            kind="gold"
            disabled={busy}
            onPress={() => { clearError(); void submit(); }}
          />
          <Pressable onPress={() => { clearError(); setMode(mode === 'login' ? 'register' : 'login'); }}>
            <Text style={styles.link}>{mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}</Text>
          </Pressable>
          {mode === 'login' && (
            <Pressable onPress={() => { clearError(); setMode('forgot'); }}>
              <Text style={styles.link}>{t('auth.forgotPassword')}</Text>
            </Pressable>
          )}
        </GlassCard>

        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={14}
            style={styles.apple}
            onPress={() => { void apple(); }}
          />
        )}
        {googleClientId ? (
          <Btn label={t('auth.signInWithGoogle')} kind="ghost" disabled={!request} onPress={() => { void promptAsync(); }} />
        ) : null}
        <Btn label={t('auth.playAsGuest')} kind="ghost" onPress={onClose} />
      </View>
    </Hall>
  );
}

function Field({
  label, value, onChangeText, secure, keyboard,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secure?: boolean;
  keyboard?: 'email-address' | 'default';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboard ?? 'default'}
        placeholderTextColor={color.textFaint}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 14 },
  field: { gap: 4 },
  label: { color: color.gold, fontSize: 12, letterSpacing: 0.6 },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: 'rgba(15,52,96,0.55)',
    color: color.text,
    paddingHorizontal: 14,
    fontSize: 17,
  },
  err: { color: color.danger, fontSize: 14 },
  note: { color: color.ok, fontSize: 14 },
  link: { color: color.gold, textAlign: 'center', paddingVertical: 6 },
  apple: { width: '100%', height: 48 },
});
