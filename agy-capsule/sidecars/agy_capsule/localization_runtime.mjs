// Serialized into the verified Antigravity renderer by the deck injector.
export function startHostLocalization(entries) {
  const dictionary = new Map(entries);
  const textControls = 'button, a[href], label, legend, summary, option, h1, h2, h3, h4, ' +
    '[role="button"], [role="heading"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], ' +
    '[role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="option"], [role="tooltip"]';
  const settingsArea = '[data-testid="settings-page"], [data-testid^="settings-section"], [data-testid^="settings-row"]';
  const protectedArea = [
    'script', 'style', 'noscript', 'template', 'svg', 'math', 'code', 'pre', 'kbd', 'samp', 'textarea',
    '[contenteditable]:not([contenteditable="false"])', '[role="textbox"]', '[role="code"]',
    '[data-lexical-editor]', '[data-code]', '[data-line-number]', '[data-message-id]',
    '.monaco-editor', '.cm-editor', '.xterm', '.markdown', '.markdown-body', '.prose',
    '.user-message', '.thought-content', '.thinking-content', '.thought-box',
    '[data-testid*="user-message"]', '[data-testid*="assistant-message"]',
    '[data-testid*="message-content"]', '[data-testid*="markdown"]', '[data-testid*="conversation-title"]',
    '[data-testid*="conversation-name"]', '[data-testid*="file-tree"]', '[data-testid*="file-name"]',
    '[data-testid*="terminal-output"]', '[data-testid*="artifact-content"]',
    '[data-testid="project-header"]', '[data-project-card="true"]', '[data-testid="menu-option-label"]',
    'a[href*="/c/"]', '[data-testid="model-selector-trigger"]',
    '#agy-capsule-host', '[data-agy-capsule-subagent]', '[data-deck-model-bubble]', '[class*="dk-"]',
    '[translate="no"]',
  ].join(',');
  const attributes = ['aria-label', 'title', 'placeholder', 'data-placeholder'];
  const attributeSelector = attributes.map(name => '[' + name + ']').join(',');
  const originalText = new Map();
  const originalAttributes = new Map();

  function translate(value) {
    if (!value) return value;
    const trimmed = value.trim();
    const replacement = dictionary.get(trimmed);
    if (replacement === undefined || replacement === trimmed) return value;
    const offset = value.indexOf(trimmed);
    return value.slice(0, offset) + replacement + value.slice(offset + trimmed.length);
  }

  function isChrome(element) {
    return element && !element.closest(protectedArea) &&
      (element.closest(textControls) || element.closest(settingsArea) ||
        (location.pathname.startsWith('/settings') && element.matches('div, p, span')));
  }

  function translateText(node) {
    const previous = originalText.get(node);
    const actual = node.data;
    const current = previous?.applied === actual ? previous.original : actual;
    const candidate = translate(current);
    const next = candidate !== current && isChrome(node.parentElement) ? candidate : current;
    if (next !== current) originalText.set(node, { original: current, applied: next });
    else originalText.delete(node);
    if (next !== actual) node.data = next;
  }

  function isChromeAttribute(element, name) {
    return isChrome(element) || (name === 'placeholder' && element.matches('input:not([type="hidden"])') &&
      !element.closest(protectedArea));
  }

  function translateAttribute(element, name) {
    const tracked = originalAttributes.get(element);
    const previous = tracked?.get(name);
    const actual = element.getAttribute(name);
    const current = previous?.applied === actual ? previous.original : actual;
    const candidate = translate(current);
    const next = candidate !== current && isChromeAttribute(element, name) ? candidate : current;
    if (next !== current) {
      const records = tracked || new Map();
      records.set(name, { original: current, applied: next });
      originalAttributes.set(element, records);
    } else if (tracked) {
      tracked.delete(name);
      if (!tracked.size) originalAttributes.delete(element);
    }
    if (next !== actual) element.setAttribute(name, next);
  }

  function scan(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      translateText(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.closest(protectedArea)) return;
    if (node.matches(attributeSelector)) for (const name of attributes) translateAttribute(node, name);
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: child => child.nodeType === Node.ELEMENT_NODE && child.matches(protectedArea)
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let child = walker.nextNode(); child; child = walker.nextNode()) {
      if (child.nodeType === Node.TEXT_NODE) translateText(child);
      else if (child.matches(attributeSelector)) for (const name of attributes) translateAttribute(child, name);
    }
  }

  function restoreText(node, record) {
    if (node.data === record.applied) node.data = record.original;
    originalText.delete(node);
  }

  function restoreAttributes(element, records) {
    for (const [name, record] of records) {
      if (element.getAttribute(name) === record.applied) element.setAttribute(name, record.original);
    }
    originalAttributes.delete(element);
  }

  const observer = new MutationObserver(records => {
    const added = new Set();
    let recheck = false;
    for (const mutation of records) {
      if (mutation.type === 'characterData') translateText(mutation.target);
      else if (mutation.type === 'attributes') {
        if (attributes.includes(mutation.attributeName)) translateAttribute(mutation.target, mutation.attributeName);
        else {
          added.add(mutation.target);
          recheck = true;
        }
      } else {
        for (const node of mutation.addedNodes) if (node.isConnected) added.add(node);
        recheck ||= mutation.removedNodes.length > 0;
      }
    }
    for (const node of added) scan(node);
    // Reused nodes may have moved into user content or left the document.
    if (!recheck) return;
    for (const [node, record] of originalText) {
      if (!node.isConnected || !isChrome(node.parentElement)) restoreText(node, record);
    }
    for (const [element, owned] of originalAttributes) {
      if (!element.isConnected) restoreAttributes(element, owned);
      else for (const name of owned.keys()) {
        if (!isChromeAttribute(element, name)) translateAttribute(element, name);
      }
    }
  });
  const root = document.documentElement;
  scan(root);
  observer.observe(root, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: [...attributes, 'contenteditable', 'role', 'translate', 'data-testid'],
  });

  return () => {
    observer.disconnect();
    for (const [node, record] of originalText) restoreText(node, record);
    for (const [element, owned] of originalAttributes) restoreAttributes(element, owned);
  };
}
