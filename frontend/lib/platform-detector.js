// Platform detection and metadata extraction

const PlatformDetector = {
  PLATFORMS: {
    LINKEDIN: 'linkedin',
    GITHUB: 'github',
    FIGMA: 'figma',
    TWITTER: 'twitter',
    YOUTUBE: 'youtube',
    WEBSITE: 'website'
  },

  detect(url) {
    const urlLower = url.toLowerCase();

    if (urlLower.includes('linkedin.com')) {
      return this.PLATFORMS.LINKEDIN;
    }
    if (urlLower.includes('github.com')) {
      return this.PLATFORMS.GITHUB;
    }
    if (urlLower.includes('figma.com')) {
      return this.PLATFORMS.FIGMA;
    }
    if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
      return this.PLATFORMS.TWITTER;
    }
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      return this.PLATFORMS.YOUTUBE;
    }

    return this.PLATFORMS.WEBSITE;
  },

  getIcon(platform) {
    const icons = {
      [this.PLATFORMS.LINKEDIN]: '💼',
      [this.PLATFORMS.GITHUB]: '🐙',
      [this.PLATFORMS.FIGMA]: '🎨',
      [this.PLATFORMS.TWITTER]: '🐦',
      [this.PLATFORMS.YOUTUBE]: '▶️',
      [this.PLATFORMS.WEBSITE]: '🌐'
    };

    return icons[platform] || icons[this.PLATFORMS.WEBSITE];
  },

  extractTitle(url, pageTitle = '') {
    if (pageTitle && pageTitle !== 'undefined' && pageTitle.trim() !== '') {
      return pageTitle;
    }

    const platform = this.detect(url);

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace('www.', '');
      const path = urlObj.pathname;

      if (platform === this.PLATFORMS.GITHUB) {
        const parts = path.split('/').filter(p => p);
        if (parts.length >= 2) {
          return `${parts[0]}/${parts[1]}`;
        }
      }

      if (platform === this.PLATFORMS.LINKEDIN) {
        if (path.includes('/in/')) {
          return 'LinkedIn Profile';
        }
        if (path.includes('/company/')) {
          return 'LinkedIn Company';
        }
        if (path.includes('/posts/')) {
          return 'LinkedIn Post';
        }
      }

      // Default: use hostname
      return hostname;
    } catch (e) {
      return url.substring(0, 50);
    }
  },

  getPlatformColor(platform) {
    const colors = {
      [this.PLATFORMS.LINKEDIN]: '#0A66C2',
      [this.PLATFORMS.GITHUB]: '#181717',
      [this.PLATFORMS.FIGMA]: '#F24E1E',
      [this.PLATFORMS.TWITTER]: '#1DA1F2',
      [this.PLATFORMS.YOUTUBE]: '#FF0000',
      [this.PLATFORMS.WEBSITE]: '#6B7280'
    };

    return colors[platform] || colors[this.PLATFORMS.WEBSITE];
  }
};
