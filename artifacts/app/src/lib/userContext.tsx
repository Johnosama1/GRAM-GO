import React, { createContext, useContext, useEffect, useState } from "react";
import { api, User, WheelSlot, getWheelSlotsOnce, getTasksOnce, getCompletedTasksOnce, getWithdrawalsOnce, setSessionToken, SubscriptionChannel } from "./api";
import { getTelegramUser, initTelegramApp, getMockUser } from "./telegram";
import { collectFullDevicePayload } from "./deviceFingerprint";

// ── Session states ───────────────────────────────────────────────────
export type SessionState =
  | "pending"           // not yet checked
  | "issuing"           // in-flight request
  | "ready"             // token issued, app usable
  | "blocked"           // subscription check failed
  | "banned"            // user banned
  | "maintenance";      // bot under maintenance

export interface BlockedInfo {
  missingChannels: SubscriptionChannel[];
  requiredChannels: SubscriptionChannel[];
}

interface UserContextType {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  refresh: () => Promise<void>;
  retryInit: () => void;
  isAdmin: boolean;
  banned: boolean;
  slots: WheelSlot[];
  sessionState: SessionState;
  blockedInfo: BlockedInfo | null;
  recheckSession: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  initialized: false,
  refresh: async () => {},
  retryInit: () => {},
  isAdmin: false,
  banned: false,
  slots: [],
  sessionState: "pending",
  blockedInfo: null,
  recheckSession: async () => {},
});

// ── LocalStorage cache helpers ──────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000;

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: T };
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* storage full */ }
}

