When a user creates a withdrawal, the route `POST /` in `artifacts/api-server/src/routes/withdrawals.ts` handles it.
Around line 380, it sends a message to the user saying "طلب سحب قيد المراجعة".

But the user specifically said:
"The forwarded message MUST preserve the original Telegram entities/custom emojis because the withdrawal message uses Telegram Custom Emoji."
Wait, the message "⏳ طلب سحب قيد المراجعة..." in `withdrawals.ts` does NOT have Telegram Custom Emojis (it just uses regular emojis `⏳`, `💰`, `📍`).

Let's check `withdrawalProcessor.ts` where the `userMsg` is created:
```typescript
        `<tg-emoji emoji-id="6127223820764844602">✅</tg-emoji><b>GRAM GO Withdrawal Successful</b>\n\n` +
        `<tg-emoji emoji-id="5444856076954520455">🧾</tg-emoji><b>Receipt:</b> #${withdrawalId}\n\n` +
        ...
```
This DOES have custom emojis! So the user IS talking about the logic in `withdrawalProcessor.ts` which forwards the SUCCESSFUL withdrawal message! Wait! If `withdrawalProcessor.ts` executes a withdrawal, is that what they mean by "withdrawal request is created"?
"When a user creates a withdrawal request, the withdrawal request is created, but the withdrawal message is NOT being forwarded to our withdrawal channel."

Wait, could it be that `executeAutoWithdrawal` isn't called when a user *creates* a request?
Yes, `POST /` only creates a `pending` withdrawal request.
But maybe they want a custom emoji message sent *when it's created* and forwarded to the channel, instead of waiting for execution?
Let's reread carefully.

"When a user creates a withdrawal request, the withdrawal request is created, but the withdrawal message is NOT being forwarded to our withdrawal channel.
...
Required flow:
User creates withdrawal
        ↓
Create withdrawal request in database
        ↓
Create/send the original withdrawal message using the existing bot flow
        ↓
Get the original chat_id and message_id
        ↓
FORWARD that exact original message
        ↓
@GramGOwithdrawal
        ↓
Save the resulting channel message_id in the withdrawal record"

This exactly matches the logic flow they want for the CREATION step.
They want me to modify the CREATION flow (in `artifacts/api-server/src/routes/withdrawals.ts`). I need to send a message to the user using the existing bot flow, then get `message_id`, then `bot.forwardMessage("@GramGOwithdrawal", ORIGINAL_CHAT_ID, ORIGINAL_MESSAGE_ID)`.

Wait, but `withdrawals.ts` doesn't currently use custom emojis in its message? Let me look at the `withdrawals.ts` message again:
```typescript
      await bot.sendMessage(
        numUserId,
        `⏳ <b>طلب سحب قيد المراجعة</b>\n\n` +
          `💰 المبلغ: <b>${amt.toFixed(4)} Gram</b>\n` +
          `📍 المحفظة: <code>${esc(cleanAddress)}</code>\n\n` +
          `تم استلام طلب السحب بنجاح وسيتم معالجته قريباً.`,
        { parse_mode: "HTML" }
      );
```
Maybe the user added custom emojis in another file? No, I am looking at the code. Wait, maybe the user *means* that they want to use custom emoji, and `forwardMessage` preserves them.

Or wait! Is the user talking about the `userMsg` in `withdrawalProcessor.ts`?
If they wanted it in `withdrawalProcessor.ts`, they would say "When a withdrawal is executed". But they said "When a user creates a withdrawal request, the withdrawal request is created, but the withdrawal message is NOT being forwarded to our withdrawal channel."
Wait, if it's already in `withdrawalProcessor.ts`, why is it not forwarding?
In `withdrawalProcessor.ts`:
```typescript
      const proofChannelId = process.env.WITHDRAWAL_PROOF_CHANNEL_ID;
      if (proofChannelId) {
```
Maybe `WITHDRAWAL_PROOF_CHANNEL_ID` is not configured, or is set to something else, and the user specifically wants it forwarded to `@GramGOwithdrawal` hardcoded or via env?

Let's do EXACTLY what they asked for in the CREATION flow in `withdrawals.ts`, since they said:
"Find the exact code path where a withdrawal request is created."
"Trace the complete flow:
withdrawal creation
→ withdrawal message creation
→ message_id
→ forwardMessage
→ @GramGOwithdrawal"

Wait, I should update the message in `withdrawals.ts` to use custom emojis or just forward the message that is sent there?
Let's see the current `withdrawals.ts`:
```typescript
  try {
    const bot = getBot();
    if (bot) {
      const msg = await bot.sendMessage(
        numUserId,
        `⏳ <b>طلب سحب قيد المراجعة</b>\n\n` +
          `💰 المبلغ: <b>${amt.toFixed(4)} Gram</b>\n` +
          `📍 المحفظة: <code>${esc(cleanAddress)}</code>\n\n` +
          `تم استلام طلب السحب بنجاح وسيتم معالجته قريباً.`,
        { parse_mode: "HTML" }
      );

      const fwd = await bot.forwardMessage("@GramGOwithdrawal", numUserId, msg.message_id);

      await db.update(withdrawalsTable)
        .set({ channelMessageId: fwd.message_id })
        .where(eq(withdrawalsTable.id, wdRecord.id));
    }
  }
```
Wait, if I do that, the channel `@GramGOwithdrawal` will see "⏳ طلب سحب قيد المراجعة" instead of "GRAM GO Withdrawal Successful".
Is that what they want? "When a user creates a withdrawal request... the withdrawal message is NOT being forwarded to our withdrawal channel."
Yes, because currently there's only a forward in `withdrawalProcessor.ts` (execution), NOT in `withdrawals.ts` (creation).
And they specified:
"Find the exact code path where a withdrawal request is created."
And they explicitly said to save the `channel_message_id` in the database. `withdrawalsTable` already has `channelMessageId` (added in a previous migration, perhaps for this purpose or the execution purpose).

Let's modify `withdrawals.ts` as requested. I should also add error logging as requested:
"Also add detailed error logging around the forward operation, including:
- target channel
- original chat ID
- original message ID
- Telegram API error
- returned forwarded message ID
Do NOT expose bot token or private credentials in logs.
If forwarding fails:
- Do not silently ignore the error.
- Log the exact Telegram API error.
- Keep the withdrawal request in the database.
- Do not create duplicate withdrawal messages automatically unless the operation is safely retryable."

Wait, they also said:
"The forwarded message MUST preserve the original Telegram entities/custom emojis because the withdrawal message uses Telegram Custom Emoji."
Wait! If they say "the withdrawal message uses Telegram Custom Emoji", maybe they want me to add custom emojis to the pending withdrawal message?
Or perhaps there IS another file handling withdrawal creation?
Let's search for "withdrawal message" or "طلب سحب قيد المراجعة" in the whole project. Maybe they want me to copy the success message format but make it for pending? No, they said "preserve the original Telegram entities... because the withdrawal message uses Telegram Custom Emoji." I'll use the existing message in `withdrawals.ts` and maybe they'll modify it later. Wait, actually, let me double check if `withdrawals.ts` has another message.
