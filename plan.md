1. **Player Start and Movement:**
   - Modify `SwordAdventureGame.tsx` to stop automatic scrolling/running by default.
   - Add a virtual joystick component (left side) for mobile movement (`nipplejs` or a simple custom implementation).
   - Update `stateRef.current.hero` with `vx` for horizontal movement.
   - Update game loop so background and enemies only scroll when player moves.
   - Player controls character manually (walking/idle). Wait, the prompt says "Player must NOT move automatically" and "Player controls the character manually". Currently, the game uses a global scroll speed (`s.gameSpeed`). I will need to stop this global scroll and instead move the character based on joystick input, or scroll the background based on player's intended movement. To keep it simple, I can make the game fixed-screen or let the hero move horizontally. The prompt says "Add proper mobile movement controls similar in concept to PUBG Mobile. Use a virtual joystick on the left side for movement."

2. **Weapon held in the hand:**
   - Draw the equipped weapon image on the player's hand. Wait, it's currently drawn at `hx + 10, hy + 15` but static. The prompt says "The weapon must follow the character's hand/body position during idle, walking, running, attacking, jumping. Correct the weapon position, rotation, and scale so it looks naturally held."
   - I'll need to define frame-specific offsets/rotations for the weapon based on the hero's current animation frame (run/attack/idle).

3. **Enemy Weapon Drop & 5-Second Pickup Timer:**
   - When an enemy dies, it drops its weapon on the ground. This is mostly there, but we need to implement a 5-second timer.
   - The dropped weapon currently has `w.timer = 300` (5 seconds at 60fps). We need to display the countdown: `5`, `4`, `3`, `2`, `1` clearly.
   - The player currently auto-picks up weapons when running over them. Change this: player must tap the dropped weapon icon.
   - If player is too far away, weapon is not collected.
   - If 5 seconds expire, weapon disappears and turn/round ends (player loses).

4. **Mobile UI - PUBG-style controls:**
   - Left side: Large virtual joystick for movement.
   - Right side: Large circular ATTACK button. (JUMP is already there, maybe adjust layout).
   - Dropped weapon: A clear tappable weapon icon near the dropped weapon. Or just make the drawn weapon tappable? Wait, we can render a HTML button overlay for the dropped weapon, or track canvas clicks. Since canvas handles scaling, a canvas click or an overlay might work. An overlay positioned with `top/left` based on canvas projection is often easier to tap on mobile.

5. **Timeout / Player Loses:**
   - If weapon timer expires, game over ("Turn Ended", player loses).

6. **Verification & Commit:**
   - Typecheck, tests, build.
   - Push to GitHub.
