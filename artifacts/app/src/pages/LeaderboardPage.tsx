import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "../lib/userContext";
import { apiCall } from "../lib/api";
import { ChevronLeft, Trophy } from "lucide-react";

interface LeaderEntry {
  rank: number;
  id: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  referralCount: number;
}

interface LeaderboardData {
  top: LeaderEntry[];
  myRank: { rank: number; referralCount: number } | null;
}

function getDisplayName(entry: { firstName?: string | null; lastName?: string | null; username?: string | null }): string {
  const full = [entry.firstName, entry.lastName].filter(Boolean).join(" ");
  return full || entry.username || "User";
}

function getInitial(name: string): string {
  return (name.match(/[a-zA-Z0-9؀-ۿЀ-ӿ]/)?.[0] ?? Array.from(name)[0] ?? "?").toUpperCase();
}

const AVATAR_COLORS = [
  "linear-gradient(135deg, #00f2fe, #4facfe)",
  "linear-gradient(135deg, #a855f7, #6366f1)",
  "linear-gradient(135deg, #ec4899, #f43f5e)",
  "linear-gradient(135deg, #10b981, #059669)",
  "linear-gradient(135deg, #f59e0b, #d97706)",
  "linear-gradient(135deg, #3b82f6, #1d4ed8)",
  "linear-gradient(135deg, #8b5cf6, #7c3aed)",
  "linear-gradient(135deg, #06b6d4, #0891b2)",
];

