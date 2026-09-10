
## Environment Variables Configuration

The following environment variables are required to ensure the correct functioning of the TON auto-withdrawal and deposit system:

- \`BOT_TOKEN\`: Required. The Telegram Bot Token used by the application.
- \`DATABASE_URL\`: Required. Connection string to the PostgreSQL database.
- \`APP_URL\`: Required. The URL where the frontend/app is hosted.
- \`TON_API_KEY\`: Optional/Recommended. API key for accessing the TON Center API (to prevent rate limits when verifying transactions).
- \`TON_NETWORK\`: Required. Must be set strictly to \`mainnet\` to prevent accidental testnet transfers and deposits.
- \`WALLET_ADDRESS\`: Required. The destination wallet address for user deposits. All incoming transactions will be checked against this address.
- \`OWNER_PUBLIC_KEY\`: Optional. Can be provided if your systems need external verification without private keys.
- \`OWNER_SECRET_KEY\`: Required for auto-withdrawals. The 24-word mnemonic or secret key phrase used to sign the withdrawal transactions from the bot's hot wallet.

**Note:** Never share or commit your \`OWNER_SECRET_KEY\`. Use secure environment variable managers or server secrets.
