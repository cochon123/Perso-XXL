// Copy to env.js (gitignored) or set on the server as config/env.js for production.
window.PersoEnv = {
  OPENROUTER_API_KEY: "",
  // Omit model to use the extension default from ai-client.js
  OPENROUTER_REASONING_ENABLED: false,
  LOG_ENDPOINT: "http://localhost:8787/log",
  FEEDBACK_ENDPOINT: "http://localhost:8787/feedback",
  DEV_LOGS: false,
};
