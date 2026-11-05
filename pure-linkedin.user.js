// ==UserScript==
// @name         Pure LinkedIn
// @namespace    https://github.com/squarezhong/pure-linkedin
// @version      0.1.1
// @description  首页 Recent 与关注优先，清理推荐和显式广告，保留搜索、职业功能与日常互动。
// @author       squarezhong
// @match        https://www.linkedin.com/*
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self || location.protocol !== 'https:' || location.hostname !== 'www.linkedin.com') return;
  const KEY = 'pure-linkedin-settings-v1', UI = 'pure-linkedin-settings';
  const HIDDEN = 'pure-linkedin-hidden', EMPTY = 'pure-linkedin-empty';
  const OPTIONS = [
    ['recent', '首页默认使用 Recent（最新）排序', true],
    ['strict', '首页严格关注优先（保留主动转发与未知来源）', true],
    ['ads', '清理显式广告', true],
    ['recommendations', '清理内容推荐、热点与首页营销提示', true],
    ['network', '清理推荐人脉，保留邀请与管理', true],
    ['jobs', '清理推荐职位，保留搜索与管理', true],
    ['premium', '隐藏 Premium 推广与入口', true],
    ['business', '隐藏 For Business 导航入口', true],
    ['games', '隐藏小游戏模块与入口', true]
  ];
  const defaults = Object.fromEntries(OPTIONS.map(([k, , v]) => [k, v]));
  const normalize = value => ({ version: 1, ...Object.fromEntries(OPTIONS.map(([k, , fallback]) =>
    [k, typeof value?.[k] === 'boolean' ? value[k] : fallback])) });
  const query = (s, root = document) => [...root.querySelectorAll(s)];
  const text = el => (el?.textContent || '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  const label = el => el?.getAttribute('aria-label') || text(el);
  const CARD = '[role="listitem"][componentkey^="update-card-focus"],.feed-shared-update-v2[data-urn]';
  const BODY = '[data-testid="expandable-text-box"],.update-components-text,.feed-shared-update-v2__description,blockquote';
  const EDITOR = '[contenteditable="true"],textarea,input:not([type="hidden"]):not([type="range"]),[role="search"],form';
  const PROTECTED = `${BODY},[contenteditable="true"],textarea,[role="dialog"],.msg-overlay-container,[componentkey*="replaceableCommentTools"],.comments-comments-list`;
  const ACTOR_LINK = 'a[href*="/in/"],a[href*="/company/"],a[href*="/school/"],a[href*="/showcase/"]';
  const AD = /^(Promoted|Sponsored|Advertisement|广告|廣告|推广|推廣|赞助|贊助)$/i;
  const FOLLOW = /^(?:\+\s*)?(?:Follow(?:\s|$)|关注|關注|追蹤)/i;
  const REPOST = /\b(?:reposted|reshared)(?:\s+this)?[.!]?\s*$|(?:转发了|轉發了|转发|轉發|轉貼了|分享了)(?:此动态|此動態|这则动态|這則動態)?\s*$/i;
  const SOCIAL = /\b(?:likes?(?:\s+this)?|reacted to this|commented on this|celebrates? this|supports? this|loves? this|finds? this insightful)\s*$|(?:赞了|讚了|赞过|讚過|评论了|評論了|回应了|回應了|喜歡了)(?:此动态|此動態|这则动态|這則動態)?\s*$/i;
  const RECOMMENDED = /^(?:Recommended for you|Suggested for you|Because you follow .+|为你推荐|為你推薦|推荐给你|推薦給你|根据你的关注推荐)$/i;
  const CONTENT_TITLE = /^(?:Add to your feed|Recommended for you|Suggested for you|More posts you may like|You might also like|LinkedIn News|Today[’']s (?:top stories|news)|Trending (?:now|stories)|添加到动态|添加到動態|为你推荐|為你推薦|推荐关注|推薦關注|领英新闻|領英新聞|你可能也喜欢|你可能也喜歡)$/i;
  const NETWORK_TITLE = /^(?:People you may know(?: .*)?|People to follow(?: .*)?|Popular on LinkedIn|Suggestions for you|Recommended (?:people|pages|groups)(?: .*)?|你可能认识的人|你可能認識的人|推荐人脉|推薦人脈|推荐关注|推薦關注|为你推荐|為你推薦)$/i;
  const JOB_TITLE = /^(?:Jobs based on your preferences|Jobs recommended for you|Recommended (?:jobs|for you)|Top job picks for you|Top picks for you|More jobs for you|Similar jobs|Explore (?:jobs|opportunities)(?: .*)?|为你推荐的职位|為你推薦的職位|推荐职位|推薦職位|根据你的偏好推荐的职位|類似職位|类似职位)$/i;
  const owned = el => !!el?.closest?.(`#${UI},#pure-linkedin-style,#${EMPTY}`);
  let settings;
  try { settings = normalize(typeof GM_getValue === 'function' ? GM_getValue(KEY, null) : null); }
  catch (_) { settings = normalize(null); }
  let hidden = new Set(), frame = 0, observer, timer, stopped = false, lastURL = '';
  let ui, dialog, status, lastFocus, saving = false, empty;
  let sort = freshSort(), sortTimer;
  function freshSort() { return { attempts: 0, stage: '', deadline: 0, done: false, user: false, button: null }; }
  function route() {
    const p = location.pathname;
    if (/^\/(?:messaging|notifications|login|signup|checkpoint|uas|psettings|settings|premium|talent|learning|help|games|article\/new)(?:\/|$)/.test(p) || /\/edit(?:\/|$)/.test(p)) return 'protected';
    if (/^\/(?:feed\/?)?$/.test(p)) return 'home';
    if (/^\/search(?:\/|$)/.test(p)) return 'search';
    if (/^\/mynetwork\/(?:invite-connect|invitation-manager|network-manager)(?:\/|$)/.test(p)) return 'management';
    if (/^\/mynetwork(?:\/|$)/.test(p)) return 'network';
    if (/^\/jobs\/(?:search|search-results|collections|preferences)(?:\/|$)/.test(p) || /^\/(?:jobs-tracker|my-items)(?:\/|$)/.test(p)) return 'management';
    if (/^\/jobs\/view(?:\/|$)/.test(p)) return 'job-detail';
    if (/^\/jobs\/?$/.test(p)) return 'jobs';
    if (/^\/(?:feed\/update|posts)(?:\/|$)/.test(p)) return 'detail';
    if (/^\/(?:in|company|school)(?:\/|$)/.test(p)) return 'profile';
    return 'other';
  }
  function pathOf(a) {
    try { const u = new URL(a.getAttribute('href'), location.href); return u.origin === location.origin ? u.pathname : ''; }
    catch (_) { return ''; }
  }
  function protectedNode(el) { return owned(el) || !!el.closest(PROTECTED); }
  function hide(desired, el) {
    if (!el || protectedNode(el) || el.querySelector(EDITOR)) return;
    desired.add(el);
  }
  function cardCore(card) {
    const heading = query('h2', card).find(e => e.closest(CARD) === card && /^(Feed post|动态消息|動態消息|动态|動態)$/i.test(text(e)));
    return heading?.parentElement || card;
  }
  function postHeader(card) {
    const core = cardCore(card);
    const button = query('button[aria-label],[role="button"][aria-label]', core).find(e => e.closest(CARD) === card && !e.closest(PROTECTED) &&
      /^(Open control menu for post|打开.*动态.*菜单|開啟.*動態.*選單)/i.test(label(e)));
    if (button) for (let p = button.parentElement; p && p !== core && p !== card; p = p.parentElement) {
      if (p.querySelector(BODY)) break;
      if (p.querySelector(ACTOR_LINK)) return p;
    }
    return query('.update-components-actor', card).find(e => e.closest(CARD) === card && !e.closest(PROTECTED)) || null;
  }
  function sourceText(card, header) {
    const parts = [];
    // Only preceding sibling strips on the path from the outer header to its card.
    for (let node = header; node && node !== card; node = node.parentElement) {
      for (let prev = node.previousElementSibling; prev; prev = prev.previousElementSibling) {
        if (prev.matches('h2') || prev.querySelector(BODY) || prev.matches(BODY)) continue;
        if (prev.querySelector('button,[role="button"],input,textarea,[contenteditable="true"]')) continue;
        const value = text(prev);
        if (value && value.length < 240) parts.unshift(value);
      }
    }
    return parts.join(' ').trim();
  }
  function isAd(header) {
    // Metadata paragraph, not the actor name, headline, post prose or quoted card.
    return query('p[componentkey],.update-components-actor__sub-description,[data-ad-label]', header)
      .some(e => !e.closest('a') && !e.closest(BODY) && AD.test(text(e)));
  }
  function cleanPosts(desired, page) {
    const cards = query(CARD).filter(e => !e.parentElement.closest(CARD) && !protectedNode(e));
    for (const card of cards) {
      const header = postHeader(card);
      if (!header) {
        if (page === 'home' && settings.recommendations) {
          const core = cardCore(card);
          const title = query('p', core).find(e => RECOMMENDED.test(text(e)) && !e.closest('a,button,[role="button"],' + PROTECTED));
          if (title && !core.querySelector(BODY) && query('a[href]', core).some(a => pathOf(a) === '/mynetwork/discover-hub/')) hide(desired, card);
        }
        continue;
      }
      if (settings.ads && isAd(header)) { hide(desired, card); continue; }
      if (page !== 'home' || !settings.strict) continue;
      const source = sourceText(card, header);
      if (REPOST.test(source)) continue;
      if (SOCIAL.test(source) || RECOMMENDED.test(source)) { hide(desired, card); continue; }
      // An unrecognized distribution strip may be a deliberate share; keep it.
      if (source) continue;
      if (query('button,[role="button"]', header).some(e => FOLLOW.test(label(e)) && !/^(Following|关注中|關注中|已关注|已關注|追蹤中)/i.test(label(e)))) hide(desired, card);
    }
    return cards;
  }
  function moduleFor(title, region, kind) {
    const jobModule = kind === 'jobs' && title.closest('[componentkey^="JobsHomeATFModule_"]');
    if (jobModule && region.contains(jobModule) && !jobModule.querySelector(EDITOR) &&
        query('h2,h3', jobModule).every(e => JOB_TITLE.test(text(e)) || /^(No jobs yet|暂无职位|暫無職位)$/i.test(text(e)))) return jobModule;
    const section = title.closest('section');
    if (section && section !== region && region.contains(section) && !section.querySelector(EDITOR) &&
        query('h2,h3', section).every(e => e === title || text(e) === text(title) || /^(No jobs yet|暂无职位|暫無職位)$/i.test(text(e)))) return section;
    for (let p = title.parentElement, depth = 0; p && p !== region && depth < 7; p = p.parentElement, depth++) {
      if (p.matches('main,aside,[role="main"],[role="region"],[role="complementary"]') || p.querySelector(EDITOR)) break;
      const others = query('h2,h3', p).filter(e => e !== title && !e.closest('a'));
      if (others.some(e => text(e) !== text(title) && !/^(No jobs yet|暂无职位|暫無職位)$/i.test(text(e)))) break;
      const links = query('a[href]', p);
      if ((kind === 'content' && links.some(a => pathOf(a) === '/mynetwork/discover-hub/')) ||
          (kind === 'network' && query('button,[role="button"]', p).some(b => /as a suggestion$|移除.*推荐|移除.*推薦/i.test(label(b)))) ||
          (kind === 'jobs' && (links.some(a => /^\/jobs\/(view|collections)\//.test(pathOf(a))) || query('button,[role="button"]', p).some(b => /Add job preferences|添加职位偏好|新增職位偏好/i.test(label(b)))))) return p;
    }
    return null;
  }
  function cleanModules(desired, page) {
    if (page === 'protected') return;
    const asides = query('aside,[role="complementary"]');
    const regions = query('main,[role="main"]');
    const titles = root => query('h2,h3,p', root).filter(e => !protectedNode(e) && !e.closest(`${CARD},a,button,[role="button"],nav`));
    if (settings.recommendations) {
      for (const region of [...asides, ...(['home','profile','detail'].includes(page) ? regions : [])]) {
        for (const title of titles(region)) if (CONTENT_TITLE.test(text(title))) {
          let module = moduleFor(title, region, 'content');
          // News / related modules need a real section boundary, never a whole feed.
          if (!module && title.matches('h2,h3')) {
            const section = title.closest('section');
            if (section && section !== region && !section.querySelector(CARD) && query('h2,h3', section).length === 1) module = section;
          }
          hide(desired, module);
        }
      }
      if (page === 'home') for (const el of query('[componentkey="Launchpad_LaunchpadComponent"],#Launchpad_LaunchpadComponent')) {
        if (/hiring|招聘|招募/i.test(text(el))) {
          // An empty hiring upsell is not a user-authored draft. Keep it once edited.
          const fields = query('input,textarea,[contenteditable="true"]', el);
          if (!el.contains(document.activeElement) && fields.every(e => !('value' in e ? e.value : text(e)))) desired.add(el);
        }
      }
    }
    if (settings.network && page === 'network') for (const region of regions) for (const title of titles(region)) {
      if (NETWORK_TITLE.test(text(title))) hide(desired, moduleFor(title, region, 'network'));
    }
    if (settings.jobs && ['jobs','job-detail'].includes(page)) for (const region of regions) for (const title of titles(region)) {
      if (JOB_TITLE.test(text(title))) hide(desired, moduleFor(title, region, 'jobs'));
    }
    if (settings.ads) for (const el of query('iframe[src], [aria-label="advertisement"], [aria-label="Advertisement"], .ad-banner-container')) {
      if (el.matches('iframe') && !/^advertisement$/i.test(el.getAttribute('title') || '') && !/\/tscp-serving\//.test(el.getAttribute('src') || '')) continue;
      hide(desired, el);
    }
    if (settings.games) for (const el of query('[componentkey="feedRightNavGamesComponentRef"],#feedRightNavGamesComponentRef')) hide(desired, el);
  }
  function cleanNavigation(desired, page) {
    if (page === 'protected') return;
    for (const region of query('header,[role="banner"],aside,[role="complementary"]')) {
      for (const el of query('a[href],button,[role="button"]', region)) {
        if (protectedNode(el) || el.closest(CARD)) continue;
        const name = label(el), p = el.matches('a') ? pathOf(el) : '';
        if (settings.premium && (/^\/premium(?:\/|$)/.test(p) || /^(?:Start|Try|Get|Claim|Reactivate|Upgrade to|Unlock).*Premium|^(?:免费试用|免費試用|试用|試用|升级|升級).*Premium/i.test(name))) hide(desired, el);
        if (settings.business && /^(For Business|商务|商務|商业服务|商業服務)$/i.test(name) && el.closest('nav,[role="navigation"]')) hide(desired, el);
        if (settings.games && /^\/games(?:\/|$)/.test(p) && el.closest('nav,[role="navigation"]')) hide(desired, el);
      }
    }
  }
  function collapse(desired) {
    // Only anonymous single-purpose wrappers; never swallow a neighboring control/footer.
    for (const el of [...desired]) for (let p = el.parentElement, depth = 0; p && depth < 6; p = p.parentElement, depth++) {
      if (!p.matches('div,span') || p.hasAttribute('role') || p.matches(CARD) || owned(p) || p.querySelector(EDITOR)) break;
      if ([...p.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) break;
      const children = [...p.children].filter(e => !e.matches('style,script'));
      if (!children.length || !children.every(e => desired.has(e))) break;
      desired.add(p);
    }
  }
  const SORT_BUTTON = /^(?:Sort by:|排序方式[:：]|排序依据[:：]|排序依據[:：])/i;
  const RECENT = /^(?:Recent|最新|最近)(?:, selected|，已选中|，已選取)?$/i;
  function sortButton() { return query('button,[role="button"]').find(e => SORT_BUTTON.test(text(e)) && !e.closest(`${CARD},${PROTECTED}`)); }
  function wakeSort() { clearTimeout(sortTimer); sortTimer = setTimeout(schedule, 1300); }
  function selectRecent(page) {
    if (page !== 'home' || !settings.recent || sort.user || sort.done) return;
    const button = sortButton();
    if (!button) return;
    if (/Recent|最新|最近/i.test(text(button))) { sort.done = true; sort.stage = ''; return; }
    if (sort.stage === 'menu') {
      const item = query('[role="menuitem"],[role="menuitemradio"]')
        .find(e => RECENT.test(text(e)) && !e.closest(`${CARD},${PROTECTED}`));
      if (item) { sort.stage = 'selection'; sort.deadline = Date.now() + 1200; item.click(); wakeSort(); return; }
    }
    if (sort.stage && Date.now() < sort.deadline) return;
    if (sort.stage) {
      // Close only the native menu we opened; a missing option must not trap the page.
      if (sort.stage === 'menu' && sort.button?.getAttribute('aria-expanded') === 'true') sort.button.click();
      sort.stage = '';
    }
    if (sort.attempts >= 2 || button.getAttribute('aria-expanded') === 'true') return;
    sort.attempts++; sort.button = button; sort.stage = 'menu'; sort.deadline = Date.now() + 1200;
    button.click(); wakeSort(); schedule();
  }
  function noteUserSort(event) {
    if (!event.isTrusted || route() !== 'home') return;
    const el = event.target.closest?.('button,[role="button"],[role="menuitem"],[role="menuitemradio"]');
    if (el && (SORT_BUTTON.test(text(el)) || (el.closest('[role="menu"]') && /^(Top|Recent|最新|最近|热门|熱門)(?:, selected)?$/i.test(text(el))))) {
      sort.user = true; sort.stage = ''; clearTimeout(sortTimer);
    }
  }
  function updateEmpty(cards, page) {
    const homeCards = cards.filter(e => e.closest('main,[role="main"]'));
    const needed = page === 'home' && homeCards.length > 0 && homeCards.every(e => hidden.has(e));
    if (!needed) { empty?.remove(); return; }
    if (!empty) {
      empty = document.createElement('div'); empty.id = EMPTY; empty.setAttribute('role', 'status');
      const message = document.createElement('p'); message.textContent = '当前已加载的动态已被过滤。可以主动搜索、关注感兴趣的人，或调整过滤设置。';
      const button = document.createElement('button'); button.textContent = 'Pure LinkedIn 设置'; button.type = 'button'; button.addEventListener('click', openSettings);
      empty.append(message, button);
    }
    const primary = homeCards[0].closest('[role="region"],main,[role="main"]');
    if (primary && !empty.isConnected) primary.append(empty);
  }
  function ensureStyle() {
    if (document.getElementById('pure-linkedin-style')) return;
    const style = document.createElement('style'); style.id = 'pure-linkedin-style';
    style.textContent = `.${HIDDEN}{display:none!important}#${EMPTY}{font:14px/1.6 system-ui,sans-serif;padding:20px;margin:12px 0;border:1px solid #8885;border-radius:12px;background:Canvas;color:CanvasText}#${EMPTY} button{font:inherit;padding:6px 12px;border:1px solid #0a66c2;border-radius:16px;color:#0a66c2;background:Canvas;cursor:pointer}`;
    document.documentElement.append(style);
  }
  function apply() {
    frame = 0; if (stopped || !document.documentElement) return;
    observer?.disconnect();
    try {
      ensureStyle();
      if (lastURL !== location.href) { lastURL = location.href; sort = freshSort(); clearTimeout(sortTimer); }
      const page = route(), desired = new Set();
      selectRecent(page);
      const cards = page === 'protected' ? [] : cleanPosts(desired, page);
      cleanModules(desired, page); cleanNavigation(desired, page); collapse(desired);
      for (const el of hidden) if (!desired.has(el)) el.classList.remove(HIDDEN);
      for (const el of desired) if (!el.classList.contains(HIDDEN)) el.classList.add(HIDDEN);
      hidden = desired; updateEmpty(cards, page);
    } finally { observe(); }
  }
  // Bound full-page reconciliation during native feed loading and animation.
  function schedule() { if (!frame && !stopped) frame = setTimeout(apply, 100); }
  function observe() {
    if (!stopped && document.documentElement) observer?.observe(document.documentElement, {
      subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true,
      attributeFilter: ['componentkey','data-testid','data-urn','role','aria-selected','aria-expanded','aria-label','href','src','title','class','contenteditable']
    });
  }
  function ensureUI() {
    if (ui) {
      if (!ui.isConnected) { dialog.close(); document.body.append(ui); }
      return;
    }
    // LinkedIn sanitizes HTML string sinks, including ShadowRoot.innerHTML.
    // Build nodes directly and publish references only after initialization succeeds.
    const element = (tag, attrs = {}, content = '') => {
      const node = document.createElement(tag);
      for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
      if (content) node.textContent = content;
      return node;
    };
    const host = element('span', { id: UI }), shadow = host.attachShadow({ mode: 'open' });
    const style = element('style');
    style.textContent = `
      :host{font:14px/1.6 system-ui,sans-serif}*{box-sizing:border-box}
      dialog{color:var(--pure-linkedin-text,#24354b);background:var(--pure-linkedin-background,#fff);width:min(520px,calc(100vw - 32px));max-height:85vh;overflow:auto;border:1px solid #8886;border-radius:16px;padding:24px;font:14px/1.6 system-ui,sans-serif;box-shadow:0 20px 80px #0004}
      dialog::backdrop{background:#18202c88}h2{margin:0 0 8px;font-size:22px}p{margin:8px 0 16px}.grid{display:grid;gap:8px}
      label{display:flex;align-items:center;gap:10px;padding:7px;border-radius:6px;background:#8881}input{accent-color:#1d9bf0;width:16px;height:16px}
      button{font:inherit;color:inherit;background:transparent;border:1px solid #8887;border-radius:8px;padding:7px 13px;cursor:pointer}
      button:focus-visible,input:focus-visible{outline:3px solid #1d9bf0;outline-offset:2px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.save{margin-left:auto;background:#0879c6;color:#fff}.note{font-size:12px;opacity:.8}.status{min-height:22px}.error{color:#d25536}
      @media(prefers-color-scheme:dark){dialog{color:var(--pure-linkedin-text,#eee);background:var(--pure-linkedin-background,#242424)}}
    `;
    const panel = element('dialog', { 'aria-labelledby': 'pl-title' });
    const form = element('form'), grid = element('div', { class: 'grid' });
    const actions = element('div', { class: 'actions' });
    const reset = element('button', { type: 'button', class: 'reset' }, '恢复默认');
    const cancel = element('button', { type: 'button', class: 'cancel' }, '取消');
    const submit = element('button', { type: 'submit', class: 'save' }, '保存');
    const message = element('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
    actions.append(reset, cancel, submit);
    form.append(grid, element('p', { class: 'note' }, '保留主动转发与未知来源。Recent 不等于纯关注流；搜索与管理功能仍可使用。关闭 Recent 不会主动切回 Top。'), actions, message);
    panel.append(element('h2', { id: 'pl-title' }, 'Pure LinkedIn'), element('p', {}, '让关注成为首页，让浏览由你决定。'), form);
    shadow.append(style, panel);
    for (const [key, title] of OPTIONS) {
      const row = document.createElement('label'), input = document.createElement('input');
      input.type = 'checkbox'; input.name = key; row.append(input, document.createTextNode(title)); grid.append(row);
    }
    cancel.addEventListener('click', () => panel.close());
    panel.addEventListener('cancel', event => { event.preventDefault(); panel.close(); });
    reset.addEventListener('click', () => { fill(defaults); setStatus('已填入默认选项，保存后生效。'); });
    form.addEventListener('submit', save);
    let outsideDown = false;
    const outside = e => { const r = panel.getBoundingClientRect(); return e.target === panel && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom); };
    panel.addEventListener('pointerdown', e => { outsideDown = outside(e); });
    panel.addEventListener('click', e => { if (outsideDown && outside(e)) panel.close(); outsideDown = false; });
    panel.addEventListener('close', () => lastFocus?.focus?.());
    document.body.append(host);
    ui = host; dialog = panel; status = message;
  }
  function fill(value) { query('input', ui.shadowRoot).forEach(e => { e.checked = value[e.name]; }); }
  function setStatus(message, error = false) { status.textContent = message; status.classList.toggle('error', error); }
  function openSettings() {
    if (!document.body) { document.addEventListener('DOMContentLoaded', openSettings, { once: true }); return; }
    ensureUI();
    if (dialog.open) return;
    lastFocus = document.activeElement; fill(settings); setStatus(''); dialog.showModal();
  }
  async function save(event) {
    event.preventDefault(); if (saving) return;
    const next = normalize(Object.fromEntries(query('input', ui.shadowRoot).map(e => [e.name, e.checked])));
    saving = true;
    query('button,input', ui.shadowRoot).forEach(e => { e.disabled = true; });
    try {
      if (typeof GM_setValue !== 'function') throw new Error('Storage unavailable');
      await GM_setValue(KEY, next);
      settings = next; schedule(); setStatus('已保存；支持的油猴管理器会同步到其他 LinkedIn 标签页。');
    } catch (_) { setStatus('保存失败，当前规则未改变。请检查油猴存储后重试。', true); }
    finally { saving = false; query('button,input', ui.shadowRoot).forEach(e => { e.disabled = false; }); }
  }
  function start() {
    stopped = false;
    if (!document.documentElement) { document.addEventListener('DOMContentLoaded', start, { once: true }); return; }
    observer ||= new MutationObserver(records => {
      if (records.some(r => {
        const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        if (!el || owned(el) || el.closest('video,canvas,[aria-label="Video Player"],[contenteditable="true"],textarea')) return false;
        if (r.type === 'attributes' && r.attributeName === 'class') {
          const semantic = value => (value || '').split(/\s+/).filter(c => /^(feed-shared-update-v2|update-components-actor|update-components-actor__sub-description|update-components-text|feed-shared-update-v2__description|ad-banner-container|msg-overlay-container|comments-comments-list)$/.test(c)).sort().join(' ');
          return semantic(r.oldValue) !== semantic(el.getAttribute('class')) || hidden.has(el) && !el.classList.contains(HIDDEN);
        }
        return true;
      })) schedule();
    });
    observe(); schedule(); clearInterval(timer);
    timer = setInterval(() => { if (lastURL !== location.href) schedule(); }, 500);
  }
  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('Pure LinkedIn：设置', openSettings);
      GM_registerMenuCommand('Pure LinkedIn：重新应用规则', schedule);
    }
    if (typeof GM_addValueChangeListener === 'function') GM_addValueChangeListener(KEY, (_key, _old, value, remote) => {
      if (!remote) return;
      settings = normalize(value); schedule();
      if (dialog?.open) setStatus('其他页面已更新设置。当前草稿保留；重开可载入，保存会覆盖为当前选项。');
    });
  } catch (error) { console.warn('[Pure LinkedIn] 菜单或同步不可用', error); }
  document.addEventListener('click', noteUserSort, true);
  document.addEventListener('input', schedule, true);
  document.addEventListener('focusin', schedule, true);
  window.addEventListener('popstate', schedule); window.addEventListener('hashchange', schedule);
  window.addEventListener('pagehide', () => { stopped = true; observer?.disconnect(); clearInterval(timer); clearTimeout(sortTimer); clearTimeout(frame); frame = 0; });
  window.addEventListener('pageshow', () => { if (stopped) start(); else schedule(); });
  start();
})();
