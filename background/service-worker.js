chrome.action.onClicked.addListener((tab) => {
  if (!isSupportedTab(tab)) return;
  console.log("[Perso XXL] action clicked", { tabId: tab.id, url: tab.url });
  chrome.tabs.sendMessage(tab.id, { type: "PERSO_TOGGLE_PANEL" });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "open-command-palette") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!isSupportedTab(tab)) return;

  console.log("[Perso XXL] command palette requested", { tabId: tab.id, url: tab.url });
  chrome.tabs.sendMessage(tab.id, { type: "PERSO_TOGGLE_PANEL" });
});

function isSupportedTab(tab) {
  return Boolean(tab?.id && /^https?:\/\//.test(tab.url || ""));
}
