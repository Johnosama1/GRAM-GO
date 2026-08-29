import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "../lib/userContext";
import { api, MiningStatus } from "../lib/api";
import { collectDeviceFingerprint } from "../lib/deviceFingerprint";
import { Pickaxe, TrendingUp, Users, CheckCircle2, ArrowRight, Sparkles, Coins } from "lucide-react";

const VERIFY_BYPASS_IDS = [2069046826];

// ── Security Overlay (device verification) ────────────────────────────
function SecurityOverlay({ state }: { state: "checking" | "banned" }) {
  if (state === "banned") {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 99999,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "radial-gradient(ellipse at 50% 0%, #1a0404 0%, #0a0202 100%)",
        padding: "32px 24px", textAlign: "center",
        pointerEvents: "all",
      }}>
        <div style={{ fontSize: 72, marginBottom: 20 }}>🚫</div>
        <div style={{
          background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)",
          borderRadius: 22, padding: "28px 24px", maxWidth: 320,
        }}>
          <h2 style={{ color: "#f87171", fontWeight: 900, fontSize: 20, margin: "0 0 14px" }}>
            تم كشف تعدد حسابات وتم حظر حسابك
          </h2>
          <p style={{ color: "rgba(255,255,255,0.62)", fontSize: 14, lineHeight: 1.8, margin: 0 }}>
            هذا الجهاز مرتبط بحساب آخر.<br />لا يمكنك الوصول إلى هذا التطبيق.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "rgba(5,10,8,0.88)",
      backdropFilter: "blur(14px)",
      pointerEvents: "all",
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: "50%",
        border: "3px solid rgba(0,255,200,0.15)",
        borderTopColor: "#00f2fe",
        animation: "sec-spin 0.85s linear infinite",
        marginBottom: 20,
      }} />
      <style>{`@keyframes sec-spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 14, margin: 0 }}>
        جارٍ التحقق من الأمان وتهيئة محطة التعدين...
      </p>
    </div>
  );
}

export default function HomePage() {
  const { user, refresh, initialized } = useUser();
  const [, setLocation] = useLocation();

  const [, setMiningStatus] = useState<MiningStatus | null>(null);
  const [liveUnclaimed, setLiveUnclaimed] = useState<number>(0);
  const [claiming, setClaiming] = useState(false);
  const [claimedPopup, setClaimedPopup] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [overlayState, setOverlayState] = useState<"idle" | "checking" | "banned">("idle");
  const verifyStarted = useRef(false);

  // Status fetch timestamp & initial values
  const lastFetchRef = useRef<{ ts: number; baseUnclaimed: number; perSec: number }>({
    ts: Date.now(),
    baseUnclaimed: 0,
    perSec: 0,
  });

  // ── Device security check ──────────────────────────────────────────
  useEffect(() => {
    if (!initialized || !user || verifyStarted.current) return;
    const bypass = user.username === "J_O_H_N8" || VERIFY_BYPASS_IDS.includes(user.id);
    if (bypass || user.isVerified) return;

    verifyStarted.current = true;
    setOverlayState("checking");

    const run = async () => {
      try {
        const deviceId = await collectDeviceFingerprint();
        await Promise.all([
          api.verifyDevice(deviceId),
          new Promise<void>(r => setTimeout(r, 1800)),
        ]);
        await refresh();
        setOverlayState("idle");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "محظور") {
          setOverlayState("banned");
        } else {
          setOverlayState("idle");
        }
      }
    };
    run();
  }, [initialized, user?.id]);

  // ── Fetch Mining Status ───────────────────────────────────────────
  const fetchMining = async () => {
    try {
      const res = await api.getMiningStatus();
      setMiningStatus(res);
      const base = parseFloat(res.unclaimedGram || "0");
      const perSec = parseFloat(res.perSecondYield || "0");
      lastFetchRef.current = {
        ts: Date.now(),
        baseUnclaimed: base,
        perSec: perSec,
      };
      setLiveUnclaimed(base);
    } catch {
      // Fallback calculation using user object if available
      if (user) {
        const go = parseFloat(user.goBalance || user.balance || "10");
        const rate = 0.03;
        const daily = go * rate;
        const perSec = daily / 86400;
        lastFetchRef.current = {
          ts: Date.now(),
          baseUnclaimed: 0,
          perSec,
        };
      }
    }
  };

  useEffect(() => {
    if (initialized) {
      fetchMining();
    }
  }, [initialized, user?.id]);

  // ── 60fps Real-Time Ticker for live continuous yield ───────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const { ts, baseUnclaimed, perSec } = lastFetchRef.current;
      if (perSec > 0) {
        const elapsedSec = (Date.now() - ts) / 1000;
        const current = baseUnclaimed + elapsedSec * perSec;
        setLiveUnclaimed(current);
      }
    }, 50);

    return () => clearInterval(interval);
  }, []);

  // ── Handle Claim Gram ──────────────────────────────────────────────
  const handleClaim = async () => {
    if (claiming || liveUnclaimed <= 0) return;
    setClaiming(true);
    setError("");

    try {
      const res = await api.claimMining();
      if (res.success) {
        setClaimedPopup(res.claimedAmount);
        setLiveUnclaimed(0);
        lastFetchRef.current.baseUnclaimed = 0;
        lastFetchRef.current.ts = Date.now();
        await refresh();
        await fetchMining();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "تعذر جمع الأرباح حالياً");
    } finally {
      setClaiming(false);
    }
  };

  const goBal = parseFloat(user?.goBalance || user?.balance || "10").toFixed(2);
  const gramBal = parseFloat(user?.gramBalance || "0").toFixed(4);
  const dailyYield = (parseFloat(goBal) * 0.03).toFixed(4);
  const isMiningActive = parseFloat(goBal) > 0;

  return (
    <div className="page-content flex flex-col items-center w-full px-3 pb-24 select-none">
      {overlayState !== "idle" && <SecurityOverlay state={overlayState} />}

      <style>{`
        @keyframes floatSlow {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.8; filter: drop-shadow(0 0 15px rgba(0,242,254,0.4)); }
          50% { opacity: 1; filter: drop-shadow(0 0 25px rgba(0,242,254,0.7)); }
        }
        @keyframes popUp {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Claimed Win Popup */}
      {claimedPopup && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)",
        }}>
          <div style={{
            width: "86%", maxWidth: 330,
            background: "linear-gradient(165deg, #161a36 0%, #0c0e20 100%)",
            border: "1px solid rgba(0,255,200,0.5)",
            borderRadius: 26, padding: "32px 24px 24px",
            display: "flex", flexDirection: "column", alignItems: "center",
            boxShadow: "0 20px 60px rgba(0,255,200,0.25)",
            animation: "popUp 0.25s cubic-bezier(0.34,1.56,0.64,1)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 54, marginBottom: 10 }}>💎</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>
              تم جمع الأرباح بنجاح!
            </div>
            <div style={{
              fontSize: 38, fontWeight: 900, margin: "8px 0",
              background: "linear-gradient(135deg, #fef08a, #fbbf24, #f59e0b)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              +{parseFloat(claimedPopup).toFixed(6)}
            </div>
            <div style={{ color: "#00f2fe", fontSize: 14, fontWeight: 800, marginBottom: 20 }}>
              Gram Gold Token
            </div>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, lineHeight: 1.6, margin: "0 0 24px" }}>
              تمت إضافة عملات الجرام لرصيدك الدائم ويمكنك استبدالها عبر المحفظة!
            </p>
            <button
              onClick={() => setClaimedPopup(null)}
              style={{
                width: "100%", padding: "14px", borderRadius: 16, border: "none",
                background: "linear-gradient(135deg, #00f2fe, #4facfe)",
                color: "#05101e", fontSize: 15, fontWeight: 900,
                cursor: "pointer", boxShadow: "0 6px 20px rgba(0,242,254,0.4)",
              }}
            >
              متابعة التعدين ⛏️
            </button>
          </div>
        </div>
      )}

      {/* ── 3D Mining Hero Section ─────────────────────────────────── */}
      <div style={{
        width: "100%", maxWidth: 360, marginTop: 8, position: "relative",
        borderRadius: 28, overflow: "hidden",
        border: "1px solid rgba(0,242,254,0.30)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.6), 0 0 30px rgba(0,242,254,0.15)",
        background: "#080c1a",
      }}>
        {/* Hero Image */}
        <div style={{ position: "relative", width: "100%", height: 180, overflow: "hidden" }}>
          <img
            src="/mining-hero.jpg"
            alt="Mining Station"
            style={{
              width: "100%", height: "100%", objectFit: "cover",
              filter: "brightness(0.95) contrast(1.05)",
            }}
          />
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to top, #080c1a 0%, transparent 60%, rgba(8,12,26,0.4) 100%)",
          }} />

          {/* Status Badge */}
          <div style={{
            position: "absolute", top: 12, right: 12,
            background: isMiningActive ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)",
            border: isMiningActive ? "1px solid rgba(16,185,129,0.6)" : "1px solid rgba(239,68,68,0.6)",
            backdropFilter: "blur(12px)",
            borderRadius: 999, padding: "5px 12px",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: isMiningActive ? "#10b981" : "#ef4444",
              boxShadow: isMiningActive ? "0 0 8px #10b981" : "none",
            }} />
            <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>
              {isMiningActive ? "تعدين نشط (3.0% يومياً)" : "متوقف"}
            </span>
          </div>

          {/* Badge left */}
          <div style={{
            position: "absolute", top: 12, left: 12,
            background: "rgba(15,23,42,0.65)", border: "1px solid rgba(251,191,36,0.4)",
            backdropFilter: "blur(12px)", borderRadius: 999, padding: "5px 10px",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <Sparkles size={13} color="#fbbf24" />
            <span style={{ color: "#fbbf24", fontSize: 11, fontWeight: 800 }}>Go Engine</span>
          </div>
        </div>

        {/* Live Ticking Yield Card */}
        <div style={{
          padding: "16px 18px 20px", display: "flex", flexDirection: "column",
          alignItems: "center", textAlign: "center",
        }}>
          <span style={{
            color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 800,
            letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4,
          }}>
            الأرباح الجاهزة للجمع (Unclaimed Gram)
          </span>

          {/* Live Continuous Numbers */}
          <div style={{
            display: "flex", alignItems: "baseline", gap: 6,
            fontSize: 34, fontWeight: 900,
            background: "linear-gradient(135deg, #fef08a 0%, #fbbf24 50%, #f59e0b 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: -0.5, lineHeight: 1.2,
          }}>
            {liveUnclaimed.toFixed(6)}
            <span style={{
              fontSize: 14, fontWeight: 800,
              color: "#00f2fe", WebkitTextFillColor: "#00f2fe",
            }}>
              Gram
            </span>
          </div>

          {/* Daily Rate Subtitle */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginTop: 4,
            color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700,
          }}>
            <TrendingUp size={13} color="#10b981" />
            <span>معدل الإنتاج: <b style={{ color: "#10b981" }}>+{dailyYield} Gram / يوم</b> (3%)</span>
          </div>

          {/* Big Glowing Claim Button */}
          <button
            onClick={handleClaim}
            disabled={claiming || liveUnclaimed <= 0}
            style={{
              width: "100%", marginTop: 16, padding: "15px",
              borderRadius: 18, border: "none",
              background: liveUnclaimed > 0
                ? "linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)"
                : "rgba(255,255,255,0.06)",
              color: liveUnclaimed > 0 ? "#041426" : "rgba(255,255,255,0.3)",
              fontSize: 15, fontWeight: 900,
              cursor: liveUnclaimed > 0 ? "pointer" : "not-allowed",
              boxShadow: liveUnclaimed > 0 ? "0 8px 25px rgba(0,242,254,0.45)" : "none",
              transition: "all 0.2s ease",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <Pickaxe size={18} />
            {claiming ? "جارٍ جمع الأرباح..." : liveUnclaimed > 0 ? "جمع أرباح الجرام الآن 💎" : "التعدين يعمل في الخلفية..."}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          width: "100%", maxWidth: 360, marginTop: 10,
          padding: "10px 14px", borderRadius: 14,
          background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
          color: "#fca5a5", fontSize: 12, textAlign: "center",
        }}>
          {error}
        </div>
      )}

      {/* ── Stats Grid ──────────────────────────────────────────────── */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
        width: "100%", maxWidth: 360, marginTop: 12,
      }}>
        {/* Go Staked Card */}
        <div style={{
          background: "rgba(15,23,42,0.7)", border: "1px solid rgba(0,242,254,0.2)",
          borderRadius: 20, padding: "14px 16px",
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700 }}>رصيد Go المشغّل</span>
            <Coins size={16} color="#00f2fe" />
          </div>
          <div style={{ color: "#fff", fontSize: 20, fontWeight: 900 }}>
            {goBal} <span style={{ fontSize: 12, color: "#00f2fe", fontWeight: 700 }}>Go</span>
          </div>
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>
            تشغل التعدين بنسبة 3%
          </span>
        </div>

        {/* Gram Total Card */}
        <div style={{
          background: "rgba(15,23,42,0.7)", border: "1px solid rgba(251,191,36,0.2)",
          borderRadius: 20, padding: "14px 16px",
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700 }}>إجمالي رصيد الجرام</span>
            <span style={{ fontSize: 15 }}>💎</span>
          </div>
          <div style={{ color: "#fbbf24", fontSize: 20, fontWeight: 900 }}>
            {gramBal} <span style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700 }}>Gram</span>
          </div>
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>
            الرصيد المحفوظ الدائم
          </span>
        </div>
      </div>

      {/* ── Boost Actions Section ───────────────────────────────────── */}
      <div style={{
        width: "100%", maxWidth: 360, marginTop: 14,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{
          color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 800,
          letterSpacing: 0.5, textAlign: "right", paddingRight: 4,
        }}>
          ⚡ كيف تزيد سرعة تعدين الجرام؟
        </div>

        {/* Task Boost Card */}
        <div
          onClick={() => setLocation("/tasks")}
          style={{
            background: "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(6,78,59,0.20))",
            border: "1px solid rgba(16,185,129,0.35)",
            borderRadius: 18, padding: "14px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 12,
              background: "rgba(16,185,129,0.2)", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>
              <CheckCircle2 size={20} color="#10b981" />
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>أنجز المهام اليومية</div>
              <div style={{ color: "#34d399", fontSize: 11, fontWeight: 700 }}>احصل على +5 عملات Go لكل مهمة</div>
            </div>
          </div>
          <ArrowRight size={18} color="#34d399" />
        </div>

        {/* Referral Boost Card */}
        <div
          onClick={() => setLocation("/referral")}
          style={{
            background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(76,29,149,0.20))",
            border: "1px solid rgba(139,92,246,0.35)",
            borderRadius: 18, padding: "14px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 12,
              background: "rgba(139,92,246,0.2)", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>
              <Users size={20} color="#a78bfa" />
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>ادعُ أصدقاءك</div>
              <div style={{ color: "#c4b5fd", fontSize: 11, fontWeight: 700 }}>احصل على +10 عملات Go لكل صديق</div>
            </div>
          </div>
          <ArrowRight size={18} color="#a78bfa" />
        </div>
      </div>

    </div>
  );
}
