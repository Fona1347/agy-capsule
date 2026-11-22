import { MAX_TRANSLATION_LENGTH } from './localization.mjs';

export const LOCALIZATION_EDITOR_HTML = `
  <details class="setting-card localization-editor" id="localization-editor">
    <summary data-i18n="editTranslations"></summary>
    <div class="localization-controls">
      <label><span data-i18n="searchTranslations"></span><input type="search" data-translation-search /></label>
      <label class="localization-filter"><input type="checkbox" data-translation-custom /><span data-i18n="customTranslations"></span></label>
      <div class="localization-list" data-translation-list></div>
      <div class="localization-actions">
        <button class="pv-swatch" type="button" data-translation-previous aria-label="Previous page">‹</button>
        <span data-translation-page></span>
        <button class="pv-swatch" type="button" data-translation-next aria-label="Next page">›</button>
        <button class="pv-swatch localization-add" type="button" data-translation-add data-i18n="newTranslation"></button>
      </div>
      <form class="localization-fields">
        <label><span data-i18n="translationSource"></span><textarea data-translation-source rows="2" maxlength="${MAX_TRANSLATION_LENGTH}" required></textarea></label>
        <label><span data-i18n="translationTarget"></span><textarea data-translation-target rows="2" maxlength="${MAX_TRANSLATION_LENGTH}" required></textarea></label>
        <div class="localization-actions">
          <button class="pv-swatch" type="submit" data-translation-save data-i18n="saveTranslation"></button>
          <button class="pv-swatch" type="button" data-translation-reset data-i18n="resetTranslation"></button>
        </div>
      </form>
      <span class="localization-status" role="status" data-translation-status></span>
    </div>
  </details>`;

export function createLocalizationEditor(root, request) {
  const find = name => root.querySelector('[data-translation-' + name + ']');
  const search = find('search'), custom = find('custom'), list = find('list');
  const source = find('source'), target = find('target'), marker = find('page');
  const previous = find('previous'), next = find('next'), add = find('add'), save = find('save'), reset = find('reset');
  const status = find('status');
  const pageSize = 8;
  let entries = new Map(), labels, statusKey = '', page = 0, busy = false;

  function setStatus(key = '') {
    statusKey = key;
    status.textContent = labels?.[key] || '';
  }

  function syncForm() {
    source.disabled = target.disabled = busy;
    save.disabled = busy || !source.value.trim() || !target.value.trim();
    reset.disabled = busy || !entries.get(source.value.trim())?.customized;
  }

  function select(entry) {
    source.value = entry?.source || '';
    target.value = entry?.translation || '';
    setStatus();
    syncForm();
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const matches = [...entries.values()].filter(entry => (!custom.checked || entry.customized) &&
      (!query || entry.source.toLowerCase().includes(query) || entry.translation.toLowerCase().includes(query)));
    const pages = Math.ceil(matches.length / pageSize);
    page = Math.max(0, Math.min(page, pages - 1));
    marker.textContent = pages ? (page + 1) + ' / ' + pages : '0 / 0';
    previous.disabled = busy || page === 0;
    next.disabled = busy || page >= pages - 1;
    add.disabled = busy;
    const rows = matches.slice(page * pageSize, (page + 1) * pageSize).map(entry => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'localization-entry';
      row.disabled = busy;
      const from = document.createElement('span');
      const to = document.createElement('span');
      from.textContent = entry.source;
      to.textContent = entry.translation;
      row.append(from, to);
      row.addEventListener('click', () => { select(entry); target.focus(); });
      return row;
    });
    list.replaceChildren(...rows);
    syncForm();
  }

  async function transact(action) {
    if (busy) return;
    const key = source.value.trim();
    const value = target.value.trim();
    busy = true;
    setStatus(action === 'list' ? 'loadingTranslations' : '');
    render();
    try {
      const result = await request(action === 'list' ? { action } : { action, source: key, translation: value });
      if (result.error) throw new Error(result.error);
      if (action === 'list') {
        entries = new Map(result.entries.map(entry => [entry.source, entry]));
      } else {
        if (result.entry) entries.set(key, result.entry);
        else entries.delete(key);
        select(result.entry);
      }
      setStatus(action === 'list' ? '' : 'translationSaved');
    } catch {
      setStatus('translationSaveFailed');
    } finally {
      busy = false;
      render();
    }
  }

  function refilter() {
    page = 0;
    render();
  }

  root.addEventListener('toggle', () => { if (root.open) void transact('list'); });
  search.addEventListener('input', refilter);
  custom.addEventListener('change', refilter);
  previous.addEventListener('click', () => { page--; render(); });
  next.addEventListener('click', () => { page++; render(); });
  add.addEventListener('click', () => { select(); source.focus(); });
  source.addEventListener('input', syncForm);
  target.addEventListener('input', syncForm);
  reset.addEventListener('click', () => void transact('reset'));
  root.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    if (!save.disabled) void transact('save');
  });
  return {
    sync(nextLabels) {
      labels = nextLabels;
      previous.setAttribute('aria-label', labels.translationPrevious);
      next.setAttribute('aria-label', labels.translationNext);
      setStatus(statusKey);
    },
  };
}
