import { lazy, Suspense, useEffect, useRef, useState } from "react";
import lottie from "lottie-web";
import { useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { UserProvider, useUser } from "./lib/userContext";
import { LanguageProvider, useLanguage } from "./lib/i18nContext";
import TabBar from "./components/TabBar";
import AnimatedBackground from "./components/AnimatedBackground";
import TopBar from "./components/TopBar";
import HomePage from "./pages/HomePage";
import SubscriptionBlockedScreen from "./pages/SubscriptionBlockedScreen";

const TasksPage       = lazy(() => import("./pages/TasksPage"));
const ReferralPage    = lazy(() => import("./pages/ReferralPage"));
const WithdrawPage    = lazy(() => import("./pages/WithdrawPage"));
const AdminPage       = lazy(() => import("./pages/AdminPage"));
const LeaderboardPage = lazy(() => import("./pages/LeaderboardPage"));
const ProfilePage     = lazy(() => import("./pages/ProfilePage"));
const ComboPage       = lazy(() => import("./pages/ComboPage"));

const queryClient = new QueryClient();

const MANIFEST_URL = `${window.location.origin}/api/tonconnect-manifest.json`;

function LoadingScreen() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundImage: "url('/bg.jpg')",
        backgroundPosition: "center center",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        backgroundColor: "#030612",
        padding: 24,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 50% 50%, rgba(3, 6, 18, 0.4) 0%, rgba(3, 6, 18, 0.75) 100%)",
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
        }}
      >
        <div style={{ position: "relative", width: 90, height: 90, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              position: "absolute",
              inset: -12,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(0, 242, 254, 0.35) 0%, rgba(168, 85, 247, 0.15) 50%, transparent 70%)",
              animation: "splashGlowPulse 2.2s ease-in-out infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "2px dashed rgba(0, 242, 254, 0.6)",
              animation: "splashRotate 8s linear infinite",
            }}
          />
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: 20,
              background: "linear-gradient(135deg, rgba(8, 14, 32, 0.9), rgba(20, 10, 40, 0.9))",
              border: "1px solid rgba(0, 242, 254, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              boxShadow: "0 0 24px rgba(0, 242, 254, 0.35)",
            }}
          >
            ⚡
          </div>
        </div>

        <h1
          style={{
            fontFamily: "'Cairo', 'Tajawal', sans-serif",
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: 2,
            background: "linear-gradient(135deg, #00f2fe 0%, #c084fc 50%, #fbbf24 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            margin: 0,
            textAlign: "center",
          }}
        >
          GRAM GO
        </h1>

        <div
          style={{
            width: 130,
            height: 4,
            background: "rgba(255, 255, 255, 0.1)",
            borderRadius: 999,
            overflow: "hidden",
            position: "relative",
            marginTop: 4,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: "45%",
              background: "linear-gradient(90deg, #00f2fe, #c084fc, #fbbf24)",
              borderRadius: 999,
              animation: "splashLoaderAnim 1.4s ease-in-out infinite alternate",
              boxShadow: "0 0 10px rgba(0, 242, 254, 0.7)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function BannedScreen() {
  const { isRtl } = useLanguage();
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "rgba(3,6,18,0.88)", backdropFilter: "blur(20px)",
      padding: "32px 24px", textAlign: "center", gap: 24,
      direction: isRtl ? "rtl" : "ltr",
    }}>
      <div style={{
        width: 84, height: 84, borderRadius: "50%",
        background: "rgba(239,68,68,0.15)", border: "2px solid rgba(239,68,68,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 40, boxShadow: "0 0 30px rgba(239,68,68,0.3)",
      }}>
        🚫
      </div>
      <div style={{
        background: "rgba(20,24,33,0.85)", border: "1px solid rgba(239,68,68,0.3)",
        borderRadius: 24, padding: "28px 24px", maxWidth: 360, width: "100%",
        boxShadow: "0 12px 36px rgba(0,0,0,0.6)",
      }}>
        <h2 style={{ color: "#f87171", fontWeight: 800, fontSize: 22, margin: "0 0 14px", letterSpacing: "0.3px" }}>
          الحساب معطل
        </h2>
        <p style={{ color: "rgba(231,236,242,0.85)", fontSize: 14, margin: 0, lineHeight: 1.7 }}>
          تم حظر هذا الحساب لمخالفة شروط وسياسات الاستخدام.
        </p>
      </div>
    </div>
  );
}

