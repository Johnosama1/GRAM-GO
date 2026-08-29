import { useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "../lib/userContext";
import { useWinModalOpen } from "../lib/winModal";
import {
  Gift,
  ClipboardList,
  Puzzle,
  Users,
  User as UserIcon,
  Shield,
  X,
  Sparkles,
  CheckCircle2,
  Copy,
  ExternalLink,
  Flame,
  Award,
  Zap,
} from "lucide-react";

// Custom Pickaxe SVG Icon matching reference design
function PickaxeIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "#00f2fe" : "rgba(255,255,255,0.45)"}
      strokeWidth={active ? "2.2" : "1.8"}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        filter: active ? "drop-shadow(0 0 8px rgba(0,242,254,0.8))" : "none",
        transition: "all 0.2s ease",
      }}
    >
      <path d="m14 10-8.5 8.5a2.12 2.12 0 1 0 3 3L17 13" />
      <path d="m15 9 1.5-1.5a4 4 0 0 0 0-5.5L15 3.5 12 6.5" />
      <path d="M7 5a10 10 0 0 1 12 12" />
    </svg>
  );
}

export default function TabBar() {
  const [location, setLocation] = useLocation();
  const { user, isAdmin, refresh } = useUser();
  const winModalOpen = useWinModalOpen();

  const [activeModal, setActiveModal] = useState<"gift" | "combo" | "profile" | null>(null);
  const [giftClaimed, setGiftClaimed] = useState(false);
  const [comboSelected, setComboSelected] = useState<number[]>([]);
  const [comboClaimed, setComboClaimed] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  if (winModalOpen) return null;

  const isMine = location === "/" || location === "";
  const isTasks = location === "/tasks";
  const isFriends = location === "/referral";
  const isAdminPage = location === "/admin";

  const handleTabClick = (tabKey: string, path?: string) => {
    if (path) {
      setActiveModal(null);
      setLocation(path);
    } else if (tabKey === "gift" || tabKey === "combo" || tabKey === "profile") {
      setActiveModal(tabKey);
    }
  };

  const copyUserId = () => {
    if (!user) return;
    navigator.clipboard.writeText(String(user.id));
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <>
      {/* ── Bottom Navigation Bar ──────────────────────────────────────── */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)",
          paddingTop: 6,
          background: "rgba(4, 7, 20, 0.92)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          borderTop: "1px solid rgba(0, 242, 254, 0.12)",
          boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          paddingLeft: 4,
          paddingRight: 4,
          direction: "ltr",
        }}
      >
        {/* 1. Mine */}
        <button
          onClick={() => handleTabClick("mine", "/")}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            height: 50,
            background: "none",
            border: "none",
            cursor: "pointer",
            position: "relative",
          }}
        >
          <PickaxeIcon active={isMine && !activeModal} />
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              marginTop: 3,
              color: isMine && !activeModal ? "#00f2fe" : "rgba(255,255,255,0.45)",
              letterSpacing: 0.2,
            }}
          >
            Mine
          </span>
          {isMine && !activeModal && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                width: 24,
                height: 2.5,
                borderRadius: 999,
                background: "#00f2fe",
                boxShadow: "0 0 8px #00f2fe",
              }}
            />
          )}
        </button>

        {/* 2. Gift */}
        <button
          onClick={() => handleTabClick("gift")}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            height: 50,
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          <Gift
            size={20}
            color={activeModal === "gift" ? "#00f2fe" : "rgba(255,255,255,0.45)"}
            strokeWidth={activeModal === "gift" ? 2.4 : 1.8}
            style={{ filter: activeModal === "gift" ? "drop-shadow(0 0 8px rgba(0,242,254,0.8))" : "none" }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              marginTop: 3,
              color: activeModal === "gift" ? "#00f2fe" : "rgba(255,255,255,0.45)",
              letterSpacing: 0.2,
            }}
          >
            Gift
          </span>
        </button>

        {/* 3. Tasks */}
        <button
          onClick={() => handleTabClick("tasks", "/tasks")}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            height: 50,
            background: "none",
            border: "none",
            cursor: "pointer",
            position: "relative",
          }}
        >
          <div style={{ position: "relative" }}>
            <ClipboardList
              size={20}
              color={isTasks && !activeModal ? "#00f2fe" : "rgba(255,255,255,0.45)"}
              strokeWidth={isTasks && !activeModal ? 2.4 : 1.8}
              style={{ filter: isTasks && !activeModal ? "drop-shadow(0 0 8px rgba(0,242,254,0.8))" : "none" }}
            />
            {/* Notification Badge Dot */}
            <span
              style={{
                position: "absolute",
                top: -2,
                right: -3,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#f43f5e",
                boxShadow: "0 0 8px #f43f5e",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              marginTop: 3,
              color: isTasks && !activeModal ? "#00f2fe" : "rgba(255,255,255,0.45)",
              letterSpacing: 0.2,
            }}
          >
            Tasks
          </span>
        </button>

        {/* 4. Combo */}
        <button
          onClick={() => handleTabClick("combo")}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            height: 50,
            background: "none",
            border: "none",
            cursor: "pointer",
            position: "relative",
          }}
        >
          <div style={{ position: "relative" }}>
            <Puzzle
              size={20}
              color={activeModal === "combo" ? "#00f2fe" : "rgba(255,255,255,0.45)"}
              strokeWidth={activeModal === "combo" ? 2.4 : 1.8}
              style={{ filter: activeModal === "combo" ? "drop-shadow(0 0 8px rgba(0,242,254,0.8))" : "none" }}
            />
            {/* Notification Badge Dot */}
            <span
              style={{
                position: "absolute",
                top: -2,
                right: -3,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#f43f5e",
                boxShadow: "0 0 8px #f43f5e",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              marginTop: 3,
              color: activeModal === "combo" ? "#00f2fe" : "rgba(255,255,255,0.45)",
              letterSpacing: 0.2,
            }}
          >
            Combo
          </span>
        </button>

        {/* 5. Friends */}
        <button
          onClick={() => handleTabClick("friends", "/referral")}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            height: 50,
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          <Users
            size={20}
            color={isFriends && !activeModal ? "#00f2fe" : "rgba(255,255,255,0.45)"}
            strokeWidth={isFriends && !activeModal ? 2.4 : 1.8}
            style={{ filter: isFriends && !activeModal ? "drop-shadow(0 0 8px rgba(0,242,254,0.8))" : "none" }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              marginTop: 3,
              color: isFriends && !activeModal ? "#00f2fe" : "rgba(255,255,255,0.45)",
              letterSpacing: 0.2,
            }}
          >
            Friends
          </span>
        </button>

        {/* 6. Profile */}
        <button
          onClick={() => handleTabClick("profile")}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            height: 50,
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          <UserIcon
            size={20}
            color={activeModal === "profile" ? "#00f2fe" : "rgba(255,255,255,0.45)"}
            strokeWidth={activeModal === "profile" ? 2.4 : 1.8}
            style={{ filter: activeModal === "profile" ? "drop-shadow(0 0 8px rgba(0,242,254,0.8))" : "none" }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              marginTop: 3,
              color: activeModal === "profile" ? "#00f2fe" : "rgba(255,255,255,0.45)",
              letterSpacing: 0.2,
            }}
          >
            Profile
          </span>
        </button>

        {/* 7. Admin (Only for Admins) */}
        {isAdmin && (
          <button
            onClick={() => handleTabClick("admin", "/admin")}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              height: 50,
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Shield
              size={20}
              color={isAdminPage && !activeModal ? "#fbbf24" : "rgba(255,255,255,0.45)"}
              strokeWidth={isAdminPage && !activeModal ? 2.4 : 1.8}
              style={{ filter: isAdminPage && !activeModal ? "drop-shadow(0 0 8px rgba(251,191,36,0.8))" : "none" }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                marginTop: 3,
                color: isAdminPage && !activeModal ? "#fbbf24" : "rgba(255,255,255,0.45)",
                letterSpacing: 0.2,
              }}
            >
              Admin
            </span>
          </button>
        )}
      </div>

      {/* ── GIFT MODAL ─────────────────────────────────────────────────── */}
      {activeModal === "gift" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.80)",
            backdropFilter: "blur(12px)",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 340,
              background: "linear-gradient(165deg, #0d152c 0%, #060a18 100%)",
              border: "1px solid rgba(0,242,254,0.30)",
              borderRadius: 24,
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 30px rgba(0,242,254,0.15)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              position: "relative",
            }}
          >
            <button
              onClick={() => setActiveModal(null)}
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                background: "rgba(255,255,255,0.06)",
                border: "none",
                borderRadius: "50%",
                width: 30,
                height: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              <X size={16} />
            </button>

            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "linear-gradient(135deg, rgba(0,242,254,0.25), rgba(168,85,247,0.35))",
                border: "2px solid rgba(0,242,254,0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                boxShadow: "0 0 25px rgba(0,242,254,0.4)",
                marginBottom: 16,
              }}
            >
              🎁
            </div>

            <h3 style={{ color: "#ffffff", fontSize: 19, fontWeight: 900, margin: "0 0 6px" }}>Daily Gift Box</h3>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, margin: "0 0 20px", lineHeight: 1.5 }}>
              Claim your daily reward to boost your Rush Points & mining engine speed!
            </p>

            <div
              style={{
                width: "100%",
                background: "rgba(0,242,254,0.06)",
                border: "1px solid rgba(0,242,254,0.2)",
                borderRadius: 16,
                padding: "14px",
                marginBottom: 20,
                display: "flex",
                justifyContent: "space-around",
              }}
            >
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700 }}>REWARD</div>
                <div style={{ color: "#00f2fe", fontSize: 16, fontWeight: 900 }}>+15 Rush Points</div>
              </div>
              <div style={{ width: 1, background: "rgba(255,255,255,0.1)" }} />
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700 }}>DAILY STREAK</div>
                <div style={{ color: "#c084fc", fontSize: 16, fontWeight: 900 }}>Day 3 🔥</div>
              </div>
            </div>

            <button
              onClick={() => {
                setGiftClaimed(true);
                setTimeout(() => {
                  setGiftClaimed(false);
                  setActiveModal(null);
                  refresh();
                }, 1500);
              }}
              disabled={giftClaimed}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 16,
                border: "none",
                background: giftClaimed
                  ? "rgba(16,185,129,0.3)"
                  : "linear-gradient(90deg, #00c6ff 0%, #7f00ff 100%)",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 900,
                cursor: giftClaimed ? "default" : "pointer",
                boxShadow: giftClaimed ? "none" : "0 8px 24px rgba(0,242,254,0.4)",
              }}
            >
              {giftClaimed ? "✅ Claimed Successfully!" : "Claim Gift ⚡"}
            </button>
          </div>
        </div>
      )}

      {/* ── COMBO MODAL ────────────────────────────────────────────────── */}
      {activeModal === "combo" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.80)",
            backdropFilter: "blur(12px)",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 340,
              background: "linear-gradient(165deg, #0d152c 0%, #060a18 100%)",
              border: "1px solid rgba(168,85,247,0.30)",
              borderRadius: 24,
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 30px rgba(168,85,247,0.15)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              position: "relative",
            }}
          >
            <button
              onClick={() => setActiveModal(null)}
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                background: "rgba(255,255,255,0.06)",
                border: "none",
                borderRadius: "50%",
                width: 30,
                height: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              <X size={16} />
            </button>

            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "linear-gradient(135deg, rgba(168,85,247,0.35), rgba(0,242,254,0.25))",
                border: "2px solid rgba(168,85,247,0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                boxShadow: "0 0 25px rgba(168,85,247,0.4)",
                marginBottom: 16,
              }}
            >
              🧩
            </div>

            <h3 style={{ color: "#ffffff", fontSize: 19, fontWeight: 900, margin: "0 0 6px" }}>Daily Crypto Combo</h3>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, margin: "0 0 16px", lineHeight: 1.5 }}>
              Select the 3 correct power catalysts of the day to win +50 Rush Points!
            </p>

            {/* 4 Cards Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%", marginBottom: 18 }}>
              {[
                { id: 1, title: "Quantum Rig", icon: "⚡" },
                { id: 2, title: "Super Pulse", icon: "💎" },
                { id: 3, title: "Plasma Core", icon: "🔥" },
                { id: 4, title: "Zero Node", icon: "🚀" },
              ].map((c) => {
                const selected = comboSelected.includes(c.id);
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      if (comboSelected.includes(c.id)) {
                        setComboSelected(comboSelected.filter((i) => i !== c.id));
                      } else if (comboSelected.length < 3) {
                        setComboSelected([...comboSelected, c.id]);
                      }
                    }}
                    style={{
                      background: selected ? "rgba(168,85,247,0.25)" : "rgba(255,255,255,0.04)",
                      border: selected ? "1.5px solid #a855f7" : "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 16,
                      padding: "12px 10px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      boxShadow: selected ? "0 0 15px rgba(168,85,247,0.35)" : "none",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <span style={{ fontSize: 24 }}>{c.icon}</span>
                    <span style={{ color: selected ? "#fff" : "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 800 }}>
                      {c.title}
                    </span>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => {
                setComboClaimed(true);
                setTimeout(() => {
                  setComboClaimed(false);
                  setActiveModal(null);
                  refresh();
                }, 1500);
              }}
              disabled={comboSelected.length < 3 || comboClaimed}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 16,
                border: "none",
                background:
                  comboSelected.length < 3
                    ? "rgba(255,255,255,0.06)"
                    : comboClaimed
                    ? "rgba(16,185,129,0.3)"
                    : "linear-gradient(90deg, #7f00ff 0%, #00c6ff 100%)",
                color: comboSelected.length < 3 ? "rgba(255,255,255,0.3)" : "#ffffff",
                fontSize: 14,
                fontWeight: 900,
                cursor: comboSelected.length < 3 || comboClaimed ? "default" : "pointer",
                boxShadow: comboSelected.length === 3 && !comboClaimed ? "0 8px 24px rgba(168,85,247,0.4)" : "none",
              }}
            >
              {comboClaimed ? "🎉 +50 Rush Points Claimed!" : `Verify Combo (${comboSelected.length}/3)`}
            </button>
          </div>
        </div>
      )}

      {/* ── PROFILE MODAL ──────────────────────────────────────────────── */}
      {activeModal === "profile" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.80)",
            backdropFilter: "blur(12px)",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 340,
              background: "linear-gradient(165deg, #0d152c 0%, #060a18 100%)",
              border: "1px solid rgba(0,242,254,0.30)",
              borderRadius: 24,
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 30px rgba(0,242,254,0.15)",
              display: "flex",
              flexDirection: "column",
              position: "relative",
            }}
          >
            <button
              onClick={() => setActiveModal(null)}
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                background: "rgba(255,255,255,0.06)",
                border: "none",
                borderRadius: "50%",
                width: 30,
                height: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              <X size={16} />
            </button>

            {/* Profile Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              {user?.photoUrl ? (
                <img
                  src={user.photoUrl}
                  alt="avatar"
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "2px solid #00f2fe",
                    boxShadow: "0 0 16px rgba(0,242,254,0.4)",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #00f2fe, #7f00ff)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    color: "#fff",
                    fontSize: 22,
                    boxShadow: "0 0 16px rgba(0,242,254,0.4)",
                  }}
                >
                  {(user?.firstName || user?.username || "M")[0].toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#ffffff", fontSize: 17, fontWeight: 900 }}>
                    {user?.firstName || user?.username || "Miner"}
                  </span>
                  <span style={{ color: "#a855f7" }}>👑</span>
                </div>
                <div style={{ color: "#38bdf8", fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                  @{user?.username || "miner"}
                </div>
              </div>
            </div>

            {/* User Details Box */}
            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>User ID:</span>
                <button
                  onClick={copyUserId}
                  style={{
                    background: "none",
                    border: "none",
                    color: copiedId ? "#34d399" : "#00f2fe",
                    fontSize: 12,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    cursor: "pointer",
                  }}
                >
                  {user?.id} <Copy size={12} />
                </button>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>Daily Mining Rate:</span>
                <span style={{ color: "#34d399", fontSize: 12, fontWeight: 800 }}>3.0% / Day</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>Wallet:</span>
                <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "monospace" }}>
                  {user?.savedWalletAddress
                    ? `${user.savedWalletAddress.slice(0, 4)}...${user.savedWalletAddress.slice(-4)}`
                    : "Not Connected"}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => {
                  setActiveModal(null);
                  setLocation("/wallet");
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 14,
                  border: "1px solid rgba(0,242,254,0.4)",
                  background: "rgba(0,242,254,0.12)",
                  color: "#00f2fe",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Open Wallet
              </button>
              <a
                href="https://t.me/J_O_H_N8"
                target="_blank"
                rel="noreferrer"
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 14,
                  border: "1px solid rgba(168,85,247,0.4)",
                  background: "rgba(168,85,247,0.12)",
                  color: "#c084fc",
                  fontSize: 13,
                  fontWeight: 800,
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                Support <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
