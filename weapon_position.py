with open('artifacts/app/src/components/games/SwordAdventureGame.tsx', 'r') as f:
    content = f.read()

# I will find the "// Draw Equipped Weapon will be handled later" and replace it with proper positioning based on frameIndex.
# We have 6 run frames. The weapon must be translated based on these frames to look like it's in the hand.
# Frame 0-5 for running/idle.
# Wait, for idle, hero.frameIndex = 0.
# The sprite size is 86x64, drawn at hx - 14, hy + hero.height - 64.
# Let's map out some general offsets for run frames.
# I'll create an array of offsets.

new_weapon_draw = '''      // Draw Equipped Weapon
      const wImg = weaponImagesRef.current[hero.equippedWeaponId];
      if (wImg && wImg.complete && wImg.naturalWidth > 0) {
          ctx.save();
          // The hero origin for drawing is hx, hy. The hand position changes per frame.
          // These offsets are approximate for the adventurer sprite's hand holding a weapon.
          let handX = hx + 30;
          let handY = hy + 25;
          let rotation = 0;

          if (hero.isGrounded) {
             if (hero.vx === 0) {
                // Idle
                handX = hx + 32;
                handY = hy + 28;
                rotation = Math.PI / 8; // Slight angle
             } else {
                // Running (6 frames)
                const runOffsets = [
                   {x: 32, y: 28, r: 0.2},
                   {x: 34, y: 26, r: 0.3},
                   {x: 30, y: 24, r: 0.1},
                   {x: 28, y: 26, r: 0.0},
                   {x: 30, y: 28, r: 0.1},
                   {x: 32, y: 30, r: 0.2},
                ];
                const o = runOffsets[hero.frameIndex % 6];
                handX = hx + o.x;
                handY = hy + o.y;
                rotation = o.r;
             }
          } else {
             // Jumping
             if (hero.vy < 0) {
                handX = hx + 30;
                handY = hy + 15;
                rotation = -Math.PI / 6;
             } else {
                handX = hx + 34;
                handY = hy + 10;
                rotation = -Math.PI / 4;
             }
          }

          ctx.translate(handX, handY);
          ctx.rotate(rotation);

          ctx.imageSmoothingEnabled = false;
          // Draw the weapon centered at its handle (assuming handle is bottom-left or center-left)
          // We draw the weapon offset so its handle is at 0,0
          ctx.drawImage(wImg, -10, -20, 32, 32);
          ctx.imageSmoothingEnabled = true;

          ctx.restore();
      }

      ctx.restore(); // for facingRight flip

      ctx.restore(); // for initial save'''

content = content.replace(
    '''      // Draw Equipped Weapon will be handled later
      const wImg = weaponImagesRef.current[hero.equippedWeaponId];
      if (wImg && wImg.complete && wImg.naturalWidth > 0) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(wImg, hx + 10, hy + 15, 32, 32);
          ctx.imageSmoothingEnabled = true;
      }

      ctx.restore(); // for facingRight flip

      ctx.restore(); // for initial save''',
    new_weapon_draw
)

with open('artifacts/app/src/components/games/SwordAdventureGame.tsx', 'w') as f:
    f.write(content)
