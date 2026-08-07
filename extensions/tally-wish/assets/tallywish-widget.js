// extensions/tallywish-widget/assets/tallywish-widget.js
// Shopify App Extension — Theme App Extension
// Fixed: auto-inject buttons/divs, retry logic, SPA navigation support

(function () {
  "use strict";

  let settings = null;
  let _lastPath = location.pathname;
  let _retryTimer = null;
  let _observer = null;

  /* ── Helpers ─────────────────────────────────────────────────── */

  function getShop() {
    return (
      window.Shopify?.shop ||
      document.querySelector('meta[name="shopify-checkout-api-token"]')
        ?.closest("[data-shopify-shop]")
        ?.dataset?.shopifyShop ||
      window.location.hostname ||
      null
    );
  }

  function isProductPage() {
    return window.location.pathname.includes("/products/");
  }

  /* ── Load settings via Shopify App Proxy ────────────────────── */
  // App proxy URL: https://{store}.myshopify.com/apps/tallywish-settings
  // Shopify forwards → https://shopify.tallywish.com/tallywish-settings
  // No CORS issues — request comes from same storefront origin /apps/tallywish-settings

  function loadSettings(cb) {
    const shop = getShop();

    if (!shop) {
      console.warn("[TallyWish] Could not detect shop domain.");
      return;
    }

    fetch("/apps/tallywish-settings?shop=" + encodeURIComponent(shop))
      .then((res) => res.json())
      .then((data) => {
        settings = data;
        if (settings && settings.enabled) {
          cb();
        }
      })
      .catch((err) => console.warn("[TallyWish] Could not load settings:", err));
  }

  /* ── Fetch current product data ─────────────────────────────── */

  function getProduct(cb) {
    if (!isProductPage()) return;

    fetch(window.location.pathname + ".js")
      .then((r) => r.json())
      .then((p) => {
        cb({
          id:    p.id,
          title: p.title,
          image: p.images?.[0] || "",
          url:   window.location.href,
        });
      })
      .catch((err) => console.warn("[TallyWish] Could not fetch product:", err));
  }

  /* ── Open wishlist popup ─────────────────────────────────────── */

  function openPopup() {
    getProduct(function (p) {
      let url =
        "https://www.tallywish.com/shared/index.cfm?" +
        "tallywish_tw_title="     + encodeURIComponent(p.title) +
        "&tallywish_tw_prodURL="  + encodeURIComponent(p.url)   +
        "&tallywish_tw_prodID="   + encodeURIComponent(p.id)    +
        "&tallywish_tw_imageurl=" + encodeURIComponent(p.image);

      if (settings.store_id) {
        url += "&tallywish_tw_merchantID=" + encodeURIComponent(settings.store_id);
        url += "&store_id="               + encodeURIComponent(settings.store_id);
      }

      if (settings.store_secure_key) {
        url += "&shopify_key=" + encodeURIComponent(settings.store_secure_key);
      }

      window.open(url, "tallywish", "width=600,height=700,resizable=yes");
    });
  }

  /* ── Floating icon ───────────────────────────────────────────── */

  function injectFloating() {
    if (!isProductPage()) return;
    if (document.getElementById("tw-float")) return;

    const btn = document.createElement("div");
    btn.id = "tw-float";
    btn.setAttribute("role", "button");
    btn.setAttribute("aria-label", "Open TallyWish wishlist");
    btn.setAttribute("tabindex", "0");

    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
           viewBox="0 0 24 24" fill="white" aria-hidden="true">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5
                 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09
                 C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5
                 c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>`;

    Object.assign(btn.style, {
      position:       "fixed",
      bottom:         (settings.bottom_offset || 20) + "px",
      right:          (settings.right_offset  || 20) + "px",
      width:          "55px",
      height:         "55px",
      background:     settings.bg_color || "#ff4081",
      borderRadius:   "50%",
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
      cursor:         "pointer",
      zIndex:         "2147483647",
      boxShadow:      "0 4px 16px rgba(0,0,0,.25)",
      transition:     "transform .15s, box-shadow .15s",
      userSelect:     "none",
    });

    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "scale(1.08)";
      btn.style.boxShadow = "0 6px 20px rgba(0,0,0,.3)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "scale(1)";
      btn.style.boxShadow = "0 4px 16px rgba(0,0,0,.25)";
    });

    btn.addEventListener("click", openPopup);
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPopup();
      }
    });

    document.body.appendChild(btn);
    console.log("[TallyWish] Floating button injected.");
  }

  /* ── Product page button + wrapper div ──────────────────────── */

  function injectProductBtn() {
    if (!isProductPage()) return;
    if (document.getElementById("tw-btn")) return;

    const form = document.querySelector('form[action*="/cart/add"]');
    if (!form) {
      console.warn("[TallyWish] Add-to-cart form not found yet, will retry...");
      return false;
    }

    const wrapper = document.createElement("div");
    wrapper.id = "tw-btn-wrapper";
    Object.assign(wrapper.style, {
      display:   "block",
      width:     "100%",
      marginTop: "10px",
    });

    const btn = document.createElement("button");
    btn.id        = "tw-btn";
    btn.type      = "button";
    btn.innerHTML = settings.button_text || "&#10084; Add to TallyWish";

    Object.assign(btn.style, {
      display:       "block",
      width:         "100%",
      padding:       "12px 16px",
      background:    settings.btn_bg     || "#ff4081",
      color:         settings.btn_color  || "#ffffff",
      borderRadius:  (settings.btn_radius || 5) + "px",
      border:        "none",
      fontSize:      "15px",
      fontWeight:    "600",
      cursor:        "pointer",
      transition:    "opacity .15s",
      letterSpacing: "0.3px",
    });

    btn.addEventListener("mouseenter", () => (btn.style.opacity = ".85"));
    btn.addEventListener("mouseleave", () => (btn.style.opacity = "1"));
    btn.addEventListener("click", openPopup);

    wrapper.appendChild(btn);
    form.appendChild(wrapper);

    console.log("[TallyWish] Product button injected.");
    return true;
  }

  /* ── Retry injecting the product button until form appears ───── */

  function injectProductBtnWithRetry(maxAttempts, delayMs) {
    let attempts = 0;

    function attempt() {
      if (document.getElementById("tw-btn")) return;
      attempts++;
      const success = injectProductBtn();

      if (!success && attempts < maxAttempts) {
        _retryTimer = setTimeout(attempt, delayMs);
      } else if (!success) {
        console.warn(
          "[TallyWish] Gave up injecting product button after " +
            maxAttempts + " attempts."
        );
      }
    }

    attempt();
  }

  /* ── Router ──────────────────────────────────────────────────── */

  function init() {
    const mode = settings.button_type || "both";

    if (mode === "both" || mode === "floating") injectFloating();
    if (mode === "both" || mode === "product")  injectProductBtnWithRetry(15, 300);
  }

  /* ── SPA navigation handler ──────────────────────────────────── */

  function handleNavigation() {
    if (location.pathname === _lastPath) return;
    _lastPath = location.pathname;

    clearTimeout(_retryTimer);

    ["tw-btn", "tw-btn-wrapper", "tw-float"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    if (settings) init();
  }

  /* ── Boot ────────────────────────────────────────────────────── */

  function boot() {
    loadSettings(init);

    _observer = new MutationObserver(handleNavigation);
    _observer.observe(document.documentElement, { childList: true, subtree: true });

    ["pushState", "replaceState"].forEach((method) => {
      const original = history[method];
      history[method] = function (...args) {
        original.apply(this, args);
        handleNavigation();
      };
    });

    window.addEventListener("popstate", handleNavigation);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();