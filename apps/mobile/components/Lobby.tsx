import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn } from './Btn';
import { GlassCard, GoldTitle, Hall } from './Olympus';
import { GlassSurface } from './GlassSurface';
import { color, radius } from '@/lib/theme';
import { DIFFICULTIES, SCORE_OPTIONS } from '@/lib/config';
import { useApp } from '@/lib/store';
import { useAuth } from '@/lib/authStore';
import { useLangStore, useT, type Lang } from '@/lib/i18n';

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: (v: T) => string;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => (
        <Pressable
          key={String(o)}
          accessibilityRole="button"
          accessibilityState={{ selected: o === value }}
          onPress={() => onChange(o)}
          style={[styles.segItem, o === value && styles.segActive]}
        >
          <Text style={[styles.segText, o === value && styles.segTextActive]}>{label(o)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Lobby({
  onRules,
  onAuth,
  onLeaderboard,
  onFriends,
  onLive,
  onProfile,
}: {
  onRules: () => void;
  onAuth: () => void;
  onLeaderboard: () => void;
  onFriends: () => void;
  onLive: () => void;
  onProfile: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const nickname = useApp((s) => s.nickname);
  const setNickname = useApp((s) => s.setNickname);
  const targetScore = useApp((s) => s.targetScore);
  const setTargetScore = useApp((s) => s.setTargetScore);
  const difficulty = useApp((s) => s.difficulty);
  const setDifficulty = useApp((s) => s.setDifficulty);
  const busy = useApp((s) => s.busy);
  const conn = useApp((s) => s.conn);
  const maintenance = useApp((s) => s.maintenance);
  const createSolo = useApp((s) => s.createSolo);
  const createRoom = useApp((s) => s.createRoom);
  const joinRoom = useApp((s) => s.joinRoom);
  const joinQueue = useApp((s) => s.joinQueue);
  const user = useAuth((s) => s.user);
  const lang = useLangStore((s) => s.lang);
  const changeLanguage = useAuth((s) => s.changeLanguage);
  const [code, setCode] = useState('');
  const [panel, setPanel] = useState<'home' | 'create' | 'join' | 'solo'>('home');
  const canGo = nickname.trim().length > 0 && !busy && conn === 'connected';

  const setLang = (next: Lang) => {
    void changeLanguage(next);
  };

  return (
    <Hall>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}
        >
          <View style={styles.langRow}>
            <Pressable onPress={() => setLang('en')}>
              <Text style={[styles.lang, lang === 'en' && styles.langOn]}>EN</Text>
            </Pressable>
            <Pressable onPress={() => setLang('el')}>
              <Text style={[styles.lang, lang === 'el' && styles.langOn]}>ΕΛ</Text>
            </Pressable>
          </View>
          <GoldTitle title={t('lobby.title')} subtitle={t('lobby.subtitle')} hero />
          {maintenance ? <Text style={styles.banner}>{maintenance}</Text> : null}

          <GlassCard>
            <Text style={styles.label}>{t('lobby.enterName')}</Text>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              testID="nickname"
              placeholder={t('lobby.enterName')}
              placeholderTextColor={color.textFaint}
              autoCorrect={false}
              maxLength={20}
              returnKeyType="done"
              style={styles.input}
            />
            {panel === 'home' && (
              <View style={{ gap: 10 }}>
                <Btn
                  label={t('lobby.playOnline')}
                  kind="gold"
                  disabled={!canGo}
                  onPress={() => {
                    void joinQueue();
                  }}
                />
                <View style={styles.roomActions}>
                  <Btn
                    label={t('lobby.createRoom')}
                    kind="ghost"
                    small
                    style={{ flex: 1, paddingHorizontal: 8 }}
                    disabled={!canGo}
                    onPress={() => setPanel('create')}
                  />
                  <Btn
                    label={t('lobby.joinRoom')}
                    kind="ghost"
                    small
                    style={{ flex: 1, paddingHorizontal: 8 }}
                    disabled={conn !== 'connected'}
                    onPress={() => setPanel('join')}
                  />
                </View>
                <View style={styles.divider} />
                <Btn label={t('lobby.soloGame')} kind="ghost" disabled={!canGo} onPress={() => setPanel('solo')} />
              </View>
            )}
            {panel === 'create' && (
              <View style={{ gap: 10 }}>
                <Text style={styles.label}>{t('lobby.playTo')}</Text>
                <Segmented
                  options={SCORE_OPTIONS}
                  value={targetScore as (typeof SCORE_OPTIONS)[number]}
                  onChange={setTargetScore}
                  label={(n) => `${n}`}
                />
                <Text style={styles.label}>{t('lobby.botLevel')}</Text>
                <Segmented
                  options={DIFFICULTIES}
                  value={difficulty as (typeof DIFFICULTIES)[number]}
                  onChange={setDifficulty}
                  label={(d) => t(`lobby.${d}`)}
                />
                <Btn
                  label={busy ? t('lobby.loading') : t('lobby.createRoom')}
                  kind="gold"
                  disabled={!canGo}
                  onPress={() => {
                    void createRoom();
                  }}
                />
                <Btn label={t('lobby.back')} kind="ghost" onPress={() => setPanel('home')} />
              </View>
            )}
            {panel === 'join' && (
              <View style={{ gap: 10 }}>
                <TextInput
                  value={code}
                  onChangeText={(v) => setCode(v.toUpperCase())}
                  placeholder={t('lobby.roomCode')}
                  placeholderTextColor={color.textFaint}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                  style={styles.input}
                />
                <Btn
                  label={t('lobby.join')}
                  kind="gold"
                  disabled={!canGo || !code.trim()}
                  onPress={() => {
                    void joinRoom(code);
                  }}
                />
                <Btn label={t('lobby.back')} kind="ghost" onPress={() => setPanel('home')} />
              </View>
            )}
            {panel === 'solo' && (
              <View style={{ gap: 10 }}>
                <Text style={styles.label}>{t('lobby.playTo')}</Text>
                <Segmented
                  options={SCORE_OPTIONS}
                  value={targetScore as (typeof SCORE_OPTIONS)[number]}
                  onChange={setTargetScore}
                  label={(n) => `${n}`}
                />
                <Text style={styles.label}>{t('lobby.botLevel')}</Text>
                <Segmented
                  options={DIFFICULTIES}
                  value={difficulty as (typeof DIFFICULTIES)[number]}
                  onChange={setDifficulty}
                  label={(d) => t(`lobby.${d}`)}
                />
                <Btn
                  testID="play-solo"
                  label={busy ? t('lobby.loading') : t('lobby.start')}
                  kind="gold"
                  disabled={!canGo}
                  onPress={() => {
                    void createSolo();
                  }}
                />
                <Btn label={t('lobby.back')} kind="ghost" onPress={() => setPanel('home')} />
              </View>
            )}
          </GlassCard>

          <GlassSurface interactive>
            <View collapsable={false} style={styles.links}>
              <Link label={t('lobby.howToPlay')} onPress={onRules} />
              <Link label={t('lobby.leaderboard')} onPress={onLeaderboard} />
              <Link label="Live Games" onPress={onLive} />
              <Link label={t('friends.title')} onPress={user ? onFriends : onAuth} />
              <Link
                testID="account-link"
                label={user ? user.displayName : t('auth.signIn')}
                onPress={user ? onProfile : onAuth}
              />
            </View>
          </GlassSurface>
          {conn !== 'connected' && <Text style={styles.hint}>{t('app.reconnecting')}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </Hall>
  );
}

function Link({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.linkHit} accessibilityRole="button">
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, gap: 24 },
  roomActions: { flexDirection: 'row', gap: 10 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.line,
    marginVertical: 4,
  },
  langRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  lang: { color: color.textFaint, fontSize: 14, fontWeight: '700' },
  langOn: { color: color.gold },
  banner: { color: color.gold, textAlign: 'center' },
  label: {
    color: color.gold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: 'rgba(8,21,36,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.25)',
    color: color.text,
    paddingHorizontal: 14,
    fontSize: 18,
  },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  segItem: {
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,52,96,0.45)',
  },
  segActive: { backgroundColor: color.gold },
  segText: { color: color.textDim, fontSize: 13, fontWeight: '600' },
  segTextActive: { color: color.goldInk },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    padding: 8,
  },
  linkHit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  link: { color: color.gold, fontSize: 15 },
  hint: { color: color.textFaint, textAlign: 'center' },
});
