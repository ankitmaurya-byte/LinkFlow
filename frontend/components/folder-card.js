// Folder Card Component

function createFolderCard(folder, itemCount = 0, onClick) {
  const card = document.createElement('div');
  card.className = 'card folder-card';
  card.dataset.folderId = folder.id;

  const iconDiv = document.createElement('div');
  iconDiv.className = 'folder-icon';
  iconDiv.textContent = '📁';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'folder-content';

  const nameDiv = document.createElement('div');
  nameDiv.className = 'folder-name';
  nameDiv.textContent = folder.name;

  const countDiv = document.createElement('div');
  countDiv.className = 'folder-count';
  countDiv.textContent = `${itemCount} item${itemCount !== 1 ? 's' : ''}`;

  contentDiv.append(nameDiv, countDiv);

  const arrowDiv = document.createElement('div');
  arrowDiv.className = 'folder-arrow';
  arrowDiv.textContent = '→';

  card.append(iconDiv, contentDiv, arrowDiv);

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
