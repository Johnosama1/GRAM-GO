1. **Define Feature Flag**:
   - In `GamesPage.tsx` and `games.ts`, use `const SWORD_ADVENTURE_ADMIN_ONLY = true;`.

2. **Frontend changes (`GamesPage.tsx`)**:
   - Destructure `isAdmin` from `useUser()`.
   - In the Sword Adventure card rendering logic, if `SWORD_ADVENTURE_ADMIN_ONLY && !isAdmin`:
     - Render "COMING SOON" instead of the "PLAY NOW" button with disabled styling.
     - Ensure the `onClick` event does not open the game.
     - Update the "PLAYABLE NOW" live indicator to show "COMING SOON" or hide it.
   - Wait, `GamesPage.tsx` uses `useUser()`, so we just `const { user, isAdmin } = useUser();`!

3. **Backend changes (`games.ts`)**:
   - Add `const SWORD_ADVENTURE_ADMIN_ONLY = true;` to `games.ts`.
   - Import `getAdminAuth` from `../lib/adminSecurity` (since `games.ts` doesn't currently import it).
   - In both `/sword-adventure/start` and `/sword-adventure/finish` endpoints:
     - Check if user is admin: `const { isAdmin } = await getAdminAuth(userId);`.
     - If `SWORD_ADVENTURE_ADMIN_ONLY && !isAdmin`:
       - Return `403 Forbidden` with a JSON payload indicating the game is temporarily unavailable.

4. **Verify Backend Import Path**:
   - `adminSecurity.ts` is in `artifacts/api-server/src/lib/adminSecurity.ts`.
   - `games.ts` is in `artifacts/api-server/src/routes/games.ts`.
   - The import would be `import { getAdminAuth } from "../lib/adminSecurity";`.

5. **Typecheck, Build, Commit, and Push**:
   - `pnpm typecheck`
   - `pnpm vercel-build`
   - Test locally if possible or review carefully.
   - Commit and push to `GRAM-GO/Johnosama1` main branch.
