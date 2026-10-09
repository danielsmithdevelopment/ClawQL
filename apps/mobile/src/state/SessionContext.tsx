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
  setSession: (session: MobileSession | null) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Effect.runPromise(loadSessionEffect())
      .then((s) => {
        if (!cancelled) setSession(s);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    void Effect.runPromise(registerForPushEffect(session)).catch(() => undefined);
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
    }),
    [session, loading, error, runAuth]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
