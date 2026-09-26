import re

with open('artifacts/app/src/components/games/SwordAdventureGame.tsx', 'r') as f:
    content = f.read()

# I need to add state for droppedWeapons to trigger re-renders,
# OR just handle click/touch directly on the canvas because we don't want to re-render React at 60fps just to track weapon position.
# Actually, an onClick handler on the canvas or an overlay wrapper can check all dropped weapons.

# Let's add an onClick/onTouchStart to the canvas itself to handle weapon tap.

canvas_code = '''      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
        onPointerDown={(e) => {
          if (gameState !== "playing") return;
          const rect = e.currentTarget.getBoundingClientRect();
          const relativeX = e.clientX - rect.left;
          const relativeY = e.clientY - rect.top;

          if (relativeX < rect.width * 0.5) {
            handleJump();
          } else {
            handleAttack();
          }
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
          }}
        />
      </div>'''

# We will modify `onPointerDown` to first check if we tapped on any dropped weapon.
# If we tap a dropped weapon, check distance. If close enough, equip it.
# Wait, canvas scaling makes relativeX different from game state X.
# But we can calculate it:
# x ratio = stateRef.current.width / rect.width.
# Wait, the stateRef.current.width IS the container width:
# const width = container?.clientWidth || window.innerWidth || 380;
# So relativeX is exactly game coordinate X!
# Let's verify. `e.clientX - rect.left` is in CSS pixels, which matches `stateRef.current.width`.

new_canvas_code = '''      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
        onPointerDown={(e) => {
          if (gameState !== "playing") return;
          const rect = e.currentTarget.getBoundingClientRect();
          const relativeX = e.clientX - rect.left;
          const relativeY = e.clientY - rect.top;

          // Check for dropped weapon tap
          let tappedWeapon = false;
          const s = stateRef.current;
          for (let i = 0; i < s.droppedWeapons.length; i++) {
            const w = s.droppedWeapons[i];
            // Weapon drawn at w.x, w.y with 32x32 size, plus a bit of padding for touch
            if (relativeX > w.x - 20 && relativeX < w.x + 52 && relativeY > w.y - 20 && relativeY < w.y + 52) {
               // Player must be close enough (e.g., within 100 pixels horizontally)
               if (Math.abs(s.hero.x - w.x) < 100) {
                  s.hero.equippedWeaponId = w.weaponId;
                  playSound("coin");
                  s.droppedWeapons.splice(i, 1);
               }
               tappedWeapon = true;
               break;
            }
          }

          if (!tappedWeapon && !joystickActive) {
            // Keep jump/attack functionality if they tapped somewhere else (optional fallback)
            // But we have joystick now, so maybe we don't need screen-half tapping.
            // Let's keep it for desktop if not on the joystick.
            if (relativeX > rect.width * 0.5) {
               // Only attack if tapping right side (left side is joystick)
               // handleAttack();
            }
          }
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
          }}
        />
      </div>'''

content = content.replace(canvas_code, new_canvas_code)

with open('artifacts/app/src/components/games/SwordAdventureGame.tsx', 'w') as f:
    f.write(content)
