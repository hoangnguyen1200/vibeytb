module.exports = {
  apps: [
    {
      name: "youtube-orchestrator-cron",
      script: "npx",
      args: "tsx src/scripts/the-orchestrator.ts --cron",
      instances: 1,
      autorestart: false,
      cron_restart: "0 */6 * * *", // Chạy mỗi 6 tiếng một lần định kỳ (00:00, 06:00, 12:00, 18:00)
      watch: false,
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "logs/cron-error.log",
      out_file: "logs/cron-out.log",
      env: {
        NODE_ENV: "production",
      }
    },
    {
      name: "youtube-worker-render",
      script: "npx",
      args: "tsx src/scripts/the-orchestrator.ts --worker",
      instances: 1,
      autorestart: true,
      restart_delay: 60000, // Đợi 1 phút trước khi khởi động lại tránh nghẽn CPU nếu không có job (Polling)
      watch: false,
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "logs/worker-error.log",
      out_file: "logs/worker-out.log",
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
