module.exports = {
  apps: [
    {
      name: "tabula-room",
      script: "dist/src/server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || "3002",
      },
    },
  ],
};
