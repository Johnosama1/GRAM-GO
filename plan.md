1. **Analyze the Issue**:
   - The user requested that when a withdrawal is created, a message is sent to them, and then *that exact message* is forwarded to the `@GramGOwithdrawal` channel, preserving original formatting and entities using `bot.forwardMessage`.
   - In `artifacts/api-server/src/routes/withdrawals.ts`, when the withdrawal is created, a message is currently sent using `bot.sendMessage(numUserId, ...)`, but the message ID is NOT saved, and the message is NOT forwarded to the proof channel at this stage. It just returns success to the API.
   - The actual withdrawal proof is posted later when the withdrawal is *executed* in `artifacts/api-server/src/lib/withdrawalProcessor.ts`. This sends a success message to the user (`userMsg`), and then forwards that message to the proof channel.
   - However, the user is saying "When a user creates a withdrawal request, the withdrawal request is created, but the withdrawal message is NOT being forwarded to our withdrawal channel." So they want the withdrawal *creation* message, or the original message to be forwarded when the withdrawal request is created. Or wait, maybe they want the original message containing withdrawal details from the user's chat to be forwarded to the proof channel when the withdrawal is created?

   Let's reread the prompt carefully:
   "When a user creates a withdrawal request, the withdrawal request is created, but the withdrawal message is NOT being forwarded to our withdrawal channel."
   "Required flow: User creates withdrawal -> Create withdrawal request in database -> Create/send the original withdrawal message using the existing bot flow -> Get the original chat_id and message_id -> FORWARD that exact original message -> @GramGOwithdrawal -> Save the resulting channel message_id in the withdrawal record"
   "The forwarded message MUST preserve the original Telegram entities/custom emojis because the withdrawal message uses Telegram Custom Emoji."

   Wait, currently the code in `withdrawalProcessor.ts` (which runs when the withdrawal is APPROVED on-chain) does:
   ```typescript
      let userMsgId: number | undefined;
      // Notify user with the exact same style as deposit message
      try {
        const sent = await bot.sendMessage(userId, userMsg, {
          parse_mode: "HTML",
          reply_markup: explorerReplyMarkup,
          disable_web_page_preview: true,
        });
        userMsgId = sent.message_id;
      } catch {
        /* ignore */
      }

      const proofChannelId = process.env.WITHDRAWAL_PROOF_CHANNEL_ID;
      // ...
      const forwarded = await bot.forwardMessage(proofChannelId, userId, userMsgId);
   ```
   But wait, the user says "When a user creates a withdrawal request, the withdrawal request is created, but the withdrawal message is NOT being forwarded to our withdrawal channel."
   Actually, the code in `withdrawalProcessor.ts` *is* trying to do this upon withdrawal execution (not creation). But the user says "When a user creates a withdrawal request". Wait, maybe the user means upon execution? Or upon creation?
   "When a user creates a withdrawal request, the withdrawal request is created, but the withdrawal message is NOT being forwarded to our withdrawal channel."
   Let me see what `withdrawalProcessor.ts` actually does. It posts to `process.env.WITHDRAWAL_PROOF_CHANNEL_ID`. But wait, the user specifies `@GramGOwithdrawal`. Is `WITHDRAWAL_PROOF_CHANNEL_ID` set to `@GramGOwithdrawal` in their environment? Probably.

   Let's trace:
   The withdrawal *creation* is in `src/routes/withdrawals.ts`. There, a message is sent to the user:
   ```typescript
        const sent = await bot.sendMessage(
          numUserId,
          `⏳ <b>طلب سحب قيد المراجعة</b>\n\n` + ...
   ```
   And it doesn't forward it.

   Wait, does the user want the *pending* message forwarded? Or the *success* message forwarded?
   Usually, proof channels are for *successful* withdrawals. In `withdrawalProcessor.ts`, it builds `userMsg` (success) and forwards it. But wait... Telegram bot API `forwardMessage` has a limitation: bots can only forward messages they can see. A bot *can* forward messages it sent to a user. But if the bot forwards a message to a channel, it will show as "Forwarded from [Bot Name]".
   Wait! `forwardMessage(chat_id="@GramGOwithdrawal", from_chat_id=ORIGINAL_CHAT_ID, message_id=ORIGINAL_MESSAGE_ID)`.
   If it's already doing this in `withdrawalProcessor.ts`, maybe it was failing? Let's check `withdrawalProcessor.ts` again.

   Ah, in `withdrawalProcessor.ts`, if `forwardMessage` is called, it might fail if the user blocked the bot, but if it successfully sent the message to the user, it forwards it.
   Wait, the user says:
   "Find the exact code path where a withdrawal request is created."
   "Trace the complete flow: withdrawal creation -> withdrawal message creation -> message_id -> forwardMessage -> @GramGOwithdrawal"
   This implies the user wants this to happen during *withdrawal creation* in `withdrawals.ts`!
   Wait, if it happens during withdrawal creation, they want the channel to see pending withdrawal requests?
   Let's look at the database schema. `withdrawalsTable` has `channelMessageId` (integer). This is currently updated in `withdrawalProcessor.ts`.

   Let me carefully examine `withdrawalProcessor.ts` and `withdrawals.ts`.
