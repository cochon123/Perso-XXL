(() => {
  const STYLE = `
#pxxl-personalize-btn,
#pxxl-webmcp-banner { box-sizing: border-box; }

#pxxl-personalize-btn {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(16, 16, 20, 0.78);
  color: #f4f1ea;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  box-shadow:
    0 18px 50px rgba(0, 0, 0, 0.38),
    0 1px 0 rgba(255, 255, 255, 0.06) inset;
  backdrop-filter: blur(18px) saturate(1.3);
  -webkit-backdrop-filter: blur(18px) saturate(1.3);
}

#pxxl-personalize-btn:hover {
  background: rgba(24, 24, 30, 0.88);
  border-color: rgba(255, 255, 255, 0.18);
}

#pxxl-personalize-btn:focus-visible {
  outline: 2px solid #8b7cff;
  outline-offset: 3px;
}

#pxxl-webmcp-banner {
  position: sticky;
  top: 0;
  z-index: 2147483500;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 16px;
  background: #1d1a12;
  color: #f6e7b2;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  border-bottom: 1px solid rgba(246, 231, 178, 0.16);
}

#pxxl-webmcp-banner a {
  color: inherit;
  font-weight: 600;
}

#pxxl-webmcp-banner .pxxl-banner-close {
  margin-left: auto;
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
`;

  function injectStyle() {
    if (document.getElementById("pxxl-boot-style")) return;
    const style = document.createElement("style");
    style.id = "pxxl-boot-style";
    style.setAttribute("data-perso-xxl-ui", "true");
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function mountPersonalizeButton() {
    if (document.getElementById("pxxl-personalize-btn")) return;
    const button = document.createElement("button");
    button.id = "pxxl-personalize-btn";
    button.type = "button";
    button.setAttribute("data-perso-xxl-ui", "true");
    button.textContent = "✨ Personalize";
    button.addEventListener("click", () => {
      window.PersoShim?.emitRuntimeMessage({ type: "PERSO_TOGGLE_PANEL" });
    });
    document.body.appendChild(button);
  }

  function mountWebmcpBanner() {
    if (window.PersoPlayground?.webmcpAvailable !== false) return;
    if (document.getElementById("pxxl-webmcp-banner")) return;

    const banner = document.createElement("div");
    banner.id = "pxxl-webmcp-banner";
    banner.setAttribute("data-perso-xxl-ui", "true");
    banner.setAttribute("role", "status");
    banner.innerHTML = `
      <span>WebMCP not detected — open this page in the ChatGPT desktop app's browser, or Chrome 149+ with chrome://flags/#enable-webmcp-testing</span>
      <button type="button" class="pxxl-banner-close" aria-label="Dismiss">×</button>
    `;
    banner.querySelector(".pxxl-banner-close").addEventListener("click", () => {
      banner.remove();
    });
    document.body.prepend(banner);
  }

  function wireClutter() {
    const cookie = document.getElementById("cookie-banner");
    cookie?.querySelectorAll("[data-cookie-action]").forEach((button) => {
      button.addEventListener("click", () => {
        cookie.hidden = true;
      });
    });

    const popup = document.getElementById("newsletter-popup");
    if (popup) {
      window.setTimeout(() => {
        if (!popup.isConnected) return;
        popup.hidden = false;
        popup.classList.add("is-open");
      }, 8000);

      const closePopup = () => {
        popup.hidden = true;
        popup.classList.remove("is-open");
      };

      popup.querySelectorAll("[data-newsletter-close]").forEach((button) => {
        button.addEventListener("click", closePopup);
      });

      popup.addEventListener("click", (event) => {
        if (event.target === popup) closePopup();
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !popup.hidden) closePopup();
      });
    }

    document.querySelectorAll(".newsletter-box form, #newsletter-popup form").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const note = form.querySelector("[data-newsletter-thanks]");
        if (note) note.hidden = false;
        const field = form.querySelector("input[type='email']");
        if (field) field.value = "";
      });
    });
  }

  injectStyle();
  mountPersonalizeButton();
  mountWebmcpBanner();
  wireClutter();
})();
