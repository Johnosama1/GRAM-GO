with open('artifacts/app/src/components/games/SwordAdventureGame.tsx', 'r') as f:
    content = f.read()

# I will add a simple touch-based virtual joystick overlay at the bottom left.
# Wait, let's insert it inside the mobile touch controls overlay.
# The controls overlay looks like this:
'''      {/* ── Mobile Touch Controls Overlay ──────────────────────────────── */}
      {gameState === "playing" && (
        <div
          style={{
            position: "absolute",
            bottom: "max(env(safe-area-inset-bottom, 0px), 20px)",
            left: 20,
            right: 20,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pointerEvents: "auto",
          }}
        >
          {/* JUMP Touch Button */}'''

new_controls = '''      {/* ── Mobile Touch Controls Overlay ──────────────────────────────── */}
      {gameState === "playing" && (
        <div
          style={{
            position: "absolute",
            bottom: "max(env(safe-area-inset-bottom, 0px), 20px)",
            left: 20,
            right: 20,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pointerEvents: "none",
          }}
        >
          {/* Virtual Joystick for Movement */}
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: "50%",
              background: "rgba(0, 242, 254, 0.15)",
              border: "2px solid rgba(0, 242, 254, 0.3)",
              position: "relative",
              pointerEvents: "auto",
              touchAction: "none",
            }}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              setJoystickActive(true);
              setJoystickOrigin({ x: centerX, y: centerY });

              const dx = touch.clientX - centerX;
              if (dx < -10) {
                stateRef.current.hero.vx = -4;
                stateRef.current.hero.facingRight = false;
              } else if (dx > 10) {
                stateRef.current.hero.vx = 4;
                stateRef.current.hero.facingRight = true;
              } else {
                stateRef.current.hero.vx = 0;
              }
            }}
            onTouchMove={(e) => {
              if (!joystickActive) return;
              const touch = e.touches[0];
              const dx = touch.clientX - joystickOrigin.x;

              if (dx < -10) {
                stateRef.current.hero.vx = -4;
                stateRef.current.hero.facingRight = false;
              } else if (dx > 10) {
                stateRef.current.hero.vx = 4;
                stateRef.current.hero.facingRight = true;
              } else {
                stateRef.current.hero.vx = 0;
              }
            }}
            onTouchEnd={() => {
              setJoystickActive(false);
              stateRef.current.hero.vx = 0;
            }}
          >
            {/* Inner knob */}
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "rgba(0, 242, 254, 0.8)",
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                boxShadow: "0 0 10px rgba(0, 242, 254, 0.5)",
              }}
            />
          </div>

          {/* Action Buttons Container */}
          <div style={{ display: "flex", gap: 16, pointerEvents: "auto" }}>
            {/* JUMP Touch Button */}'''

content = content.replace(
    '''      {/* ── Mobile Touch Controls Overlay ──────────────────────────────── */}
      {gameState === "playing" && (
        <div
          style={{
            position: "absolute",
            bottom: "max(env(safe-area-inset-bottom, 0px), 20px)",
            left: 20,
            right: 20,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pointerEvents: "auto",
          }}
        >
          {/* JUMP Touch Button */}''',
    new_controls
)

# And then we need to close the action buttons container.
# Currently it ends with:
'''            <span style={{ fontSize: 11, fontWeight: 900, marginTop: 2, color: "#c084fc", letterSpacing: 0.5 }}>
              ATTACK
            </span>
          </button>
        </div>
      )}'''

content = content.replace(
    '''            <span style={{ fontSize: 11, fontWeight: 900, marginTop: 2, color: "#c084fc", letterSpacing: 0.5 }}>
              ATTACK
            </span>
          </button>
        </div>
      )}''',
    '''            <span style={{ fontSize: 11, fontWeight: 900, marginTop: 2, color: "#c084fc", letterSpacing: 0.5 }}>
              ATTACK
            </span>
          </button>
          </div>
        </div>
      )}'''
)

with open('artifacts/app/src/components/games/SwordAdventureGame.tsx', 'w') as f:
    f.write(content)
