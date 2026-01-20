// Folder Card Component

function createFolderCard(folder, itemCount = 0, onClick) {
  const card = document.createElement('div');
  card.className = 'card folder-card';
  card.dataset.folderId = folder.id;

  card.innerHTML = `
    <div class="folder-icon">📁</div>
    <div class="folder-content">
      <div class="folder-name">${escapeHtml(folder.name)}</div>
      <div class="folder-count">${itemCount} item${itemCount !== 1 ? 's' : ''}</div>
    </div>
    <div class="folder-arrow">→</div>
  `;

  card.addEventListener('click', () => {
    if (onClick) {
      onClick(folder);
    }
  });

  return card;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
