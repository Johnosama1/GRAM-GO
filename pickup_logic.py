with open('artifacts/app/src/components/games/SwordAdventureGame.tsx', 'r') as f:
    content = f.read()

# Replace auto pickup
pickup_code = '''        // Update Dropped Weapons
        for (let i = s.droppedWeapons.length - 1; i >= 0; i--) {
          const w = s.droppedWeapons[i];
          w.x -= s.gameSpeed; // scroll with ground
          w.timer -= 1;
          w.y += w.vy;
          if (w.y >= groundY - 20) {
            w.y = groundY - 20;
            w.vy = 0;
          } else {
            w.vy += 0.5;
          }

          // Player picks up weapon
          if (hero.x < w.x + 32 && hero.x + hero.width > w.x && hero.y < w.y + 32 && hero.y + hero.height > w.y) {
            hero.equippedWeaponId = w.weaponId;
            playSound("coin");
            s.droppedWeapons.splice(i, 1);
            continue;
          }

          if (w.timer <= 0 || w.x < -60) {
             // Game over if timer expires OR weapon is missed off-screen
             playSound("over");
             finishGameSession();
             return;
          }
        }'''

new_pickup_code = '''        // Update Dropped Weapons
        for (let i = s.droppedWeapons.length - 1; i >= 0; i--) {
          const w = s.droppedWeapons[i];
          w.x -= s.gameSpeed; // scroll with ground
          w.timer -= 1;
          w.y += w.vy;
          if (w.y >= groundY - 20) {
            w.y = groundY - 20;
            w.vy = 0;
          } else {
            w.vy += 0.5;
          }

          if (w.timer <= 0 || w.x < -60) {
             // Game over if timer expires OR weapon is missed off-screen
             playSound("over");
             finishGameSession();
             return;
          }
        }'''

content = content.replace(pickup_code, new_pickup_code)

with open('artifacts/app/src/components/games/SwordAdventureGame.tsx', 'w') as f:
    f.write(content)
