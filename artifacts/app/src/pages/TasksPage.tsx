import { useState, useEffect } from "react";
import { useUser } from "../lib/userContext";
import {
  api,
  Task,
  CheckinStatus,
  getTasksOnce,
  getCompletedTasksOnce,
  invalidateUserCaches,
} from "../lib/api";
import { CheckCircle, ExternalLink, Clock, Zap, Calendar } from "lucide-react";

export default function TasksPage() {
  const { user, refresh, initialized, retryInit, setCanClaimCheckin } =
    useUser();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completed, setCompleted] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<number | null>(null);
  const [urlOpened, setUrlOpened] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<{
    taskId: number | string;
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [taskThreshold, setTaskThreshold] = useState(5);
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Daily Check-in State
  const [checkin, setCheckin] = useState<CheckinStatus | null>(null);
  const [claimingCheckin, setClaimingCheckin] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [redeemingPromo, setRedeemingPromo] = useState(false);

  // Ads Tasks State
  const [adsStatus, setAdsStatus] = useState<{
    watchedToday: number;
    dailyLimit: number;
    rewardAmount: number;
    nextResetTime?: string;
  } | null>(null);
  const [adsTimeLeft, setAdsTimeLeft] = useState<{ h: number; m: number; s: number } | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (adsStatus?.nextResetTime) {
      const updateTimer = () => {
        const now = new Date();
        const resetTime = new Date(adsStatus.nextResetTime!);
        const diff = resetTime.getTime() - now.getTime();

        if (diff <= 0) {
          setAdsTimeLeft(null);
          // Automatically reset ads counter for the frontend
          setAdsStatus((prev) => prev ? { ...prev, watchedToday: 0 } : null);
        } else {
          const h = Math.floor(diff / (1000 * 60 * 60));
          const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const s = Math.floor((diff % (1000 * 60)) / 1000);
          setAdsTimeLeft({ h, m, s });
        }
      };

      updateTimer();
      timer = setInterval(updateTimer, 1000);
    }
    return () => clearInterval(timer);
  }, [adsStatus?.nextResetTime]);
  const [watchingAd, setWatchingAd] = useState(false);

  useEffect(() => {
    api
      .getConfig()
      .then((cfg) => {
        if (cfg.taskThreshold && cfg.taskThreshold > 0)
          setTaskThreshold(cfg.taskThreshold);
      })
      .catch(() => {});
  }, []);

  const handleRedeemPromo = async () => {
    if (!promoCode.trim()) return;
    setRedeemingPromo(true);
    try {
      const res = await api.redeemPromoCode(promoCode);
      if (res.success) {
        setMessage({ taskId: "promo", text: res.message, type: "success" });
        setPromoCode("");
        refresh();
      } else {
        setMessage({
          taskId: "promo",
          text: res.error || "خطأ غير معروف",
          type: "error",
        });
      }
    } catch (err: any) {
      setMessage({
        taskId: "promo",
        text: err.message || "حدث خطأ أثناء الاتصال بالخادم",
        type: "error",
      });
    } finally {
      setRedeemingPromo(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const loadCheckin = () => {
    api
      .getCheckinStatus()
      .then((data) => {
        setCheckin(data);
        setCanClaimCheckin(Boolean(data.canClaim));
      })
      .catch((err) => console.error("Failed to load checkin:", err));
  };

  const loadAdsStatus = () => {
    api.getAdsStatus()
      .then(data => setAdsStatus(data))
      .catch(err => console.error("Failed to load ads status:", err));
  };

  useEffect(() => {
    if (!initialized) return;
    if (!user) {
      setLoading(false);
      return;
    }
    loadCheckin();
    loadAdsStatus();
    Promise.all([getTasksOnce(), getCompletedTasksOnce(user.id)])
      .then(([t, c]) => {
        setTasks(t);
        setCompleted(c);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, initialized]);

  const handleWatchAd = async () => {
    if (!user || watchingAd || !adsStatus) return;
    if (adsStatus.watchedToday >= adsStatus.dailyLimit) return;

    setWatchingAd(true);
    // Note: Here you would typically integrate with an ad provider SDK (like GramAds, TonAds, etc.)
    // For this implementation, we simulate watching an ad:
    setTimeout(async () => {
      try {
        const res = await api.watchAd();
        if (res.success) {
          setAdsStatus({
            watchedToday: res.watchedToday,
            dailyLimit: res.dailyLimit,
            rewardAmount: res.rewardAmount,
            nextResetTime: res.nextResetTime,
          });
          setMessage({
            taskId: "ad",
            text: `✅ إعلان مكتمل! حصلت على +${res.rewardAmount} GO`,
            type: "success",
          });
          refresh();
        }
      } catch (e: any) {
        setMessage({
          taskId: "ad",
          text: e.message || "فشل في إكمال الإعلان",
          type: "error",
        });
      } finally {
        setWatchingAd(false);
        setTimeout(() => setMessage(null), 4000);
      }
    }, 1500); // simulate ad delay
  };

  const handleOpenUrl = (task: Task) => {
    window.open(task.url!, "_blank");
    setUrlOpened((prev) => new Set([...prev, task.id]));
  };

  const handleVerify = async (task: Task) => {
    if (!user || completing !== null) return;
    setCompleting(task.id);
    try {
      await api.completeTask(task.id, user.id);
      invalidateUserCaches(user.id);
      setCompleted((prev) => [...prev, task.id]);
      setMessage({
        taskId: task.id,
        text: "✅ تم إنجاز المهمة! حصلت على +5 عملات Go لزيادة سرعة التعدين!",
        type: "success",
      });
      await refresh();
    } catch (e: unknown) {
      setMessage({
        taskId: task.id,
        text: e instanceof Error ? e.message : "Failed",
        type: "error",
      });
    } finally {
      setCompleting(null);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleComplete = async (task: Task) => {
    if (!user || completing !== null) return;
    if (task.url) {
      if (!urlOpened.has(task.id)) {
        handleOpenUrl(task);
        return;
      }
      await handleVerify(task);
    } else {
      await handleVerify(task);
    }
  };

  const handleClaimCheckin = async () => {
    if (!user || claimingCheckin || !checkin?.canClaim) return;
    setClaimingCheckin(true);
    try {
      const res = await api.claimDailyCheckin();
      setMessage({ taskId: "checkin", text: res.message, type: "success" });
      setCanClaimCheckin(false);
      loadCheckin();
      await refresh();
    } catch (e: unknown) {
      const errMsg =
        e instanceof Error ? e.message : "Failed to claim daily reward";
      setMessage({ taskId: "checkin", text: errMsg, type: "error" });
    } finally {
      setClaimingCheckin(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const categories = [
    { id: "all", label: "📋 All" },
    { id: "channel", label: "📢 Channel" },
    { id: "daily", label: "📅 Daily Check-in" },
    { id: "ads", label: "📺 Ads & Promo" },
    { id: "bot", label: "🤖 Bot" }
  ];

  const filteredTasks = tasks.filter((t) => {
    if (selectedCategory === "all") return true;
    return (t.category || "all") === selectedCategory;
  });

  const activeTasks = filteredTasks.filter((t) => !completed.includes(t.id));
  const doneTasks = filteredTasks.filter((t) => completed.includes(t.id));
  const displayTasks = [...activeTasks, ...doneTasks];

  return (
    <div
      className="page-content"
      style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      {/* ── Category Navigation Bar ── */}
      <div
        style={{
          display: "flex",
          overflowX: "auto",
          gap: 8,
          padding: "0 16px 12px 16px",
          flexShrink: 0,
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
      >
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCategory(c.id)}
            style={{
              padding: "8px 16px",
              borderRadius: 20,
              border:
                selectedCategory === c.id
                  ? "1.5px solid rgba(168, 85, 247, 0.6)"
                  : "1.5px solid rgba(255, 255, 255, 0.08)",
              background:
                selectedCategory === c.id
                  ? "rgba(168, 85, 247, 0.15)"
                  : "rgba(0,0,0,0.3)",
              color:
                selectedCategory === c.id ? "#fff" : "rgba(255, 255, 255, 0.6)",
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: "nowrap",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* ── Scrollable tasks content ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding:
            "12px 12px calc(80px + env(safe-area-inset-bottom, 0px) + 12px)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* ── Toast message if checkin claimed ── */}
        {message?.taskId === "checkin" && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 14,
              background:
                message.type === "success"
                  ? "rgba(34,197,94,0.15)"
                  : "rgba(239,68,68,0.15)",
              border:
                message.type === "success"
                  ? "1px solid rgba(34,197,94,0.4)"
                  : "1px solid rgba(239,68,68,0.4)",
              color: message.type === "success" ? "#4ade80" : "#f87171",
              fontSize: 12,
              fontWeight: 800,
              textAlign: "center",
            }}
          >
            {message.text}
          </div>
        )}


{/* ══════════════════════════════════════════════════════════════════
          1. DAILY CHECK-IN CARD (التسجيل اليومي)
      ══════════════════════════════════════════════════════════════════ */}
        {checkin && (selectedCategory === "daily" || selectedCategory === "all") && (
          <div
            style={{
              background:
                "linear-gradient(165deg, rgba(10, 18, 42, 0.85) 0%, rgba(4, 8, 20, 0.95) 100%)",
              border: "1px solid rgba(0, 242, 254, 0.25)",
              borderRadius: 22,
              padding: "16px 14px",
              boxShadow: "0 8px 28px rgba(0, 0, 0, 0.4)",
              marginBottom: 12,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ position: "relative" }}>
                  <Calendar size={18} color="#00f2fe" />
                  {checkin.canClaim && (
                    <span
                      style={{
                        position: "absolute",
                        top: -2,
                        right: -2,
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#00f2fe",
                        boxShadow: "0 0 8px #00f2fe",
                      }}
                    />
                  )}
                </div>
                <div>
                  <span
                    style={{ color: "#ffffff", fontWeight: 900, fontSize: 14 }}
                  >
                    Daily Check-in
                  </span>
                  <span
                    style={{
                      color: "rgba(255,255,255,0.45)",
                      fontSize: 11,
                      marginRight: 6,
                      marginLeft: 6,
                    }}
                  >
                    • التسجيل اليومي
                  </span>
                </div>
              </div>

              <div
                style={{
                  background: "rgba(251, 191, 36, 0.15)",
                  border: "1px solid rgba(251, 191, 36, 0.4)",
                  borderRadius: 12,
                  padding: "3px 8px",
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#fbbf24",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                🔥 Day {checkin.currentStreak}/10
              </div>
            </div>

            {/* 10 Days Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 6,
              }}
            >
              {checkin.days.map((d) => {
                const isClaimed = d.status === "claimed";
                const isAvailable = d.status === "available";

                return (
                  <div
                    key={d.day}
                    onClick={
                      isAvailable && !claimingCheckin
                        ? handleClaimCheckin
                        : undefined
                    }
                    role={isAvailable ? "button" : undefined}
                    tabIndex={isAvailable ? 0 : undefined}
                    style={{
                      position: "relative",
                      background: isAvailable
                        ? "linear-gradient(135deg, rgba(0, 242, 254, 0.28), rgba(168, 85, 247, 0.28))"
                        : isClaimed
                          ? "rgba(34, 197, 94, 0.12)"
                          : "rgba(255, 255, 255, 0.03)",
                      border: isAvailable
                        ? "1.5px solid #00f2fe"
                        : isClaimed
                          ? "1px solid rgba(34, 197, 94, 0.4)"
                          : "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: 12,
                      padding: "8px 4px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 3,
                      boxShadow: isAvailable
                        ? "0 0 14px rgba(0, 242, 254, 0.35)"
                        : "none",
                      cursor: isAvailable
                        ? claimingCheckin
                          ? "wait"
                          : "pointer"
                        : "default",
                      transform: isAvailable ? "scale(1.02)" : "scale(1)",
                      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                      userSelect: "none",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    {/* Notification Badge Dot on available day */}
                    {isAvailable && (
                      <span
                        style={{
                          position: "absolute",
                          top: 3,
                          right: 3,
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "#00f2fe",
                          boxShadow: "0 0 8px #00f2fe",
                        }}
                      />
                    )}

                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: isAvailable
                          ? "#00f2fe"
                          : "rgba(255,255,255,0.5)",
                      }}
                    >
                      Day {d.day}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        color: isAvailable
                          ? "#00f2fe"
                          : isClaimed
                            ? "#4ade80"
                            : "#ffffff",
                      }}
                    >
                      +{d.reward}
                    </span>
                    <span
                      style={{ fontSize: 9, fontWeight: 800, color: "#fbbf24" }}
                    >
                      GO
                    </span>
                    <div style={{ marginTop: 2, fontSize: 10 }}>
                      {isClaimed
                        ? "✅"
                        : isAvailable
                          ? claimingCheckin
                            ? "⏳"
                            : "🎁"
                          : "🔒"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

{/* ══════════════════════════════════════════════════════════════════
          2. ADS TASK CARD (Watch Advertisement)
      ══════════════════════════════════════════════════════════════════ */}
        {adsStatus && (selectedCategory === "ads" || selectedCategory === "all") && (
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)",
              border: "1px solid rgba(139, 92, 246, 0.25)",
              borderRadius: 22,
              padding: "16px 14px",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
              marginBottom: 12,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(56,189,248,0.2))",
                    border: "1px solid rgba(139,92,246,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                  }}
                >
                  📺
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>
                    Watch Advertisement
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 500 }}>
                    Reward: +{adsStatus.rewardAmount} GO
                  </span>
                  <span style={{ color: "#a855f7", fontSize: 11, fontWeight: 700, marginTop: 2 }}>
                    Progress: {adsStatus.watchedToday === adsStatus.dailyLimit
                      ? `All ${adsStatus.dailyLimit} ads completed today`
                      : `${adsStatus.dailyLimit - adsStatus.watchedToday} ad${(adsStatus.dailyLimit - adsStatus.watchedToday) === 1 ? '' : 's'} remaining`}
                  </span>
                </div>
              </div>
              <button
                onClick={handleWatchAd}
                disabled={watchingAd || adsStatus.watchedToday >= adsStatus.dailyLimit}
                style={{
                  padding: "8px 16px",
                  borderRadius: 12,
                  fontWeight: 800,
                  fontSize: 12,
                  border: "none",
                  cursor: watchingAd || adsStatus.watchedToday >= adsStatus.dailyLimit ? "not-allowed" : "pointer",
                  background: adsStatus.watchedToday >= adsStatus.dailyLimit
                    ? "rgba(255,255,255,0.1)"
                    : "linear-gradient(135deg, #a855f7, #7e22ce)",
                  color: adsStatus.watchedToday >= adsStatus.dailyLimit ? "rgba(255,255,255,0.4)" : "#fff",
                  opacity: watchingAd ? 0.6 : 1,
                }}
              >
                {watchingAd
                  ? "..."
                  : adsStatus.watchedToday >= adsStatus.dailyLimit
                    ? "Done"
                    : "Watch Ad"}
              </button>
            </div>

            {adsStatus.watchedToday >= adsStatus.dailyLimit && adsTimeLeft && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 16 }}>✅</span>
                  <span style={{ color: "#22c55e", fontSize: 13, fontWeight: 600 }}>
                    You have watched all {adsStatus.dailyLimit} ads for today.
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>⏳</span>
                  <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 500 }}>
                    Next {adsStatus.dailyLimit} ads available in:
                    <strong style={{ color: "#fff", marginLeft: 4 }}>
                      {adsTimeLeft.h}h {adsTimeLeft.m}m
                    </strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

{/* Promo Code Box */}
      {(selectedCategory === "ads" || selectedCategory === "all") && (
          <div
            style={{
              background: "rgba(168, 85, 247, 0.1)",
              border: "1px solid rgba(168, 85, 247, 0.3)",
              borderRadius: 16,
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🎁</span>
              <span style={{ color: "#e9d5ff", fontWeight: 700, fontSize: 15 }}>
                Redeem Promo Code
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="Enter Code"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                style={{
                  flex: 1,
                  background: "rgba(0,0,0,0.5)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  padding: "10px 14px",
                  color: "#fff",
                  outline: "none",
                  fontSize: 14,
                }}
              />
              <button
                onClick={handleRedeemPromo}
                disabled={redeemingPromo || !promoCode.trim()}
                style={{
                  background:
                    "linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)",
                  border: "none",
                  borderRadius: 12,
                  padding: "0 16px",
                  color: "#fff",
                  fontWeight: 700,
                  cursor:
                    redeemingPromo || !promoCode.trim()
                      ? "not-allowed"
                      : "pointer",
                  opacity: redeemingPromo || !promoCode.trim() ? 0.6 : 1,
                }}
              >
                {redeemingPromo ? "⏳" : "Redeem"}
              </button>
            </div>
            {message && message.taskId === "promo" && (
              <div
                style={{
                  color: message.type === "success" ? "#34d399" : "#ef4444",
                  fontSize: 13,
                  fontWeight: 600,
                  marginTop: 4,
                }}
              >
                {message.type === "success" ? "✅" : "❌"} {message.text}
              </div>
            )}
          </div>
      )}

        {/* ── Section title ── */}
        {!loading && displayTasks.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "2px 4px",
              marginTop: 2,
            }}
          >
            <span
              style={{
                color: "rgba(255,255,255,0.85)",
                fontWeight: 800,
                fontSize: 13,
                letterSpacing: 0.3,
              }}
            >
              Tasks
            </span>
            <span
              style={{
                color: "rgba(255,255,255,0.40)",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {displayTasks.length} tasks
            </span>
          </div>
        )}

        {/* ── Tasks list ── */}
        {loading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "36px 0",
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                border: "2.5px solid rgba(251,191,36,0.70)",
                borderTopColor: "transparent",
                animation: "spin 0.75s linear infinite",
              }}
            />
          </div>
        ) : initialized && !user ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 18px",
              borderRadius: 22,
              marginTop: 4,
              background: "rgba(255,255,255,0.025)",
              border: "1px dashed rgba(255,100,100,0.20)",
            }}
          >
            <div style={{ fontSize: 38, marginBottom: 10 }}>⚠️</div>
            <p
              style={{
                color: "rgba(255,255,255,0.70)",
                fontSize: 13,
                fontWeight: 700,
                margin: 0,
              }}
            >
              Connection Error
            </p>
            <p
              style={{
                color: "rgba(255,255,255,0.35)",
                fontSize: 11,
                marginTop: 5,
                marginBottom: 16,
              }}
            >
              Could not reach the server
            </p>
            <button
              onClick={retryInit}
              style={{
                padding: "10px 24px",
                borderRadius: 12,
                border: "1px solid rgba(251,191,36,0.40)",
                background: "rgba(251,191,36,0.10)",
                color: "#fbbf24",
                fontWeight: 700,
                fontSize: 13,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              🔄 Retry Connection
            </button>
          </div>
        ) : displayTasks.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 18px",
              borderRadius: 22,
              marginTop: 4,
              background: "rgba(255,255,255,0.025)",
              border: "1px dashed rgba(255,255,255,0.10)",
            }}
          >
            <div style={{ fontSize: 38, marginBottom: 10, opacity: 0.5 }}>
              📋
            </div>
            <p
              style={{
                color: "rgba(255,255,255,0.55)",
                fontSize: 13,
                fontWeight: 700,
                margin: 0,
              }}
            >
              No tasks available
            </p>
            <p
              style={{
                color: "rgba(255,255,255,0.25)",
                fontSize: 11,
                marginTop: 5,
              }}
            >
              Check back soon for new rewards
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {displayTasks.map((task) => {
              const isDone = completed.includes(task.id);
              const isExpiring =
                task.expiresAt &&
                new Date(task.expiresAt).getTime() - Date.now() < 3600000;
              const isOpened = urlOpened.has(task.id);
              const showOpen = task.url && !isOpened && !isDone;

              return (
                <div
                  key={task.id}
                  className="slide-up"
                  style={{
                    position: "relative",
                    padding: "12px 12px",
                    borderRadius: 18,
                    backdropFilter: "blur(18px)",
                    WebkitBackdropFilter: "blur(18px)",
                    border: isDone
                      ? "1px solid rgba(16,185,129,0.28)"
                      : "1px solid rgba(255,255,255,0.08)",
                    background: isDone
                      ? "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(8,6,22,0.65))"
                      : "linear-gradient(135deg, rgba(20,16,42,0.65), rgba(8,6,22,0.78))",
                    boxShadow:
                      "0 4px 18px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.04)",
                    opacity: isDone ? 0.78 : 1,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 11 }}
                  >
                    {/* Task icon */}
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 14,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 22,
                        overflow: "hidden",
                        position: "relative",
                        background: isDone
                          ? "rgba(16,185,129,0.12)"
                          : "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(56,189,248,0.10))",
                        border: isDone
                          ? "1.5px solid rgba(16,185,129,0.32)"
                          : "1.5px solid rgba(139,92,246,0.25)",
                        boxShadow: isDone
                          ? "0 0 12px rgba(16,185,129,0.18)"
                          : "0 0 12px rgba(139,92,246,0.15)",
                      }}
                    >
                      {task.channelPhotoUrl ? (
                        <img
                          src={task.channelPhotoUrl}
                          alt={task.title}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                          onError={(e) => {
                            (
                              e.currentTarget as HTMLImageElement
                            ).style.display = "none";
                          }}
                        />
                      ) : (
                        task.icon || "⭐"
                      )}
                    </div>

                    {/* Task info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "nowrap",
                        }}
                      >
                        <span
                          style={{
                            color: isDone ? "rgba(255,255,255,0.65)" : "#fff",
                            fontWeight: 700,
                            fontSize: 13.5,
                            textDecoration: isDone ? "line-through" : "none",
                            textDecorationColor: "rgba(255,255,255,0.30)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          {task.title}
                        </span>
                        {isExpiring && !isDone && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              color: "#fb923c",
                              fontSize: 9,
                              flexShrink: 0,
                              fontWeight: 700,
                              background: "rgba(249,115,22,0.14)",
                              padding: "2px 7px",
                              borderRadius: 999,
                              border: "1px solid rgba(249,115,22,0.28)",
                            }}
                          >
                            <Clock size={9} /> Soon
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <p
                          style={{
                            color: "rgba(255,255,255,0.40)",
                            fontSize: 11.5,
                            fontWeight: 500,
                            margin: "2px 0 0",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {task.description}
                        </p>
                      )}
                      {!isDone && (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                            marginTop: 5,
                            background: "rgba(0,242,254,0.12)",
                            border: "1px solid rgba(0,242,254,0.25)",
                            borderRadius: 999,
                            padding: "2px 8px",
                          }}
                        >
                          <Zap size={9} color="#00f2fe" fill="#00f2fe" />
                          <span
                            style={{
                              color: "#00f2fe",
                              fontSize: 10,
                              fontWeight: 800,
                              letterSpacing: 0.2,
                            }}
                          >
                            +5 Go
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action button */}
                    <div style={{ flexShrink: 0 }}>
                      {isDone ? (
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 12,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(16,185,129,0.15)",
                            border: "1px solid rgba(16,185,129,0.30)",
                            boxShadow: "0 0 10px rgba(16,185,129,0.15)",
                          }}
                        >
                          <CheckCircle size={19} color="#34d399" />
                        </div>
                      ) : (
                        <button
                          onClick={() => handleComplete(task)}
                          disabled={completing === task.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "9px 14px",
                            borderRadius: 12,
                            fontWeight: 800,
                            fontSize: 12,
                            border: "none",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            background: showOpen
                              ? "linear-gradient(135deg, #60a5fa, #3b82f6)"
                              : "linear-gradient(135deg, #fde68a, #fbbf24, #f59e0b)",
                            color: showOpen ? "#fff" : "#0a0600",
                            boxShadow: showOpen
                              ? "0 4px 14px rgba(59,130,246,0.45)"
                              : "0 4px 14px rgba(251,191,36,0.45)",
                            opacity: completing === task.id ? 0.55 : 1,
                            whiteSpace: "nowrap",
                            transition: "all 0.2s",
                          }}
                        >
                          {showOpen ? (
                            <>
                              <ExternalLink size={11} /> Open
                            </>
                          ) : completing === task.id ? (
                            "..."
                          ) : (
                            <>
                              <CheckCircle size={11} /> Verify
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {message?.taskId === task.id && (
                    <div
                      style={{
                        fontSize: 11,
                        marginTop: 9,
                        padding: "7px 10px",
                        borderRadius: 10,
                        background:
                          message.type === "success"
                            ? "rgba(16,185,129,0.10)"
                            : "rgba(248,113,113,0.10)",
                        color:
                          message.type === "success" ? "#34d399" : "#fca5a5",
                        border: `1px solid ${message.type === "success" ? "rgba(16,185,129,0.22)" : "rgba(248,113,113,0.22)"}`,
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontWeight: 600,
                      }}
                    >
                      {message.text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
      {/* ── end scrollable tasks content ── */}
    </div>
  );
}
