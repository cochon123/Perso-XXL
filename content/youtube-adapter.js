window.PersoYoutubeAdapter = {
  site: "youtube.com",
  targets: {
    app: ["ytd-app", "body"],
    masthead: ["ytd-masthead", "#masthead-container"],
    sidebar: ["ytd-guide-renderer", "#guide"],
    homeFeed: ["ytd-rich-grid-renderer", "#contents.ytd-rich-grid-renderer"],
    videoCard: ["ytd-rich-item-renderer", "ytd-video-renderer", "ytd-grid-video-renderer"],
    videoTitle: ["#video-title", "a#video-title-link", "yt-formatted-string#video-title"],
    thumbnail: [
      "ytd-thumbnail",
      "a#thumbnail",
      "ytd-thumbnail img",
      "a#thumbnail img",
      "img.yt-core-image",
      "ytd-rich-grid-media #thumbnail",
      "ytd-rich-grid-media img",
      "a[href^='/watch'] img",
      "img[src*='ytimg.com']"
    ],
    chips: ["ytd-feed-filter-chip-bar-renderer", "yt-chip-cloud-chip-renderer"],
    shortsShelf: ["ytd-rich-section-renderer", "ytd-reel-shelf-renderer"],
    watchPage: ["ytd-watch-flexy"],
    player: ["#player", "#movie_player"],
    recommendations: ["#related", "ytd-watch-next-secondary-results-renderer"],
    comments: ["ytd-comments", "#comments"]
  },
  getPageType() {
    const path = location.pathname;
    if (path === "/" || path === "/feed/subscriptions") return "home";
    if (path === "/watch") return "watch";
    if (path.startsWith("/shorts")) return "shorts";
    if (path.startsWith("/results")) return "search";
    return "other";
  },
  queryTarget(target) {
    if (target === "thumbnail") return queryThumbnailTargets();

    const selectors = this.targets[target] || [];
    return uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))));
  },
  getSelectorDiagnostics() {
    return {
      thumbnail: THUMBNAIL_SELECTORS.map((selector) => ({
        selector,
        count: document.querySelectorAll(selector).length
      }))
    };
  },
  buildDomSummary() {
    const entries = Object.keys(this.targets).map((target) => {
      const elements = this.queryTarget(target);
      const visible = elements.filter(isVisible).slice(0, 5).map(summarizeElement);

      return {
        target,
        selectors: this.targets[target],
        count: elements.length,
        visible
      };
    });

    return {
      url: location.href,
      title: document.title,
      site: this.site,
      pageType: this.getPageType(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      targets: entries
    };
  }
};

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function summarizeElement(element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const text = normalizeText(element.innerText || element.textContent || "");

  return {
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    classes: Array.from(element.classList || []).slice(0, 6),
    textSample: text.slice(0, 120),
    bounds: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    },
    computed: {
      color: style.color,
      backgroundColor: style.backgroundColor,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize
    }
  };
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueElements(elements) {
  return Array.from(new Set(elements));
}

function queryThumbnailTargets() {
  const cards = Array.from(document.querySelectorAll("ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-grid-media"));
  const scopedTargets = cards.flatMap((card) => {
    const thumbnail = card.querySelector("ytd-thumbnail, #thumbnail, a[href^='/watch']");
    if (!thumbnail) return [];

    return [
      thumbnail,
      thumbnail.querySelector("a#thumbnail"),
      thumbnail.querySelector("#thumbnail"),
      thumbnail.querySelector("yt-image"),
      thumbnail.querySelector("img"),
      thumbnail.querySelector("img.yt-core-image"),
      card.querySelector("img[src*='ytimg.com']"),
      card.querySelector("img.yt-core-image")
    ].filter(Boolean);
  });

  const fallbackTargets = THUMBNAIL_SELECTORS.flatMap((selector) => Array.from(document.querySelectorAll(selector)));

  return uniqueElements([...scopedTargets, ...fallbackTargets]).filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 24 && rect.height > 24;
  });
}

const THUMBNAIL_SELECTORS = [
  "ytd-thumbnail",
  "a#thumbnail",
  "ytd-thumbnail img",
  "a#thumbnail img",
  "img.yt-core-image",
  "ytd-rich-grid-media #thumbnail",
  "ytd-rich-grid-media img",
  "a[href^='/watch'] img",
  "img[src*='ytimg.com']",
  "img[src*='i.ytimg.com']"
];
