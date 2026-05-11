# urlgram - Firefox Browser Extension

A modern, clean Firefox extension for managing and organizing links with folders, tabs, and an AI-powered research playground.

## Features

### 🔖 Link Management
- **One-Click Save**: Save current browser tab with auto-platform detection
- **Custom URLs**: Paste and save any URL with custom names
- **Platform Detection**: Automatically detects LinkedIn, GitHub, Figma, Twitter, YouTube, and more
- **Click to Copy**: Click any URL to copy it to clipboard
- **Click to Open**: Click any link card to open in new tab

### 📁 Organization
- **Tabs System**: Organize links into All Links, Work, Personal, and Inspiration tabs
- **Nested Folders**: Create folders within folders for deep organization
- **Breadcrumb Navigation**: Easy navigation through folder hierarchy
- **Smart Search**: Real-time search across all links and folders

### 🎨 Beautiful UI
- Soft violet/blue color scheme
- Rounded cards with soft shadows
- Smooth animations and transitions
- Responsive and intuitive design
- Clean typography and spacing

### 🔬 Playground Features
- **AI Research Mode**: Analyze companies and websites (mock implementation)
- **Friends & Groups**: Collaborate with others
- **Link Sharing**: Share links with friends and groups
- **Multiple Research Modes**: Company analysis, product summary, tech stack extraction, opportunity suggestions

### 📊 Dashboard
- Full-page view with enhanced layout
- Grid and List view modes
- Advanced sorting (Recent, Name, Platform)
- Bulk operations support
- Enhanced workspace for power users

## Installation

### For Development

1. **Clone or copy** the extension to your local machine

2. **Open Firefox** and navigate to `about:debugging`

3. Click **"This Firefox"** in the left sidebar

4. Click **"Load Temporary Add-on..."**

5. Navigate to the extension folder and select the `manifest.json` file

6. The extension icon should appear in your toolbar!

### Using the Extension

1. **Click the urlgram icon** in your toolbar to open the popup

2. **Save the current tab**: Click "+ Save Current Tab" to save the active browser tab

3. **Organize with tabs**: Switch between All Links, Work, Personal, and Inspiration

4. **Create folders**: Click "New Folder" to organize links into categories

5. **Search**: Use the search bar to quickly find links

6. **Open Playground**: Click "🔬 Open Playground" to access AI research features

7. **Open Dashboard**: Click "Open Dashboard →" in the footer for the full-page view

## Project Structure

```
bookmark-manager/
├── manifest.json           # Extension configuration
├── background.js           # Background service worker
├── icons/                  # Extension icons
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── lib/                    # Core utilities
│   ├── storage.js         # Storage management layer
│   └── platform-detector.js # URL platform detection
├── components/             # Reusable UI components
│   ├── modal.js           # Modal management
│   ├── breadcrumbs.js     # Breadcrumb navigation
│   ├── link-card.js       # Link card component
│   └── folder-card.js     # Folder card component
├── popup/                  # Extension popup (main UI)
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── playground/             # AI research playground
│   ├── playground.html
│   ├── playground.css
│   └── playground.js
└── dashboard/              # Full-page dashboard
    ├── dashboard.html
    ├── dashboard.css
    └── dashboard.js
```

## Technical Details

### Storage
- Uses Firefox's `browser.storage.local` API
- Data persists across browser sessions
- Structured schema for tabs, folders, and links
- Automatic view state preservation

### Platform Detection
Automatically detects and categorizes links:
- LinkedIn (profiles, companies, posts)
- GitHub (repositories, profiles)
- Figma (design files)
- Twitter/X
- YouTube
- Generic websites

### Data Schema
```javascript
{
  tabs: [{ id, name, count }],
  folders: { [tabId]: [{ id, name, parentId, tabId }] },
  links: { [tabId]: [{ id, title, url, platform, folderId, tabId, createdAt }] },
  currentView: { tabId, folderId, breadcrumbs }
}
```

## Keyboard Shortcuts
- **ESC**: Close any open modal
- **Enter**: Submit forms in modals
- **Tab Navigation**: Fully keyboard accessible

## Future Enhancements

### Planned Features
- [ ] Real AI integration (OpenAI/Anthropic API)
- [ ] Link tags and labels
- [ ] Bulk operations (select multiple links)
- [ ] Import/Export functionality
- [ ] Cloud sync across devices
- [ ] Browser history integration
- [ ] Link preview thumbnails
- [ ] Collaborative folder sharing
- [ ] Custom themes

### AI Playground
Currently shows mock responses. To integrate real AI:
1. Choose an AI provider (OpenAI, Anthropic, etc.)
2. Add API key configuration in settings
3. Update `playground.js` to make real API calls
4. Add proper error handling and rate limiting

## Browser Compatibility
- **Primary**: Firefox (Manifest V3)
- **Potential**: Chrome/Edge (minor adjustments needed)

## Development

### Tech Stack
- Pure JavaScript (no frameworks)
- Modern CSS with CSS Variables
- Firefox WebExtension APIs
- Manifest V3

### Design Principles
- Zero dependencies
- Fast and lightweight
- Keyboard-friendly
- Accessible UI
- Clean, maintainable code

## Support

For issues or questions, please refer to the Mozilla Add-ons Developer Hub or Firefox Extension documentation.

## License

This extension is provided as-is for personal use.

---

**Built with 💜 by Antigravity**

Enjoy organizing your links with urlgram!
