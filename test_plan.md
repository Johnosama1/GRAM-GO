1. **Import `AnimatedSticker` and Lottie `.json` files & Video `.webm` files** in corresponding pages:
   - `artifacts/app/src/pages/LeaderboardPage.tsx`
   - `artifacts/app/src/pages/GamesPage.tsx`
   - `artifacts/app/src/pages/ProfilePage.tsx`
2. **Update `LeaderboardPage.tsx`:**
   - Replace the `Trophy` icon on top of Leaderboard with `leaderboard_video.webm`.
   - In Top 3 users list, put `leaderboard_1.json`, `leaderboard_2.json`, `leaderboard_3.json` animated stickers above the avatar of #1, #2, #3 respectively.
3. **Update `GamesPage.tsx`:**
   - In Top Banner `GAMES`, replace `Gamepad2` icon with `games_video.webm`.
4. **Update `ProfilePage.tsx`:**
   - Next to Wallet Deposit text: Use `wallet_deposit.json` instead of icon.
   - Next to Wallet Withdraw text: Use `wallet_withdraw.json` instead of icon.
   - Next to Swap text: Use `wallet_swap.json` instead of icon.
   - Next to Support & Info text: Use `support_info.json` instead of icon.
   - Next to Submit a Complaint text: Use `support_complaint.json` instead of icon.
   - Next to FAQ text: Use `support_faq.json` instead of icon.
   - Next to Contact Support text: Use `support_contact.webm` instead of icon.
   - Next to Settings text: Use `settings.json` instead of icon.
   - Next to Wallet main text: Use `wallet.json` instead of icon.
5. Create Pre-commit step and submit.
