import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The TABLE ticket (not the account cookie): sessionId from room:create /
 * room:create_solo / room:join / matchmaking:found. Valid 4 hours, same as the website.
 */
const SESSION_KEY = 'cyprus-session';
const PROFILE_KEY = 'cyprus-profile';
export const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

export type TableTicket = { sessionId: string; roomCode: string; nickname: string; expiresAt: number };

export async function saveTicket(sessionId: string, roomCode: string, nickname: string): Promise<void> {
  const ticket: TableTicket = { sessionId, roomCode, nickname, expiresAt: Date.now() + SESSION_TTL_MS };
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(ticket));
  } catch {}
}

export async function loadTicket(): Promise<TableTicket | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as TableTicket;
    if (!t.sessionId || (t.expiresAt && Date.now() > t.expiresAt)) {
      await AsyncStorage.removeItem(SESSION_KEY);
      return null;
    }
    return t;
  } catch {
    return null;
  }
}

export async function clearTicket(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {}
}

export type Profile = { nickname: string; targetScore: number; difficulty: string };

export async function loadProfile(): Promise<Partial<Profile>> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Profile>) : {};
  } catch {
    return {};
  }
}

export async function saveProfile(p: Profile): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {}
}
