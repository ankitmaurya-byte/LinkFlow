// Breadcrumbs component

class Breadcrumbs {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render(breadcrumbs, onNavigate) {
    if (!breadcrumbs || breadcrumbs.length === 0) {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = 'flex';
    this.container.innerHTML = '';

    breadcrumbs.forEach((crumb, index) => {
      // Add separator (except for first item)
      if (index > 0) {
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.textContent = '/';
        this.container.appendChild(separator);
      }

      // Add breadcrumb link or current
      if (index === breadcrumbs.length - 1) {
        // Current location (not clickable)
        const current = document.createElement('span');
        current.className = 'breadcrumb-current';
        current.textContent = crumb.name;
        this.container.appendChild(current);
      } else {
        // Clickable parent
        const link = document.createElement('button');
        link.className = 'breadcrumb-link';
        link.textContent = crumb.name;
        link.addEventListener('click', () => {
          if (onNavigate) {
            onNavigate(crumb.tabId, crumb.folderId);
          }
        });
        this.container.appendChild(link);
      }
    });
  }

  hide() {
    this.container.style.display = 'none';
  }
}
