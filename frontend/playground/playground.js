// Playground Controller

class PlaygroundController {
  constructor() {
    this.currentView = 'research';
    this.currentResearchMode = 'analyze';
    this.init();
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchView(btn.dataset.view);
      });
    });

    // Back button
    document.getElementById('backToPopupBtn').addEventListener('click', () => {
      window.close();
    });

    // Research mode selection
    document.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentResearchMode = btn.dataset.mode;
      });
    });

    // Start research
    document.getElementById('startResearchBtn').addEventListener('click', () => {
      this.startResearch();
    });

    // Friends & Groups
    document.getElementById('addFriendBtn')?.addEventListener('click', () => {
      modalManager.open('addFriendModal');
    });

    document.getElementById('createGroupBtn')?.addEventListener('click', () => {
      modalManager.open('createGroupModal');
    });

    document.getElementById('saveFriendBtn')?.addEventListener('click', () => {
      this.addFriend();
    });

    document.getElementById('saveGroupBtn')?.addEventListener('click', () => {
      this.createGroup();
    });

    // Share links
    document.getElementById('sendShareBtn')?.addEventListener('click', () => {
      this.shareLink();
    });
  }

  switchView(viewName) {
    this.currentView = viewName;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });

    // Update views
    document.querySelectorAll('.view').forEach(view => {
      view.classList.add('hidden');
    });

    const targetView = document.getElementById(`${viewName}View`);
    if (targetView) {
      targetView.classList.remove('hidden');
    }
  }

  async startResearch() {
    const urlInput = document.getElementById('companyUrl');
    const url = urlInput.value.trim();

    if (!url) {
      urlInput.focus();
      return;
    }

    const resultsContainer = document.getElementById('researchResults');

    // Clear previous results
    resultsContainer.innerHTML = '';

    // Add user message
    this.addChatMessage('user', `Analyze: ${url} (Mode: ${this.currentResearchMode})`);

    // Show loading
    this.addChatMessage('ai', 'Analyzing...', true);

    // Simulate AI response (mock)
    setTimeout(() => {
      this.removeLoadingMessage();
      this.generateMockResponse(url, this.currentResearchMode);
    }, 2000);
  }

  addChatMessage(sender, content, isLoading = false) {
    const resultsContainer = document.getElementById('researchResults');

    const message = document.createElement('div');
    message.className = 'chat-message';

    const icon = sender === 'user' ? '👤' : '🤖';
    const senderLabel = sender === 'user' ? 'You' : 'AI Assistant';

    const header = document.createElement('div');
    header.className = 'message-header';
    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon;
    const labelSpan = document.createElement('span');
    labelSpan.textContent = senderLabel;
    header.append(iconSpan, labelSpan);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (isLoading) {
      const dots = document.createElement('div');
      dots.className = 'loading-dots';
      dots.append(
        document.createElement('span'),
        document.createElement('span'),
        document.createElement('span')
      );
      contentDiv.appendChild(dots);
      message.dataset.loading = 'true';
    } else {
      contentDiv.textContent = content;
    }

    message.append(header, contentDiv);

    resultsContainer.appendChild(message);
    resultsContainer.scrollTop = resultsContainer.scrollHeight;
  }

  removeLoadingMessage() {
    const loading = document.querySelector('[data-loading="true"]');
    if (loading) {
      loading.remove();
    }
  }

  generateMockResponse(url, mode) {
    let response = '';

    switch (mode) {
      case 'analyze':
        response = `**Company Analysis for ${url}:**\n\n`;
        response += `• Industry: Technology/Software\n`;
        response += `• Target Market: B2B SaaS\n`;
        response += `• Key Features: Cloud-based platform, collaborative tools\n`;
        response += `• Business Model: Subscription-based\n`;
        response += `• Competitive Advantages: User-friendly interface, strong integration ecosystem\n\n`;
        response += `This appears to be a well-established company with a focus on enterprise solutions.`;
        break;

      case 'summarize':
        response = `**Product Summary:**\n\n`;
        response += `The product is a comprehensive platform designed to help teams collaborate efficiently. `;
        response += `It offers features like real-time editing, task management, and seamless integrations with popular tools. `;
        response += `The platform is built for scalability and is suitable for teams of all sizes.`;
        break;

      case 'techstack':
        response = `**Estimated Tech Stack:**\n\n`;
        response += `Frontend:\n`;
        response += `• React.js or Vue.js\n`;
        response += `• TypeScript\n`;
        response += `• Modern CSS framework\n\n`;
        response += `Backend:\n`;
        response += `• Node.js or Python\n`;
        response += `• PostgreSQL or MongoDB\n`;
        response += `• Redis for caching\n\n`;
        response += `Infrastructure:\n`;
        response += `• AWS or Google Cloud\n`;
        response += `• Docker/Kubernetes\n`;
        response += `• CDN for static assets`;
        break;

      case 'opportunities':
        response = `**Potential Opportunities:**\n\n`;
        response += `1. **Partnership**: Integrate your product with their platform\n`;
        response += `2. **Job Opportunities**: They appear to be growing - check their careers page\n`;
        response += `3. **Learning**: Study their UX patterns for inspiration\n`;
        response += `4. **Market Gap**: Consider building complementary tools for their ecosystem\n`;
        response += `5. **Investment**: If they're fundraising, this could be an opportunity for investors`;
        break;

      default:
        response = 'Analysis complete. Please select a research mode.';
    }

    // Format response with basic markdown support
    const formattedResponse = response
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    this.addChatMessage('ai', formattedResponse);
  }

  addFriend() {
    const emailInput = document.getElementById('friendEmail');
    const email = emailInput.value.trim();

    if (!email) {
      emailInput.focus();
      return;
    }

    // Mock: Add friend (would normally save to storage)
    alert(`Friend request sent to ${email}`);
    modalManager.close('addFriendModal');
  }

  createGroup() {
    const nameInput = document.getElementById('groupName');
    const name = nameInput.value.trim();

    if (!name) {
      nameInput.focus();
      return;
    }

    // Mock: Create group
    alert(`Group "${name}" created successfully!`);
    modalManager.close('createGroupModal');
  }

  shareLink() {
    const linkInput = document.getElementById('shareLink');
    const recipientSelect = document.getElementById('shareRecipient');
    const messageInput = document.getElementById('shareMessage');

    const link = linkInput.value.trim();
    const recipient = recipientSelect.value;
    const message = messageInput.value.trim();

    if (!link || !recipient) {
      if (!link) linkInput.focus();
      else if (!recipient) recipientSelect.focus();
      return;
    }

    // Mock: Share link
    alert(`Link shared with ${recipientSelect.options[recipientSelect.selectedIndex].text}`);

    // Clear form
    linkInput.value = '';
    messageInput.value = '';
    recipientSelect.value = '';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new PlaygroundController();
});
