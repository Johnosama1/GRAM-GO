import { useLocation } from "wouter";
import { useUser } from "../lib/userContext";
import { useLanguage } from "../lib/i18nContext";
import { useWinModalOpen } from "../lib/winModal";
import {
  ClipboardList,
  Gamepad2,
  Users,
  User as UserIcon,
  Shield,
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
  const { isAdmin, canClaimCheckin } = useUser();
  const { t } = useLanguage();
  const winModalOpen = useWinModalOpen();

  if (winModalOpen) return null;

  const isMine = location === "/" || location === "";
  const isGames = location === "/games" || location === "/combo";
  const isTasks = location === "/tasks";
  const isFriends = location === "/referral";
  const isProfile = location === "/profile" || location.startsWith("/profile") || location === "/wallet";
  const isAdminPage = location === "/admin";

  const handleTabClick = (path: string) => {
    setLocation(path);
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)",
        paddingTop: 6,
        background: "rgba(4, 7, 20, 0.94)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderTop: "1px solid rgba(0, 242, 254, 0.14)",
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
        onClick={() => handleTabClick("/")}
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
        <PickaxeIcon active={isMine} />
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            marginTop: 3,
            color: isMine ? "#00f2fe" : "rgba(255,255,255,0.45)",
            letterSpacing: 0.2,
          }}
        >
          {t.navMine}
        </span>
        {isMine && (
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

      {/* 2. Tasks */}
      <button
        onClick={() => handleTabClick("/tasks")}
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
            color={isTasks ? "#00f2fe" : "rgba(255,255,255,0.45)"}
            strokeWidth={isTasks ? 2.4 : 1.8}
            style={{ filter: isTasks ? "drop-shadow(0 0 8px rgba(0,242,254,0.8))" : "none" }}
          />
          {/* Notification Badge Dot for daily check-in */}
          {canClaimCheckin && (
            <span
              style={{
                position: "absolute",
                top: -2,
                right: -3,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#00f2fe",
                boxShadow: "0 0 8px #00f2fe",
              }}
            />
          )}
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            marginTop: 3,
            color: isTasks ? "#00f2fe" : "rgba(255,255,255,0.45)",
            letterSpacing: 0.2,
          }}
        >
          {t.navTasks}
        </span>
        {isTasks && (
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

      {/* 3. Games */}
      <button
        onClick={() => handleTabClick("/games")}
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
          <Gamepad2
            size={21}
            color={isGames ? "#00f2fe" : "rgba(255,255,255,0.45)"}
            strokeWidth={isGames ? 2.4 : 1.8}
            style={{ filter: isGames ? "drop-shadow(0 0 8px rgba(0,242,254,0.8))" : "none" }}
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
              background: "#00f2fe",
              boxShadow: "0 0 8px #00f2fe",
            }}
          />
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            marginTop: 3,
            color: isGames ? "#00f2fe" : "rgba(255,255,255,0.45)",
            letterSpacing: 0.2,
          }}
        >
          {t.navGames || "Games"}
        </span>
        {isGames && (
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

      {/* 4. Friends */}
      <button
        onClick={() => handleTabClick("/referral")}
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
        <Users
          size={20}
          color={isFriends ? "#00f2fe" : "rgba(255,255,255,0.45)"}
          strokeWidth={isFriends ? 2.4 : 1.8}
          style={{ filter: isFriends ? "drop-shadow(0 0 8px rgba(0,242,254,0.8))" : "none" }}
        />
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            marginTop: 3,
            color: isFriends ? "#00f2fe" : "rgba(255,255,255,0.45)",
            letterSpacing: 0.2,
          }}
        >
          {t.navFriends}
        </span>
        {isFriends && (
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

      {/* 5. Profile (Replaces Wallet) */}
      <button
        onClick={() => handleTabClick("/profile")}
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
        <UserIcon
          size={20}
          color={isProfile ? "#00f2fe" : "rgba(255,255,255,0.45)"}
          strokeWidth={isProfile ? 2.4 : 1.8}
          style={{ filter: isProfile ? "drop-shadow(0 0 8px rgba(0,242,254,0.8))" : "none" }}
        />
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            marginTop: 3,
            color: isProfile ? "#00f2fe" : "rgba(255,255,255,0.45)",
            letterSpacing: 0.2,
          }}
        >
          {t.navProfile}
        </span>
        {isProfile && (
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

      {/* 6. Admin (Only for Admins) */}
      {isAdmin && (
        <button
          onClick={() => handleTabClick("/admin")}
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
            color={isAdminPage ? "#fbbf24" : "rgba(255,255,255,0.45)"}
            strokeWidth={isAdminPage ? 2.4 : 1.8}
            style={{ filter: isAdminPage ? "drop-shadow(0 0 8px rgba(251,191,36,0.8))" : "none" }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              marginTop: 3,
              color: isAdminPage ? "#fbbf24" : "rgba(255,255,255,0.45)",
              letterSpacing: 0.2,
            }}
          >
            {t.navAdmin}
          </span>
        </button>
      )}
    </div>
  );
}
