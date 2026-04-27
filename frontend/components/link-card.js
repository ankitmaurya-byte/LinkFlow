// Link Card Component

function createLinkCard(link, callbacks = {}) {
  const card = document.createElement('div');
  card.className = 'card link-card';
  card.dataset.linkId = link.id;

  const icon = PlatformDetector.getIcon(link.platform);

  const iconDiv = document.createElement('div');
  iconDiv.className = 'link-icon';
  iconDiv.textContent = icon;

  const content = document.createElement('div');
  content.className = 'link-content';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'link-title';
  titleDiv.textContent = link.title;

  const urlSpan = document.createElement('span');
  urlSpan.className = 'link-url';
  urlSpan.dataset.url = link.url;
  urlSpan.title = 'Click to copy';
  urlSpan.textContent = truncateUrl(link.url);

  content.append(titleDiv, urlSpan);

  const actions = document.createElement('div');
  actions.className = 'link-actions';
  const menuBtn = document.createElement('button');
  menuBtn.className = 'menu-btn';
  menuBtn.dataset.linkId = link.id;
  menuBtn.textContent = '⋮';
  actions.appendChild(menuBtn);

  card.append(iconDiv, content, actions);

  // Click on card to open link
  card.addEventListener('click', (e) => {
    // Don't open if clicking URL or menu
    if (e.target.classList.contains('link-url') ||
      e.target.classList.contains('menu-btn') ||
      e.target.closest('.dropdown-menu')) {
      return;
    }

    if (callbacks.onOpen) {
      callbacks.onOpen(link);
    } else {
      browser.tabs.create({ url: link.url });
    }
  });

  // Click on URL to copy
  const urlElement = card.querySelector('.link-url');
  urlElement.addEventListener('click', async (e) => {
    e.stopPropagation();
    const url = e.target.dataset.url;

    try {
      await navigator.clipboard.writeText(url);

      // Visual feedback
      const originalText = e.target.textContent;
      e.target.textContent = '✓ Copied!';
      e.target.style.color = 'var(--success)';

      setTimeout(() => {
        e.target.textContent = originalText;
        e.target.style.color = '';
      }, 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback for Firefox
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);

      const originalText = e.target.textContent;
      e.target.textContent = '✓ Copied!';
      setTimeout(() => {
        e.target.textContent = originalText;
      }, 1500);
    }
  });

  // Menu button
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showLinkMenu(e.target, link, callbacks);
  });

  return card;
}

function showLinkMenu(button, link, callbacks) {
  // Remove any existing menus
  document.querySelectorAll('.dropdown-menu').forEach(menu => menu.remove());

  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  menu.innerHTML = `
    <button class="dropdown-item" data-action="rename">✏️ Rename</button>
    <button class="dropdown-item" data-action="move">📁 Move to...</button>
    <button class="dropdown-item danger" data-action="delete">🗑️ Delete</button>
  `;

  // Position menu
  const card = button.closest('.card');
  card.appendChild(menu);

  // Prevent card click
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Handle menu actions
  menu.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;

      if (action === 'rename' && callbacks.onRename) {
        callbacks.onRename(link);
      } else if (action === 'move' && callbacks.onMove) {
        callbacks.onMove(link);
      } else if (action === 'delete' && callbacks.onDelete) {
        callbacks.onDelete(link);
      }

      menu.remove();
    });
  });

  // Close menu on outside click
  setTimeout(() => {
    const closeMenu = (e) => {
      if (!menu.contains(e.target) && e.target !== button) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    document.addEventListener('click', closeMenu);
  }, 0);
}

function truncateUrl(url, maxLength = 45) {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + '...';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
