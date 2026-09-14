import type { AuthResponse, User } from '@smartestate/contracts';
import { create } from 'zustand';

export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated';

export interface SessionState {
  /** `unknown` until the first refresh attempt on start-up settles. */
  status: SessionStatus;
  /**
   * Kept in memory only, never in localStorage: an XSS payload can read storage
   * but cannot read a closure. The refresh cookie (httpOnly) restores the session
   * after a reload.
   */
  accessToken: string | null;
  user: User | null;
  setSession(response: AuthResponse): void;
  clearSession(): void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  status: 'unknown',
  accessToken: null,
  user: null,
  setSession: (response) => {
    set({ status: 'authenticated', accessToken: response.accessToken, user: response.user });
  },
  clearSession: () => {
    set({ status: 'anonymous', accessToken: null, user: null });
  },
}));

/** Non-hook accessors for code outside React (the fetch client). */
export const sessionStore = {
  getAccessToken: (): string | null => useSessionStore.getState().accessToken,
  setSession: (response: AuthResponse): void => {
    useSessionStore.getState().setSession(response);
  },
  clearSession: (): void => {
    useSessionStore.getState().clearSession();
  },
};
