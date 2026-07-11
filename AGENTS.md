# Deployment Rules

- This app is hosted by running the long-lived Node server locally and exposing port 3000 through Cloudflare Tunnel.
- Do not use or recommend Render, Vercel, Cloudflare Pages, or another serverless host for this app.
- Production-style release flow: run `npm run build`, keep `npm run server` running, then run `npm run tunnel`.
- The current `trycloudflare.com` URL comes from the `cloudflared` process output and changes whenever the quick tunnel restarts. Verify the active URL before sharing it.
- Preserve `server/data.json`; it is the garden database and contains recorded audio.
- Restart the Node server after server-side changes. Client builds in `client/dist` are served directly and do not require a server restart.
