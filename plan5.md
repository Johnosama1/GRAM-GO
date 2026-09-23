1. **Analyze `withdrawals.ts`:**
   - The user wants the original withdrawal message to be forwarded to `@GramGOwithdrawal` immediately when the withdrawal is created (i.e. `POST /` endpoint in `withdrawals.ts`).
   - The message should be sent to the user using the bot, then forwarded to `@GramGOwithdrawal`, and its resulting message ID stored in `withdrawalsTable`.

2. **Modify `withdrawals.ts` around line 377:**
   - Capture `sentMsg = await bot.sendMessage(...)`
   - Use `const targetChannel = process.env.WITHDRAWAL_PROOF_CHANNEL_ID || "@GramGOwithdrawal";`
   - Use `bot.forwardMessage(targetChannel, numUserId, sentMsg.message_id)`
   - Update `withdrawalsTable` with the new `channelMessageId: forwarded.message_id`.
   - Include strict error logging with `targetChannel`, `originalChatId`, `originalMessageId`, and `telegramError`.

3. **Check `withdrawalProcessor.ts`:**
   - Note: the user mentioned "Find the exact code path where a withdrawal request is created... Do NOT use copyMessage."
   - The user also said "If the current code does not have an original Telegram message_id, modify the flow so the original message is actually sent first, then forward that exact message." - This confirms my diagnosis! The original code in `withdrawals.ts` just sends the message without awaiting or storing its ID.

Wait, is there any problem using `@GramGOwithdrawal` directly? "target channel: @GramGOwithdrawal". Let me just use `@GramGOwithdrawal` explicitly to be sure, or better use the environment variable if available, else `@GramGOwithdrawal`. The prompt explicitly mentioned: `@GramGOwithdrawal`. So I'll hardcode `@GramGOwithdrawal` or let it fallback to it.

4. **Detailed Error Logging Requirement**:
   - `logger.error({ err: ..., targetChannel, originalChatId, originalMessageId }, "Telegram API error")`
   - Must not expose bot token or private credentials.
   - Keep the withdrawal request in the database (do not delete or crash).

Let's test this outline by making the changes and building.
