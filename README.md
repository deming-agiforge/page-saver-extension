# Page Saver - Screenshot & Download

A powerful Chrome extension for saving web content - screenshots, full-page captures, HTML archives, and images.

![Version](https://img.shields.io/badge/version-1.6.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![License](https://img.shields.io/badge/license-MIT-orange)

## Features

### ✂️ Area Screenshot
Select any rectangular area on the page to capture. Perfect for:
- Capturing specific elements
- Cropping out unwanted parts
- Quick partial screenshots

### 📷 Visible Screenshot
Capture the visible area of any webpage instantly as a PNG image.

### 📜 Full Screenshot
Automatically scroll and stitch together a complete full-page capture. Handles:
- Fixed/sticky headers
- Custom scroll containers
- Dynamic content

### 📁 Save Pages (HTML Archive)
Download the current page and all linked pages within the same URL path:
- Preserves directory structure
- Removes scripts to prevent redirect issues
- Configurable depth and page limits

### 🖼️ Save Images
Extract and download all images from a webpage:
- Smart deduplication (different sizes of same image = one download)
- Optional minimum size filter
- Supports img tags and CSS backgrounds
- Handles cross-origin images

## Installation

### From Chrome Web Store
[Coming soon]

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `universal-page-saver` folder

## Usage

1. Navigate to any webpage
2. Click the Page Saver icon in your toolbar
3. Choose your action:
   - **Area Screenshot** - Select and capture a region
   - **Visible Screenshot** - Capture visible area
   - **Full Screenshot** - Capture entire page
   - **Save Pages** - Download HTML pages
   - **Save Images** - Download all images

## File Structure

```
universal-page-saver/
├── manifest.json        # Extension configuration
├── popup.html           # Popup UI
├── popup.js             # Main logic
├── background.js        # Service worker for area screenshot
├── content.js           # Content script
├── icon-16.png          # Toolbar icon
├── icon-48.png          # Extension management icon
├── icon-128.png         # Chrome Web Store icon
├── PRIVACY_POLICY.md    # Privacy policy
├── STORE_LISTING.md     # Chrome Web Store listing materials
└── README.md            # This file
```

## Permissions

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access current tab for screenshots |
| `downloads` | Save files to your computer |
| `scripting` | Execute scripts for full-page capture |
| `storage` | Remember last capture info |

## Privacy

Page Saver respects your privacy:
- ✅ No data collection
- ✅ No tracking or analytics
- ✅ All processing is local
- ✅ No external servers

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for details.

## Development

### Requirements
- Chrome 88+ (Manifest V3 support)

### Testing
1. Load the extension in developer mode
2. Make changes to the code
3. Click the refresh button in `chrome://extensions/`

## Changelog

### v1.6.0
- Added Area Screenshot feature with drag-to-select
- Uses background service worker for reliable capture
- Shows selection dimensions in real-time
- Press ESC to cancel selection

### v1.5.x
- Area Screenshot UI implementation
- Debug and testing versions

### v1.4.5
- Added multi-size icons for Chrome Web Store
- Improved extension metadata
- Added privacy policy and store listing materials

### v1.4.4
- Changed default image size filter to "No limit"
- CSS backgrounds unchecked by default

### v1.4.3
- Fixed cross-origin image downloads
- Smart fallback for blocked images

### v1.4.2
- Added failed URL logging for debugging

### v1.4.1
- Fixed image deduplication
- Clean URLs (remove size parameters) for original quality

### v1.4.0
- Added Save Images feature
- Image size filtering
- CSS background extraction

### v1.3.0
- Renamed to Page Saver
- Updated UI with tooltips
- Prepared Save Images button

### v1.2.x
- Save Pages (HTML Archive) feature
- Directory structure preservation
- Script removal for offline viewing

### v1.1.x
- Full page screenshot
- Fixed header detection
- Scroll container support

### v1.0.0
- Initial release
- Basic screenshot functionality

## License

MIT License - feel free to use and modify.

## Support

For issues and feature requests, please open an issue on GitHub.
