chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || !tab.url?.startsWith("https://www.youtube.com/")) return;
  console.log("[Perso XXL] action clicked", { tabId: tab.id, url: tab.url });
  chrome.tabs.sendMessage(tab.id, { type: "PERSO_TOGGLE_PANEL" });
});
