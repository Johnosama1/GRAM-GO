import { useState, useEffect } from "react";
import { useUser } from "../lib/userContext";
import { api, Task, CheckinStatus, getTasksOnce, getCompletedTasksOnce, invalidateUserCaches } from "../lib/api";
import { CheckCircle, ExternalLink, Clock, Zap, Sparkles, Calendar, Award, Gift } from "lucide-react";

export default function TasksPage() {
  const { user, refresh, initialized, retryInit } = useUser();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completed, setCompleted] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<number | null>(null);
  const [urlOpened, setUrlOpened] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<{ taskId: number | string; text: string; type: "success" | "error" } | null>(null);
  const [taskThreshold, setTaskThreshold] = useState(5);

  // Daily Check-in State
  const [checkin, setCheckin] = useState<CheckinStatus | null>(null);
  const [claimingCheckin, setClaimingCheckin] = useState(false);

  useEffect(() => {
    api.getConfig().then(cfg => {
      if (cfg.taskThreshold && cfg.taskThreshold > 0) setTaskThreshold(cfg.taskThreshold);
    }).catch(() => {});
  }, []);

  const loadCheckin = () => {
    api.getCheckinStatus()
      .then((data) => setCheckin(data))
      .catch((err) => console.error("Failed to load checkin:", err));
  };

  useEffect(() => {
    if (!initialized) return;
    if (!user) { setLoading(false); return; }
    loadCheckin();
    Promise.all([getTasksOnce(), getCompletedTasksOnce(user.id)])
      .then(([t, c]) => {
        setTasks(t);
        setCompleted(c);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, initialized]);

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
      setMessage({ taskId: task.id, text: "✅ تم إنجاز المهمة! حصلت على +5 عملات Go لزيادة سرعة التعدين!", type: "success" });
      await refresh();
    } catch (e: unknown) {
      setMessage({ taskId: task.id, text: e instanceof Error ? e.message : "Failed", type: "error" });
    } finally {
      setCompleting(null);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleComplete = async (task: Task) => {
    if (!user || completing !== null) return;
    if (task.url) {
      if (!urlOpened.has(task.id)) { handleOpenUrl(task); return; }
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
      loadCheckin();
      await refresh();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : "Failed to claim daily reward";
      setMessage({ taskId: "checkin", text: errMsg, type: "error" });
    } finally {
      setClaimingCheckin(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const activeTasks = tasks.filter((t) => !completed.includes(t.id));
  const doneTasks = tasks.filter((t) => completed.includes(t.id));
  const goBalance = parseFloat(user?.goBalance || user?.balance || "0").toFixed(1);

  return (
    <div className="page-content" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Fixed Progress Card (always visible, never scrolls) ── */}
      <div style={{
        flexShrink: 0,
        zIndex: 10,
        padding: "12px 12px 8px",
        background: "transparent",
      }}>
      {/* ── Hero Progress Card ── */}
      <div className="slide-up" style={{
        position: "relative",
        padding: "16px 16px 14px",
        borderRadius: 22,
        overflow: "hidden",
        background:
          "radial-gradient(120% 100% at 0% 0%, rgba(0,242,254,0.22) 0%, rgba(16,185,129,0.08) 45%, rgba(8,6,22,0.45) 100%)",
        border: "1px solid rgba(0,242,254,0.30)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        boxShadow: "0 6px 20px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}>
        {/* sheen */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(80% 60% at 100% 0%, rgba(0,242,254,0.12), transparent 60%)",
        }} />

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(135deg, rgba(0,242,254,0.30), rgba(16,185,129,0.20))",
            border: "1px solid rgba(0,242,254,0.40)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 14px rgba(0,242,254,0.25)",
          }}>
            <Sparkles size={20} color="#00f2fe" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}>
              مضاعفة سرعة التعدين (+5 Go)
            </div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 2 }}>
              أنجز كل مهمة للحصول على +5 Go لزيادة إنتاج الجرام 3% يومياً
            </div>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "rgba(0,0,0,0.35)", border: "1px solid rgba(0,242,254,0.35)",
            borderRadius: 999, padding: "5px 11px",
            boxShadow: "0 0 10px rgba(0,242,254,0.15)",
          }}>
            <Zap size={12} color="#00f2fe" fill="#00f2fe" />
            <span style={{ color: "#00f2fe", fontWeight: 900, fontSize: 12, letterSpacing: 0.3 }}>
              {goBalance} Go
            </span>
          </div>
        </div>
      </div>
      </div>{/* ── end fixed wrapper ── */}

      {/* ── Scrollable tasks content ── */}
      <div style={{
        flex: 1, overflowY: "auto",
        padding: "4px 12px calc(80px + env(safe-area-inset-bottom, 0px) + 12px)",
        display: "flex", flexDirection: "column", gap: 12,
      }}>

      {/* ── Toast message if checkin claimed ── */}
      {message?.taskId === "checkin" && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 14,
            background: message.type === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
            border: message.type === "success" ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(239,68,68,0.4)",
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
      {checkin && (
        <div
          style={{
            background: "linear-gradient(165deg, rgba(10, 18, 42, 0.85) 0%, rgba(4, 8, 20, 0.95) 100%)",
            border: "1px solid rgba(0, 242, 254, 0.25)",
            borderRadius: 22,
            padding: "16px 14px",
            boxShadow: "0 8px 28px rgba(0, 0, 0, 0.4)",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Calendar size={18} color="#00f2fe" />
              <div>
                <span style={{ color: "#ffffff", fontWeight: 900, fontSize: 14 }}>
                  Daily Check-in
                </span>
                <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginRight: 6, marginLeft: 6 }}>
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
              marginBottom: 14,
            }}
          >
            {checkin.days.map((d) => {
              const isClaimed = d.status === "claimed";
              const isAvailable = d.status === "available";

              return (
                <div
                  key={d.day}
                  style={{
                    background: isAvailable
                      ? "linear-gradient(135deg, rgba(0, 242, 254, 0.25), rgba(168, 85, 247, 0.25))"
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
                    boxShadow: isAvailable ? "0 0 12px rgba(0, 242, 254, 0.3)" : "none",
                  }}
                >
                  <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>
                    Day {d.day}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 900,
                      color: isAvailable ? "#00f2fe" : isClaimed ? "#4ade80" : "#ffffff",
                    }}
                  >
                    +{d.reward}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 800, color: "#fbbf24" }}>
                    GO
                  </span>
                  <div style={{ marginTop: 2, fontSize: 10 }}>
                    {isClaimed ? "✅" : isAvailable ? "🎁" : "🔒"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Claim Button */}
          {checkin.canClaim ? (
            <button
              onClick={handleClaimCheckin}
              disabled={claimingCheckin}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 14,
                background: "linear-gradient(135deg, #00f2fe 0%, #7c3aed 100%)",
                border: "none",
                color: "#040714",
                fontSize: 13,
                fontWeight: 900,
                cursor: "pointer",
                boxShadow: "0 4px 20px rgba(0, 242, 254, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Gift size={16} />
              {claimingCheckin
                ? "Claiming..."
                : `Claim Day ${checkin.nextDay} (+${checkin.todayReward} GO)`}
            </button>
          ) : (
            <div
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: 14,
                background: "rgba(34, 197, 94, 0.12)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                color: "#4ade80",
                fontSize: 12,
                fontWeight: 800,
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <CheckCircle size={14} />
              Today's check-in completed • Come back tomorrow!
            </div>
          )}
        </div>
      )}

      {/* ── Section title ── */}
      {!loading && activeTasks.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "2px 4px", marginTop: 2,
        }}>
          <span style={{
            color: "rgba(255,255,255,0.85)", fontWeight: 800, fontSize: 13,
            letterSpacing: 0.3,
          }}>
            Available Tasks
          </span>
          <span style={{
            color: "rgba(255,255,255,0.40)", fontSize: 11, fontWeight: 600,
          }}>
            {activeTasks.length} available
          </span>
        </div>
      )}

      {/* ── Tasks list ── */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "36px 0" }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            border: "2.5px solid rgba(251,191,36,0.70)", borderTopColor: "transparent",
            animation: "spin 0.75s linear infinite",
          }} />
        </div>
      ) : (initialized && !user) ? (
        <div style={{
          textAlign: "center", padding: "40px 18px", borderRadius: 22, marginTop: 4,
          background: "rgba(255,255,255,0.025)", border: "1px dashed rgba(255,100,100,0.20)",
        }}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>⚠️</div>
          <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 13, fontWeight: 700, margin: 0 }}>
            Connection Error
          </p>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 5, marginBottom: 16 }}>
            Could not reach the server
          </p>
          <button
            onClick={retryInit}
            style={{
              padding: "10px 24px", borderRadius: 12, border: "1px solid rgba(251,191,36,0.40)",
              background: "rgba(251,191,36,0.10)", color: "#fbbf24", fontWeight: 700,
              fontSize: 13, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            🔄 Retry Connection
          </button>
        </div>
      ) : activeTasks.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "40px 18px", borderRadius: 22, marginTop: 4,
          background: "rgba(255,255,255,0.025)", border: "1px dashed rgba(255,255,255,0.10)",
        }}>
          <div style={{ fontSize: 38, marginBottom: 10, opacity: 0.5 }}>
            {tasks.length === 0 ? "📋" : "✅"}
          </div>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, margin: 0 }}>
            {tasks.length === 0 ? "No tasks available" : "All tasks completed!"}
          </p>
          <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 5 }}>
            {tasks.length === 0 ? "Check back soon for new rewards" : "You've completed all available tasks"}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {activeTasks.map((task) => {
            const isDone = completed.includes(task.id);
            const isExpiring = task.expiresAt && new Date(task.expiresAt).getTime() - Date.now() < 3600000;
            const isOpened = urlOpened.has(task.id);
            const showOpen = task.url && !isOpened && !isDone;

            return (
              <div key={task.id} className="slide-up" style={{
                position: "relative",
                padding: "12px 12px",
                borderRadius: 18,
                backdropFilter: "blur(18px)",
                WebkitBackdropFilter: "blur(18px)",
                border: isDone ? "1px solid rgba(16,185,129,0.28)" : "1px solid rgba(255,255,255,0.08)",
                background: isDone
                  ? "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(8,6,22,0.65))"
                  : "linear-gradient(135deg, rgba(20,16,42,0.65), rgba(8,6,22,0.78))",
                boxShadow: "0 4px 18px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.04)",
                opacity: isDone ? 0.78 : 1,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  {/* Task icon */}
                  <div style={{
                    width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, overflow: "hidden", position: "relative",
                    background: isDone
                      ? "rgba(16,185,129,0.12)"
                      : "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(56,189,248,0.10))",
                    border: isDone
                      ? "1.5px solid rgba(16,185,129,0.32)"
                      : "1.5px solid rgba(139,92,246,0.25)",
                    boxShadow: isDone
                      ? "0 0 12px rgba(16,185,129,0.18)"
                      : "0 0 12px rgba(139,92,246,0.15)",
                  }}>
                    {task.channelPhotoUrl ? (
                      <img src={task.channelPhotoUrl} alt={task.title}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (task.icon || "⭐")}
                  </div>

                  {/* Task info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}>
                      <span style={{
                        color: isDone ? "rgba(255,255,255,0.65)" : "#fff",
                        fontWeight: 700, fontSize: 13.5,
                        textDecoration: isDone ? "line-through" : "none",
                        textDecorationColor: "rgba(255,255,255,0.30)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        flex: 1, minWidth: 0,
                      }}>{task.title}</span>
                      {isExpiring && !isDone && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 3,
                          color: "#fb923c", fontSize: 9, flexShrink: 0, fontWeight: 700,
                          background: "rgba(249,115,22,0.14)", padding: "2px 7px", borderRadius: 999,
                          border: "1px solid rgba(249,115,22,0.28)",
                        }}>
                          <Clock size={9} /> Soon
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p style={{
                        color: "rgba(255,255,255,0.40)", fontSize: 11.5, fontWeight: 500,
                        margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {task.description}
                      </p>
                    )}
                    {!isDone && (
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 3, marginTop: 5,
                        background: "rgba(0,242,254,0.12)", border: "1px solid rgba(0,242,254,0.25)",
                        borderRadius: 999, padding: "2px 8px",
                      }}>
                        <Zap size={9} color="#00f2fe" fill="#00f2fe" />
                        <span style={{ color: "#00f2fe", fontSize: 10, fontWeight: 800, letterSpacing: 0.2 }}>
                          +5 Go
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action button */}
                  <div style={{ flexShrink: 0 }}>
                    {isDone ? (
                      <div style={{
                        width: 36, height: 36, borderRadius: 12,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(16,185,129,0.15)",
                        border: "1px solid rgba(16,185,129,0.30)",
                        boxShadow: "0 0 10px rgba(16,185,129,0.15)",
                      }}>
                        <CheckCircle size={19} color="#34d399" />
                      </div>
                    ) : (
                      <button
                        onClick={() => handleComplete(task)}
                        disabled={completing === task.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "9px 14px", borderRadius: 12, fontWeight: 800, fontSize: 12,
                          border: "none", cursor: "pointer", fontFamily: "inherit",
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
                        {showOpen
                          ? <><ExternalLink size={11} /> Open</>
                          : completing === task.id ? "..." : <><CheckCircle size={11} /> Verify</>}
                      </button>
                    )}
                  </div>
                </div>

                {message?.taskId === task.id && (
                  <div style={{
                    fontSize: 11, marginTop: 9, padding: "7px 10px", borderRadius: 10,
                    background: message.type === "success" ? "rgba(16,185,129,0.10)" : "rgba(248,113,113,0.10)",
                    color: message.type === "success" ? "#34d399" : "#fca5a5",
                    border: `1px solid ${message.type === "success" ? "rgba(16,185,129,0.22)" : "rgba(248,113,113,0.22)"}`,
                    display: "flex", alignItems: "center", gap: 5, fontWeight: 600,
                  }}>
                    {message.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>{/* ── end scrollable tasks content ── */}
    </div>
  );
}
