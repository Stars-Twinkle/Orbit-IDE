// 把设置弹窗改造成两栏：左侧分类 + 右侧独立滚动。
(function () {
  let activeTitle = '常用设置';
  let query = '';

  function sectionTitle(section) {
    return section.querySelector('.settings-section-title')?.textContent?.trim() || '设置';
  }

  function applyFilter(root) {
    if (!root) return;
    const sections = [...root.querySelectorAll('.settings-section')];
    const needle = query.trim().toLowerCase();
    let visibleSections = 0;
    for (const section of sections) {
      const title = sectionTitle(section);
      const rows = [...section.querySelectorAll('.setting-row')];
      let titleMatch = title.toLowerCase().includes(needle);
      if (!needle) {
        const active = activeTitle === '常用设置' || title === activeTitle;
        section.classList.toggle('hidden', !active);
        for (const row of rows) row.classList.remove('hidden');
        if (active) visibleSections += 1;
        continue;
      }
      let rowMatches = 0;
      for (const row of rows) {
        const match = titleMatch || row.textContent.toLowerCase().includes(needle);
        row.classList.toggle('hidden', !match);
        if (match) rowMatches += 1;
      }
      const show = titleMatch || rowMatches > 0;
      section.classList.toggle('hidden', !show);
      if (show) visibleSections += 1;
    }
    let empty = root.querySelector('.settings-empty');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'settings-empty';
      empty.textContent = '没有匹配的设置';
      root.append(empty);
    }
    empty.classList.toggle('hidden', visibleSections > 0);
  }

  function enhance() {
    const grid = document.querySelector('.modal-body > .settings-grid');
    if (!grid) return;
    const modal = grid.closest('.modal');
    if (!modal || modal.dataset.settingsLayout === '1') return;
    modal.dataset.settingsLayout = '1';
    modal.classList.add('settings-layout');

    const sections = [...grid.children].filter((node) => node.classList?.contains('settings-section'));
    if (!sections.length) return;

    const shell = document.createElement('div');
    shell.className = 'settings-shell';

    const nav = document.createElement('aside');
    nav.className = 'settings-nav';
    nav.innerHTML = `<div class="settings-search">⌕<input id="settingsSearch" type="text" placeholder="搜索设置" spellcheck="false" /></div><div class="settings-nav-scroll" id="settingsNavScroll"></div>`;

    const main = document.createElement('section');
    main.className = 'settings-main';
    main.innerHTML = `<div class="settings-content-head"><h2 id="settingsTitle">常用设置</h2><span>调整编码体验与运行环境</span></div><div class="settings-scroll" id="settingsScroll"></div>`;

    const navScroll = nav.querySelector('#settingsNavScroll');
    const scroll = main.querySelector('#settingsScroll');
    const titleNode = main.querySelector('#settingsTitle');
    const navItems = [{ title: '常用设置', section: null }, ...sections.map((section) => ({ title: sectionTitle(section), section }))];

    navItems.forEach((entry, index) => {
      if (index === 0) {
        const group = document.createElement('div');
        group.className = 'settings-nav-title';
        group.textContent = '设置';
        navScroll.append(group);
      }
      const button = document.createElement('button');
      button.className = `settings-nav-item${entry.title === activeTitle ? ' active' : ''}`;
      button.textContent = entry.title;
      button.dataset.title = entry.title;
      button.addEventListener('click', () => {
        activeTitle = entry.title;
        query = '';
        const search = nav.querySelector('#settingsSearch');
        if (search) search.value = '';
        titleNode.textContent = activeTitle;
        for (const other of navScroll.querySelectorAll('.settings-nav-item')) {
          other.classList.toggle('active', other === button);
        }
        applyFilter(scroll);
        scroll.scrollTop = 0;
      });
      navScroll.append(button);
    });

    for (const section of sections) scroll.append(section);
    shell.append(nav, main);
    grid.replaceWith(shell);

    nav.querySelector('#settingsSearch').addEventListener('input', (event) => {
      query = event.target.value;
      applyFilter(scroll);
      scroll.scrollTop = 0;
    });
    applyFilter(scroll);
  }

  const observer = new MutationObserver(() => enhance());
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(enhance, 0);
})();