function MaintenanceLottie() {
  const ref = useRef<HTMLDivElement>(null);
  const [animData, setAnimData] = useState<object | null>(null);

  useEffect(() => {
    // Load maintenance animation data only when maintenance screen is actually shown
    import("../public/maintenance-anim.json").then((m) => setAnimData(m.default as object));
  }, []);

  useEffect(() => {
    if (!ref.current || !animData) return;
    const anim = lottie.loadAnimation({
      container: ref.current,
      renderer: "svg",
      loop: true,
      autoplay: true,
      animationData: animData,
    });
    return () => anim.destroy();
  }, [animData]);
  return (
    <div style={{ position: "relative", marginBottom: 16 }}>
      <div style={{
        position: "absolute", inset: -24,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(251,191,36,0.12) 0%, transparent 70%)",
        animation: "blink 2.5s ease-in-out infinite",
        pointerEvents: "none",
      }} />
      <div ref={ref} style={{ width: 160, height: 160, position: "relative" }} />
    </div>
  );
}

function MaintenanceScreen() {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "rgba(3,6,18,0.88)", backdropFilter: "blur(20px)",
      padding: "32px 24px", textAlign: "center",
    }}>
      <MaintenanceLottie />

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>

      <div style={{
        background: "rgba(251,191,36,0.06)",
        border: "1px solid rgba(251,191,36,0.25)",
        borderRadius: 24,
        padding: "32px 28px",
        maxWidth: 340,
        width: "100%",
        boxShadow: "0 0 60px rgba(251,191,36,0.08)",
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)",
          borderRadius: 20, padding: "4px 14px", marginBottom: 18,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fbbf24", display: "inline-block", animation: "blink 1.2s ease-in-out infinite" }} />
          <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em" }}>MAINTENANCE</span>
        </div>

        <h2 style={{ color: "#fef3c7", fontWeight: 900, fontSize: 22, margin: "0 0 14px", lineHeight: 1.3 }}>
          🚧 البوت تحت الصيانة
        </h2>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, margin: "0 0 24px", lineHeight: 1.8, direction: "rtl" }}>
          نحن نعمل على تحديث وتحسين التطبيق.
          <br />سيعود قريباً إن شاء الله! ⚡
        </p>

        <div style={{
          background: "rgba(0,0,0,0.3)", borderRadius: 14,
          padding: "14px 16px",
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, margin: 0, lineHeight: 1.7, direction: "rtl" }}>
            يرجى إغلاق التطبيق والمحاولة مرة أخرى بعد قليل
          </p>
        </div>
      </div>
    </div>
  );
}

const PageFallback = () => (
  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }} />
);

const ROUTES = [
  { path: "/",            Component: HomePage,        lazy: false },
  { path: "/combo",       Component: ComboPage,       lazy: true  },
  { path: "/tasks",       Component: TasksPage,       lazy: true  },
  { path: "/referral",    Component: ReferralPage,    lazy: true  },
  { path: "/leaderboard", Component: LeaderboardPage, lazy: true  },
  { path: "/profile",     Component: ProfilePage,     lazy: true  },
  { path: "/wallet",      Component: ProfilePage,     lazy: true  },
  { path: "/withdraw",    Component: WithdrawPage,    lazy: true  },
  { path: "/admin",       Component: AdminPage,       lazy: true  },
] as const;

function PersistentRouter() {
  const [location] = useLocation();
  const { banned, user, refresh, sessionState, blockedInfo, recheckSession, loading } = useUser();

  // ── 0. Initial Loading ────────────────────────────────────────────
  if (loading && !user) return <LoadingScreen />;

  // ── 1. Banned ─────────────────────────────────────────────────────
  if (banned || sessionState === "banned") return <BannedScreen />;

  // ── 2. Maintenance mode ───────────────────────────────────────────
  if (sessionState === "maintenance") return <MaintenanceScreen />;

  // ── 3. Subscription blocked ───────────────────────────────────────
  if (sessionState === "blocked" && blockedInfo) {
    return (
      <SubscriptionBlockedScreen
        userId={user?.id ?? 0}
        missingChannels={blockedInfo.missingChannels}
        requiredChannels={blockedInfo.requiredChannels}
        onUnblocked={async () => {
          await recheckSession();
          if (user) await refresh();
        }}
      />
    );
  }

  const hideTopBar = location === "/referral" || location === "/leaderboard" || location === "/profile" || location === "/wallet" || location === "/admin";

  return (
    <>
      {!hideTopBar && <TopBar />}
      {ROUTES.map(({ path, Component, lazy: isLazy }) => {
        const isActive =
          path === "/"
            ? location === "/" || location === ""
            : location === path || location.startsWith(path + "/");

        return (
          <div
            key={path}
            style={{
              display: isActive ? "flex" : "none",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
              overflow: path === "/admin" ? "visible" : "hidden",
              height: "100%",
              background: path === "/admin" ? "#0B0A0D" : "transparent",
            }}
          >
            {isLazy ? (
              <Suspense fallback={<PageFallback />}>
                <Component />
              </Suspense>
            ) : (
              <Component />
            )}
          </div>
        );
      })}
      <TabBar />
    </>
  );
}

function App() {
  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <UserProvider>
            <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <AnimatedBackground />
                <PersistentRouter />
              </WouterRouter>
            </div>
          </UserProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </TonConnectUIProvider>
  );
}

export default App;
