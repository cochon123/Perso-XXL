window.PersoDemo = (() => {
  const log = window.PersoLogger;
  const STORAGE_KEY = 'persoDemoPlan';
  let currentPlan = null;
  let selectionCounter = 0;

  function buildPageContext() {
    return {
      url: location.href,
      hostname: location.hostname,
      pathname: location.pathname,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };
  }

  function hasLocalPath(value) {
    return /(^|\s)(\/home\/|\/Users\/|[A-Za-z]:\\)/.test(value);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function tokensToSelections(tokens) {
    const selections = [];

    for (const [, stored] of tokens) {
      if (stored.type !== 'pick' || !stored.element) continue;
      selectionCounter += 1;
      selections.push(
        window.PersoDomContext.buildSelection(stored.element, `sel_${selectionCounter}`),
      );
    }

    return selections;
  }

  async function resolveUploadedAsset(tokens) {
    for (const [, stored] of tokens) {
      if (stored.type !== 'image' || !stored.file) continue;

      return {
        assetId: 'uploadedImage',
        name: stored.label || stored.file.name,
        type: stored.file.type,
        size: stored.file.size,
        dataUrl: await readFileAsDataUrl(stored.file),
      };
    }

    return null;
  }

  function getAssetSummaries(uploadedAsset) {
    if (!uploadedAsset) return [];

    return [{
      assetId: uploadedAsset.assetId,
      name: uploadedAsset.name,
      type: uploadedAsset.type,
      size: uploadedAsset.size,
      useAs: 'backgroundImage',
    }];
  }

  function attachAssetsToPlan(plan, uploadedAsset) {
    if (!uploadedAsset) return plan;

    return {
      ...plan,
      assets: {
        ...(plan.assets || {}),
        [uploadedAsset.assetId]: {
          type: uploadedAsset.type,
          name: uploadedAsset.name,
          dataUrl: uploadedAsset.dataUrl,
        },
      },
    };
  }

  async function generateAndApplyPlan({ prompt, tokens }) {
    if (!window.PersoEnv?.OPENROUTER_API_KEY) {
      throw new Error('Missing OpenRouter key. Run: node scripts/build-env.mjs');
    }

    const pageContext = buildPageContext();
    const pageDom = window.PersoDomContext.collectPageDom();
    const selections = tokensToSelections(tokens);
    const uploadedAsset = await resolveUploadedAsset(tokens);
    const availableAssets = getAssetSummaries(uploadedAsset);

    log.info('demo.generation.started', {
      promptLength: prompt.length,
      selectionCount: selections.length,
      pageNodeCount: pageDom.nodeCount,
    });

    let plan = await window.PersoAiClient.generateTransformPlan({
      prompt,
      pageContext,
      pageDom,
      selections,
      availableAssets,
    });

    plan = attachAssetsToPlan(plan, uploadedAsset);

    let validation = window.PersoAiClient.validateTransformPlan(plan);
    if (!validation.ok) {
      log.warn('demo.generation.validation.failed', { errors: validation.errors });

      plan = await window.PersoAiClient.generateTransformPlan({
        prompt,
        pageContext,
        pageDom,
        selections,
        availableAssets,
        previousPlan: plan,
        validationErrors: validation.errors,
      });
      plan = attachAssetsToPlan(plan, uploadedAsset);

      validation = window.PersoAiClient.validateTransformPlan(plan);
      if (!validation.ok) {
        throw new Error(validation.errors.join(' '));
      }
    }

    currentPlan = plan;
    const result = window.PersoExecutor.applyPlan(plan);
    log.info('demo.apply.finished', result);

    if (result?.totalMatched === 0) {
      throw new Error('No elements matched this plan. Try picking an element first.');
    }

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    return plan;
  }

  return {
    enabled: true,

    pickElement() {
      return window.PersoPicker.pickElement();
    },

    formatElementLabel(element) {
      if (element.id) return `#${element.id}`;
      const tag = element.tagName.toLowerCase();
      const classes = Array.from(element.classList || []).slice(0, 2);
      return classes.length ? `${tag}.${classes.join('.')}` : tag;
    },

    async onSend({ prompt, tokens }) {
      const trimmed = prompt?.trim();
      if (!trimmed) throw new Error('Type what you want to change first.');
      if (hasLocalPath(trimmed) && !tokens.some(([, stored]) => stored.type === 'image')) {
        throw new Error('Attach the image file instead of typing its local path.');
      }

      return generateAndApplyPlan({ prompt: trimmed, tokens });
    },

    async onRevert() {
      if (!currentPlan) return;
      window.PersoExecutor.revertPlan();
      currentPlan = null;
      sessionStorage.removeItem(STORAGE_KEY);
      log.info('demo.reverted');
    },
  };
})();
