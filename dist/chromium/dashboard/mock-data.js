window.DASHBOARD_MOCK_RECORDS = [
  {
    key: "siteRecord:https://www.youtube.com/",
    site: {
      url: "https://www.youtube.com/",
      title: "YouTube",
      hostname: "www.youtube.com",
      pathname: "/"
    },
    conversations: [],
    modifications: [
      {
        id: "mod_yt_ads_all",
        title: "remove all those adds",
        enabled: true,
        sourcePrompt: "remove all those adds [element:a.ytLockupViewModelContentImage]",
        status: "applied",
        createdAt: "2026-05-28T14:22:00.000Z",
        updatedAt: "2026-05-28T14:22:00.000Z"
      },
      {
        id: "mod_yt_thumbnails",
        title: "remove these",
        enabled: true,
        sourcePrompt: "remove these [element:img.ytCoreImageHost.ytCoreImageFillParentHeight]",
        status: "applied",
        createdAt: "2026-05-28T15:01:00.000Z",
        updatedAt: "2026-05-28T15:01:00.000Z"
      },
      {
        id: "mod_yt_sidebar",
        title: "hide sidebar promos",
        enabled: false,
        sourcePrompt: "Hide promotional cards in the sidebar feed",
        status: "applied",
        createdAt: "2026-05-27T09:15:00.000Z",
        updatedAt: "2026-05-28T11:40:00.000Z"
      }
    ],
    lastUpdatedAt: "2026-05-28T15:01:00.000Z"
  },
  {
    key: "siteRecord:https://github.com/cochon123/Perso-XXL",
    site: {
      url: "https://github.com/cochon123/Perso-XXL",
      title: "cochon123/Perso-XXL",
      hostname: "github.com",
      pathname: "/cochon123/Perso-XXL"
    },
    conversations: [],
    modifications: [
      {
        id: "mod_gh_sticky",
        title: "Unstick the repo header",
        enabled: true,
        sourcePrompt: "Make the repository header scroll away instead of staying pinned",
        status: "applied",
        createdAt: "2026-05-26T18:45:00.000Z",
        updatedAt: "2026-05-26T18:45:00.000Z"
      },
      {
        id: "mod_gh_sidebar",
        title: "Widen the file tree",
        enabled: true,
        sourcePrompt: "Give the file browser more horizontal space on wide screens",
        status: "applied",
        createdAt: "2026-05-25T10:30:00.000Z",
        updatedAt: "2026-05-25T10:30:00.000Z"
      }
    ],
    lastUpdatedAt: "2026-05-26T18:45:00.000Z"
  },
  {
    key: "siteRecord:https://docs.google.com/document/d/demo/edit",
    site: {
      url: "https://docs.google.com/document/d/demo/edit",
      title: "Product notes — Google Docs",
      hostname: "docs.google.com",
      pathname: "/document/d/demo/edit"
    },
    conversations: [],
    modifications: [
      {
        id: "mod_docs_gemini",
        title: "Remove the Gemini button",
        enabled: true,
        sourcePrompt: "Remove the Gemini button from the toolbar",
        status: "applied",
        createdAt: "2026-05-24T16:20:00.000Z",
        updatedAt: "2026-05-24T16:20:00.000Z"
      }
    ],
    lastUpdatedAt: "2026-05-24T16:20:00.000Z"
  }
];