// ────────────────────────────────────────────────────────────────────
const hideSplash = () => {
  const splash = document.getElementById("splash");
  if (splash && !splash.classList.contains("hidden")) {
    splash.classList.add("hidden");
    setTimeout(() => splash.remove(), 400);
  }
};

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [banned, setBanned] = useState(false);
  const [slots, setSlots] = useState<WheelSlot[]>([]);
  const [sessionState, setSessionState] = useState<SessionState>("pending");
  const [blockedInfo, setBlockedInfo] = useState<BlockedInfo | null>(null);
  const [isAdminState, setIsAdminState] = useState(false);

  // ── Issue (or re-issue) session token ─────────────────────────────
  const doIssueSession = async (userId: number, retryCount = 0): Promise<void> => {
    try {
      const result = await api.issueSession(userId);
      setSessionToken(result.token);
      setBlockedInfo(null);
      setSessionState("ready");
    } catch (e: unknown) {
      const err = e as { status?: number; body?: { error?: string; missingChannels?: SubscriptionChannel[]; requiredChannels?: SubscriptionChannel[] } };
      if (err?.status === 503 && err.body?.error === "maintenance") {
        setSessionState("maintenance");
      } else if (err?.status === 403) {
        if (err.body?.error === "banned") {
          setBanned(true);
          setSessionState("banned");
        } else {
          setBlockedInfo({
            missingChannels: err.body?.missingChannels ?? [],
            requiredChannels: err.body?.requiredChannels ?? [],
          });
          setSessionState("blocked");
        }
      } else if (err?.status === 401 && err.body?.error === "invalid_auth" && retryCount < 2) {
        await new Promise(r => setTimeout(r, 600));
        return doIssueSession(userId, retryCount + 1);
      } else {
        // Fail open for non-blocking network issues
        setSessionState("ready");
      }
    }
  };

  // ── Re-check after user says they rejoined ─────────────────────────
  const recheckSession = async () => {
    if (!user) return;
    try {
      const result = await api.recheckSession(user.id);
      setSessionToken(result.token);
      setBlockedInfo(null);
      setSessionState("ready");
    } catch (e: unknown) {
      const err = e as { status?: number; body?: { error?: string; missingChannels?: SubscriptionChannel[]; requiredChannels?: SubscriptionChannel[] } };
      if (err?.status === 503 && err.body?.error === "maintenance") {
        setSessionState("maintenance");
      } else if (err?.status === 403) {
        setBlockedInfo({
          missingChannels: err.body?.missingChannels ?? [],
          requiredChannels: err.body?.requiredChannels ?? [],
        });
        setSessionState("blocked");
      } else {
        setSessionState("ready");
      }
    }
  };

  const init = async () => {
    try {
      // ── Clear storage on version bump ──────────────────────────────
      const APP_VER = "3.2";
      const VER_KEY = "jjx_app_ver";
      if (localStorage.getItem(VER_KEY) !== APP_VER) {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem(VER_KEY, APP_VER);
      }

      initTelegramApp();
      const tgUser = getTelegramUser() ?? getMockUser();

      // ── Step 1: Show cached data immediately ───────────────────────
      const cachedUser = readCache<User>(`user:${tgUser.id}`);
      const cachedSlots = readCache<WheelSlot[]>("slots");
      if (cachedUser) {
        setUser(cachedUser);
        setLoading(false);
      }
      if (cachedSlots) {
        setSlots(cachedSlots);
      }
      hideSplash();

      // ── Step 2: Parallel background verification & data fetch ──────
      const [initRes, fpRes, slotsRes] = await Promise.allSettled([
        // 1. Backend user init
        api.initUser({
          id: tgUser.id,
          username: tgUser.username ?? undefined,
          first_name: tgUser.first_name ?? undefined,
          last_name: tgUser.last_name ?? undefined,
          photo_url: tgUser.photo_url ?? undefined,
        }),
        // 2. Silent Multi-Factor Security Verification
        (async () => {
          try {
            const fpPayload = await collectFullDevicePayload();
            return await api.sendFingerprint({
              fingerprint: fpPayload.fingerprint,
              meta: fpPayload.meta,
              user_id: tgUser.id,
            });
          } catch (fpErr: unknown) {
            if (fpErr && typeof fpErr === "object" && "body" in fpErr) {
              const body = (fpErr as { body?: { banned?: boolean } }).body;
              if (body?.banned) return { banned: true, ok: false };
            }
            return null;
          }
        })(),
        // 3. Wheel slots
        getWheelSlotsOnce().catch(() => cachedSlots ?? [] as WheelSlot[]),
      ]);

      // Check for ban from device fingerprinting
      if (fpRes.status === "fulfilled" && fpRes.value && (fpRes.value.banned || fpRes.value.ok === false)) {
        setBanned(true);
        setSessionState("banned");
        setLoading(false);
        setInitialized(true);
        hideSplash();
        return;
      }

      // Check for ban / failure from user init
      if (initRes.status === "rejected") {
        const err = initRes.reason;
        if (err instanceof Error && (err.message === "محظور" || err.message.includes("banned"))) {
          setBanned(true);
          setSessionState("banned");
          setLoading(false);
          setInitialized(true);
          hideSplash();
          return;
        }
      }

      if (initRes.status === "fulfilled" && initRes.value) {
        const freshUser = initRes.value;
        if (freshUser.isVisible === false) {
          setBanned(true);
          setSessionState("banned");
          setLoading(false);
          setInitialized(true);
          hideSplash();
          return;
        }

        const freshSlots = (slotsRes.status === "fulfilled" ? slotsRes.value : cachedSlots ?? []) as WheelSlot[];
        setUser(freshUser);
        setSlots(freshSlots);
        writeCache(`user:${freshUser.id}`, freshUser);
        writeCache("slots", freshSlots);

        // Step 3: Issue session token in background
        await doIssueSession(freshUser.id);

        // Step 4: Check admin status
        api.adminCheck(freshUser.id)
          .then((res) => setIsAdminState(res.isAdmin))
          .catch(() => setIsAdminState(false));

        // Step 5: Pre-warm secondary caches silently
        getTasksOnce().catch(() => {});
        getCompletedTasksOnce(freshUser.id).catch(() => {});
        getWithdrawalsOnce(freshUser.id).catch(() => {});
      }

      setLoading(false);
      setInitialized(true);
      hideSplash();

    } catch (e: unknown) {
      if (e instanceof Error && e.message === "محظور") {
        setBanned(true);
        setSessionState("banned");
        setLoading(false);
        setInitialized(true);
        hideSplash();
      } else {
        console.warn("User initialization note:", e);
        setLoading(false);
        setInitialized(true);
        hideSplash();
      }
    }
  };

  const retryInit = () => {
    setLoading(true);
    setInitialized(false);
    setUser(null);
    setSessionState("pending");
    init();
  };

  const refresh = async () => {
    if (!user) return;
    try {
      const u = await api.getUser(user.id);
      setUser(u);
      writeCache(`user:${u.id}`, u);
    } catch (e) {
      console.error("Failed to refresh user", e);
    }
  };

  useEffect(() => {
    init();
  }, []);

  return (
    <UserContext.Provider value={{
      user, loading, initialized, refresh, retryInit, isAdmin: isAdminState, banned, slots,
      sessionState, blockedInfo, recheckSession,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
