/**
 * pm2 process manifest for self-hosted deployment (docs/DEPLOY.md Step 2).
 * Two processes:
 *  - owldesk-web:    Next.js production server, bound to loopback only
 *                    (public ingress is Nginx/Cloudflare, see DEPLOY.md Step 3)
 *  - owldesk-patrol: 15-min patrol driver + scheduled brief generation
 *                    (same script proven in the local overnight run)
 */
module.exports = {
  apps: [
    {
      name: "owldesk-web",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      // 3119: agreed host port (3000/3001 etc. are taken by other services);
      // loopback-only — public ingress is Nginx 443 (docs/DEPLOY.md Step 3)
      args: "start -H 127.0.0.1 -p 3119",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: { NODE_ENV: "production" },
      out_file: "logs/web.out.log",
      error_file: "logs/web.err.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "owldesk-patrol",
      cwd: __dirname,
      script: "scripts/overnight-patrol.mjs",
      // plain node process — load .env explicitly so CRON_SECRET is available
      node_args: "--env-file=.env",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      env: { OWLDESK_BASE_URL: "http://127.0.0.1:3119" },
      out_file: "logs/patrol.out.log",
      error_file: "logs/patrol.err.log",
      merge_logs: true,
      time: true,
    },
  ],
};