export default function LeaderboardPage() {
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const url = user ? `/leaderboard?userId=${user.id}` : "/leaderboard";
    apiCall<LeaderboardData>(url)
      .then(setData)
      .catch(() => setError("Failed to load leaderboard"))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const top1 = data?.top?.[0] || null;
  const top2 = data?.top?.[1] || null;
  const top3 = data?.top?.[2] || null;
  const restLeaderboard = data?.top?.slice(3) || [];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        position: "relative",
        zIndex: 3,
        padding: "calc(max(env(safe-area-inset-top, 0px), 10px) + 12px) 14px calc(86px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 16 }}>
        <div
          onClick={() => setLocation("/referral")}
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <ChevronLeft size={24} color="#ffffff" />
        </div>
        <div>
          <h1
            style={{
              color: "#ffffff",
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "0.04em",
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Trophy size={20} color="#fbbf24" />
            LEADERBOARD
          </h1>
          <p
            style={{
              color: "rgba(255, 255, 255, 0.55)",
              fontSize: 11,
              fontWeight: 600,
              margin: "2px 0 0",
            }}
          >
            Rankings are based on referrals and rewards
          </p>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {loading && (
          <div style={{ padding: "40px", textAlign: "center" }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                border: "2.5px solid rgba(251, 191, 36, 0.7)",
                borderTopColor: "transparent",
                animation: "spin 0.75s linear infinite",
                margin: "0 auto",
              }}
            />
          </div>
        )}

        {error && (
          <div style={{ color: "#f87171", fontSize: 13, padding: "20px", textAlign: "center" }}>{error}</div>
        )}

        {!loading && !error && data?.top.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "rgba(255,255,255,0.40)", fontSize: 13 }}>
            🎯 Be the first on the leaderboard!
          </div>
        )}


        {/* TOP 3 PODIUM */}
        {!loading && !error && (top1 || top2 || top3) && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1.15fr 1fr",
              gap: 8,
              alignItems: "end",
              padding: "16px 0 8px",
            }}
          >
            {/* #2 2nd Place (Left) */}
            {top2 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  background: "linear-gradient(180deg, rgba(148, 163, 184, 0.15), rgba(8, 12, 30, 0.6))",
                  border: "1px solid rgba(148, 163, 184, 0.35)",
                  borderRadius: 16,
                  padding: "12px 6px 10px",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -10,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #e2e8f0, #94a3b8)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 900,
                    color: "#0f172a",
                    boxShadow: "0 0 10px rgba(148, 163, 184, 0.4)",
                  }}
                >
                  2
                </div>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #64748b, #475569)",
                    border: "2px solid #cbd5e1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    fontWeight: 900,
                    color: "#fff",
                    fontSize: 16,
                    marginTop: 4,
                  }}
                >
                  {top2.photoUrl ? (
                    <img src={top2.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    getInitial(getDisplayName(top2))
                  )}
                </div>
                <span style={{ color: "#fff", fontSize: 11, fontWeight: 800, marginTop: 6, maxWidth: 85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {getDisplayName(top2)}
                </span>
                <span style={{ color: "rgba(0, 242, 254, 0.8)", fontSize: 9.5, fontWeight: 700 }}>
                  {top2.referralCount} Friends
                </span>
                <span style={{ color: "#fbbf24", fontSize: 10.5, fontWeight: 900, marginTop: 2 }}>
                  +{top2.referralCount * 10} GO
                </span>
              </div>
            ) : <div />}

            {/* #1 1st Place (Center - Elevated) */}
            {top1 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  background: "linear-gradient(180deg, rgba(251, 191, 36, 0.22), rgba(8, 12, 30, 0.75))",
                  border: "1.5px solid rgba(251, 191, 36, 0.6)",
                  borderRadius: 18,
                  padding: "16px 8px 12px",
                  position: "relative",
                  boxShadow: "0 0 24px rgba(251, 191, 36, 0.25)",
                  transform: "translateY(-8px)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -14,
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #fde68a, #f59e0b)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    boxShadow: "0 0 14px rgba(251, 191, 36, 0.6)",
                  }}
                >
                  👑
                </div>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #d97706, #b45309)",
                    border: "2.5px solid #fbbf24",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    fontWeight: 900,
                    color: "#fff",
                    fontSize: 18,
                    marginTop: 4,
                    boxShadow: "0 0 16px rgba(251, 191, 36, 0.4)",
                  }}
                >
                  {top1.photoUrl ? (
                    <img src={top1.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    getInitial(getDisplayName(top1))
                  )}
                </div>
                <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 900, marginTop: 6, maxWidth: 95, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {getDisplayName(top1)}
                </span>
                <span style={{ color: "rgba(255, 255, 255, 0.75)", fontSize: 10, fontWeight: 700 }}>
                  {top1.referralCount} Friends
                </span>
                <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 900, marginTop: 2, textShadow: "0 0 8px rgba(251, 191, 36, 0.4)" }}>
                  +{top1.referralCount * 10} GO
                </span>
              </div>
            ) : <div />}

            {/* #3 3rd Place (Right) */}
            {top3 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  background: "linear-gradient(180deg, rgba(217, 119, 6, 0.15), rgba(8, 12, 30, 0.6))",
                  border: "1px solid rgba(217, 119, 6, 0.35)",
                  borderRadius: 16,
                  padding: "12px 6px 10px",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -10,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #f59e0b, #b45309)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 900,
                    color: "#fff",
                    boxShadow: "0 0 10px rgba(217, 119, 6, 0.4)",
                  }}
                >
                  3
                </div>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #9a3412, #7c2d12)",
                    border: "2px solid #ea580c",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    fontWeight: 900,
                    color: "#fff",
                    fontSize: 16,
                    marginTop: 4,
                  }}
                >
                  {top3.photoUrl ? (
                    <img src={top3.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    getInitial(getDisplayName(top3))
                  )}
                </div>
                <span style={{ color: "#fff", fontSize: 11, fontWeight: 800, marginTop: 6, maxWidth: 85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {getDisplayName(top3)}
                </span>
                <span style={{ color: "rgba(0, 242, 254, 0.8)", fontSize: 9.5, fontWeight: 700 }}>
                  {top3.referralCount} Friends
                </span>
                <span style={{ color: "#fbbf24", fontSize: 10.5, fontWeight: 900, marginTop: 2 }}>
                  +{top3.referralCount * 10} GO
                </span>
              </div>
            ) : <div />}
          </div>
        )}

        {/* RANKED LIST (#4 AND BEYOND) */}
        {!loading && !error && restLeaderboard.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {restLeaderboard.map((entry, idx) => {
              const isMe = entry.id === user?.id;
              const avatarBg = AVATAR_COLORS[idx % AVATAR_COLORS.length];

              return (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 16,
                    background: isMe ? "rgba(0, 242, 254, 0.1)" : "rgba(255, 255, 255, 0.03)",
                    border: isMe ? "1px solid rgba(0, 242, 254, 0.4)" : "1px solid rgba(255, 255, 255, 0.05)",
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      color: isMe ? "#00f2fe" : "rgba(255, 255, 255, 0.45)",
                      fontSize: 14,
                      fontWeight: 900,
                      textAlign: "center",
                    }}
                  >
                    #{entry.rank}
                  </span>

                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: avatarBg,
                      border: isMe ? "1.5px solid #00f2fe" : "1px solid rgba(255, 255, 255, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      fontWeight: 800,
                      color: "#fff",
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    {entry.photoUrl ? (
                      <img src={entry.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      getInitial(getDisplayName(entry))
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        color: isMe ? "#00f2fe" : "#ffffff",
                        fontSize: 14,
                        fontWeight: isMe ? 800 : 600,
                        margin: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {getDisplayName(entry)}
                      {isMe ? " (You)" : ""}
                    </p>
                    {entry.username && (
                      <p style={{ color: "rgba(255, 255, 255, 0.35)", fontSize: 11, margin: 0 }}>
                        @{entry.username}
                      </p>
                    )}
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>
                      {entry.referralCount} <span style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 11 }}>Friends</span>
                    </div>
                    <div style={{ color: "#fbbf24", fontSize: 12, fontWeight: 900, marginTop: 2 }}>
                      +{entry.referralCount * 10} GO
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CURRENT USER RANK IF NOT IN TOP BEYOND AND NOT ALREADY SHOWN */}
        {!loading && data?.myRank && user && !data.top.find(e => e.id === user.id) && (
          <div
            style={{
              marginTop: 8,
              padding: "14px",
              borderRadius: 16,
              background: "linear-gradient(135deg, rgba(0, 242, 254, 0.12), rgba(168, 85, 247, 0.12))",
              border: "1px solid rgba(0, 242, 254, 0.4)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 0 16px rgba(0, 242, 254, 0.18)",
            }}
          >
            <span
              style={{
                width: 28,
                color: "#00f2fe",
                fontSize: 14,
                fontWeight: 900,
                textAlign: "center",
              }}
            >
              #{data.myRank.rank}
            </span>

            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #a855f7, #6366f1)",
                border: "2px solid #00f2fe",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: 14,
                color: "#fff",
              }}
            >
              {(user.firstName?.[0] || user.username?.[0] || "?").toUpperCase()}
            </div>

            <p style={{ flex: 1, color: "#00f2fe", fontWeight: 800, fontSize: 14, margin: 0 }}>You</p>

            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>
                {data.myRank.referralCount} <span style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 11 }}>Friends</span>
              </div>
              <div style={{ color: "#fbbf24", fontSize: 12, fontWeight: 900, marginTop: 2 }}>
                +{data.myRank.referralCount * 10} GO
              </div>
            </div>
          </div>
        )}

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
