import { Effect } from "effect";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { MobileSession } from "../domain/schemas";
import {
  ensureFreshSessionEffect,
  refreshSessionEffect,
  signInAsFixtureEffect,
  signInAsReviewerDemoEffect,
  signInWithBrowserEffect,
  signOutEffect,
} from "../services/auth";
import { loadSessionEffect } from "../services/session-store";
import { registerForPushEffect } from "../services/push";

type SessionContextValue = {
  session: MobileSession | null;
  loading: boolean;
  error: string | null;
  signInWithBrowser: () => Promise<void>;
  signInFixture: () => Promise<void>;
  signInReviewerDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Extend / rotate access token; fixture mode renews locally. */
  refreshSession: () => Promise<MobileSession | null>;
  setSession: (session: MobileSession | null) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await Effect.runPromise(loadSessionEffect());
        if (cancelled) return;
        if (!loaded) {
          setSession(null);
          return;
        }
        const fresh = await Effect.runPromise(ensureFreshSessionEffect(loaded));
        if (cancelled) return;
        if (!fresh) {
          await Effect.runPromise(signOutEffect()).catch(() => undefined);
          setSession(null);
          return;
        }
        setSession(fresh);
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    void Effect.runPromise(registerForPushEffect(session)).catch(() => undefined);
  }, [session?.userId, session?.accessToken]);

  // Soft expiry gate while the app is open — refresh early, else sign out.
  useEffect(() => {
    if (!session) return;
    const tick = () => {
      void (async () => {
        const fresh = await Effect.runPromise(ensureFreshSessionEffect(session));
        if (!fresh) {
          await Effect.runPromise(signOutEffect()).catch(() => undefined);
          setSession(null);
          return;
        }
        if (fresh.accessToken !== session.accessToken || fresh.expiresAtMs !== session.expiresAtMs) {
          setSession(fresh);
        }
      })();
    };
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [session]);

  const runAuth = useCallback(async (effect: Effect.Effect<MobileSession, { reason: string }>) => {
    setError(null);
    try {
      const next = await Effect.runPromise(effect);
      setSession(next);
    } catch (e: unknown) {
      const reason =
        e && typeof e === "object" && "reason" in e
          ? String((e as { reason: string }).reason)
          : e instanceof Error
            ? e.message
            : String(e);
      setError(reason);
      throw e;
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (!session) return null;
    setError(null);
    try {
      const next = await Effect.runPromise(refreshSessionEffect(session));
      setSession(next);
      return next;
    } catch (e: unknown) {
      const reason =
        e && typeof e === "object" && "reason" in e
          ? String((e as { reason: string }).reason)
          : e instanceof Error
            ? e.message
            : String(e);
      setError(reason);
      await Effect.runPromise(signOutEffect()).catch(() => undefined);
      setSession(null);
      return null;
    }
  }, [session]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      loading,
      error,
      setSession,
      signInWithBrowser: () => runAuth(signInWithBrowserEffect()),
      signInFixture: () => runAuth(signInAsFixtureEffect()),
      signInReviewerDemo: () => runAuth(signInAsReviewerDemoEffect()),
      signOut: async () => {
        await Effect.runPromise(signOutEffect());
        setSession(null);
      },
      refreshSession,
    }),
    [session, loading, error, runAuth, refreshSession]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
