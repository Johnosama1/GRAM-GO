import { useUser } from "../lib/userContext";

export default function TopBar() {
  const { user } = useUser();

  const goBalance = parseFloat(user?.goBalance || user?.balance || "0");
  const tonBalance = parseFloat(user?.tonBalance || "0");

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "calc(max(env(safe-area-inset-top, 0px), 12px) + 48px)",
        paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
        paddingLeft: 14,
        paddingRight: 14,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(3,6,18,0.75)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(0,242,254,0.08)",
        direction: "ltr",
      }}
    >
      {/* Left: Logo & Title */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Glowing Lightning Bolt Logo */}
        <div style={{ position: "relative", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: "drop-shadow(0 0 10px rgba(0, 242, 254, 0.75))" }}>
            <circle cx="18" cy="18" r="17" stroke="url(#logoGrad)" strokeWidth="1.8" strokeDasharray="3 3" opacity="0.6" />
            <circle cx="18" cy="18" r="15" fill="url(#logoBg)" stroke="url(#logoBorder)" strokeWidth="1.2" />
            <path
              d="M19.5 7L11 19.5H18L16.5 29L25 16.5H18L19.5 7Z"
              fill="url(#boltGrad)"
              stroke="#ffffff"
              strokeWidth="0.5"
              style={{ filter: "drop-shadow(0 0 6px #00f2fe)" }}
            />
            <defs>
              <linearGradient id="logoGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                <stop stopColor="#00f2fe" />
                <stop offset="0.5" stopColor="#3b82f6" />
                <stop offset="1" stopColor="#a855f7" />
              </linearGradient>
              <linearGradient id="logoBg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                <stop stopColor="#081028" />
                <stop offset="1" stopColor="#050816" />
              </linearGradient>
              <linearGradient id="logoBorder" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                <stop stopColor="#00f2fe" />
                <stop offset="1" stopColor="#a855f7" />
              </linearGradient>
              <linearGradient id="boltGrad" x1="11" y1="7" x2="25" y2="29" gradientUnits="userSpaceOnUse">
                <stop stopColor="#ffffff" />
                <stop offset="0.3" stopColor="#00f2fe" />
                <stop offset="1" stopColor="#c084fc" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* GRAMGO Logo Text & Tagline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
            <span style={{ color: "#ffffff", fontWeight: 900, fontSize: 20, letterSpacing: -0.3, fontStyle: "italic", fontFamily: "sans-serif" }}>
              GRAM
            </span>
            <span
              style={{
                fontSize: 20,
                fontWeight: 900,
                fontStyle: "italic",
                fontFamily: "sans-serif",
                background: "linear-gradient(135deg, #a855f7 0%, #c084fc 60%, #00f2fe 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 10px rgba(168, 85, 247, 0.45))",
              }}
            >
              GO
            </span>
          </div>
          <span
            style={{
              color: "rgba(0, 242, 254, 0.75)",
              fontSize: 8.5,
              fontWeight: 800,
              letterSpacing: 2,
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            MINE • EARN • GROW
          </span>
        </div>
      </div>

      {/* Right: Balances (TON/Diamonds & GO) */}
      {user && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* TON / Diamond Balance */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "rgba(8, 14, 32, 0.85)",
              border: "1px solid rgba(0, 242, 254, 0.25)",
              borderRadius: "10px",
              padding: "3px 7px",
              fontSize: "11px",
              fontWeight: 800,
              color: "#93c5fd",
            }}
          >
            <span style={{ fontSize: "12px" }}>💎</span>
            <span>{tonBalance.toFixed(3)}</span>
          </div>

          {/* GO Balance */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "rgba(8, 14, 32, 0.85)",
              border: "1px solid rgba(251, 191, 36, 0.35)",
              borderRadius: "10px",
              padding: "3px 7px",
              fontSize: "11px",
              fontWeight: 800,
              color: "#fbbf24",
            }}
          >
            <img src="/go.png" alt="GO" style={{ width: 13, height: 13, borderRadius: "50%" }} />
            <span>{goBalance.toFixed(3)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
