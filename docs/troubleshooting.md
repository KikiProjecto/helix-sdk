# Troubleshooting

## Common Issues

### "Pool exhausted" Error

All RPC endpoints are unavailable.

**Solution:**
1. Verify endpoints are accessible: `helix-diag check <url>`
2. Check RPC provider status pages
3. Add more backup endpoints

### Transaction Timeout

Transaction took longer than configured timeout to confirm.

**Solution:**
1. Increase confirmationTimeout: `createHelixClient({ confirmationTimeout: 90_000 })`
2. Check network congestion
3. Increase priority fees

### Low Transaction Success Rate

Transactions frequently drop or fail.

**Solution:**
1. Enable dynamic fees: `fees: { mode: 'dynamic' }`
2. Route through Jito: `jito: { enabled: true }`
3. Monitor pool health with dashboard

### Persistent "Blockhash not found" Error

Blockhash is expiring before transaction is sent.

**Solution:**
1. Fetch blockhash just before signing
2. Reduce time between build and send
3. Increase blockhash TTL in BlockhashCache

---

For more help, open an issue at:
https://github.com/KikiProjecto/helix-sdk/issues
