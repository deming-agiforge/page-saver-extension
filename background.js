// Background Service Worker for Page Saver
// Handles area screenshot capture since popup closes when user clicks on page

console.log('[PageSaver BG] Service worker started');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startAreaCapture') {
    console.log('[PageSaver BG] Starting area capture for tab:', message.tabId);
    handleAreaCapture(message.tabId, message.windowId);
    sendResponse({ started: true });
  }
  return true;
});

async function handleAreaCapture(tabId, windowId) {
  console.log('[PageSaver BG] Injecting overlay...');
  
  // Inject the area selection overlay - the function body is executed in page context
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Clean up any existing overlay
      ['__pageSaverOverlay', '__pageSaverSelection', '__pageSaverDimension', '__pageSaverInstruction'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
      
      // Create overlay container
      const container = document.createElement('div');
      container.id = '__pageSaverOverlay';
      container.setAttribute('style', [
        'position: fixed !important',
        'top: 0 !important',
        'left: 0 !important',
        'right: 0 !important',
        'bottom: 0 !important',
        'width: 100vw !important',
        'height: 100vh !important',
        'background-color: rgba(0, 0, 0, 0.5) !important',
        'z-index: 2147483646 !important',
        'cursor: crosshair !important',
        'margin: 0 !important',
        'padding: 0 !important',
        'border: none !important',
        'box-sizing: border-box !important',
        'display: block !important'
      ].join('; '));
      
      // Selection box
      const selectionBox = document.createElement('div');
      selectionBox.id = '__pageSaverSelection';
      selectionBox.setAttribute('style', [
        'position: fixed !important',
        'display: none !important',
        'border: 2px dashed #ffffff !important',
        'background-color: rgba(66, 133, 244, 0.2) !important',
        'z-index: 2147483647 !important',
        'pointer-events: none !important',
        'box-sizing: border-box !important'
      ].join('; '));
      
      // Dimension label
      const dimensionLabel = document.createElement('div');
      dimensionLabel.id = '__pageSaverDimension';
      dimensionLabel.setAttribute('style', [
        'position: fixed !important',
        'display: none !important',
        'background-color: #4285f4 !important',
        'color: white !important',
        'padding: 4px 8px !important',
        'font-size: 12px !important',
        'font-family: monospace !important',
        'border-radius: 4px !important',
        'z-index: 2147483647 !important',
        'pointer-events: none !important'
      ].join('; '));
      
      // Instruction label
      const instructionLabel = document.createElement('div');
      instructionLabel.id = '__pageSaverInstruction';
      instructionLabel.setAttribute('style', [
        'position: fixed !important',
        'top: 20px !important',
        'left: 50% !important',
        'transform: translateX(-50%) !important',
        'background-color: rgba(0, 0, 0, 0.85) !important',
        'color: white !important',
        'padding: 12px 24px !important',
        'font-size: 14px !important',
        'font-family: -apple-system, BlinkMacSystemFont, sans-serif !important',
        'border-radius: 8px !important',
        'z-index: 2147483647 !important',
        'pointer-events: none !important',
        'white-space: nowrap !important'
      ].join('; '));
      instructionLabel.textContent = '🎯 Click and drag to select area • Press ESC to cancel';
      
      // Append to documentElement
      document.documentElement.appendChild(container);
      document.documentElement.appendChild(selectionBox);
      document.documentElement.appendChild(dimensionLabel);
      document.documentElement.appendChild(instructionLabel);
      
      // Force reflow
      container.offsetHeight;
      
      console.log('[PageSaver] Overlay created, dimensions:', container.offsetWidth, 'x', container.offsetHeight);
      
      let startX = 0, startY = 0, isSelecting = false;
      
      const cleanup = () => {
        container.remove();
        selectionBox.remove();
        dimensionLabel.remove();
        instructionLabel.remove();
        document.removeEventListener('keydown', handleKeydown, true);
        document.removeEventListener('mousemove', handleMouseMove, true);
        document.removeEventListener('mouseup', handleMouseUp, true);
      };
      
      const handleKeydown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cleanup();
          window.__pageSaverResult = { cancelled: true };
        }
      };
      
      const handleMouseMove = (e) => {
        if (!isSelecting) return;
        e.preventDefault();
        
        const left = Math.min(startX, e.clientX);
        const top = Math.min(startY, e.clientY);
        const width = Math.abs(e.clientX - startX);
        const height = Math.abs(e.clientY - startY);
        
        selectionBox.style.setProperty('left', left + 'px', 'important');
        selectionBox.style.setProperty('top', top + 'px', 'important');
        selectionBox.style.setProperty('width', width + 'px', 'important');
        selectionBox.style.setProperty('height', height + 'px', 'important');
        selectionBox.style.setProperty('box-shadow', '0 0 0 9999px rgba(0, 0, 0, 0.5)', 'important');
        
        dimensionLabel.textContent = width + ' × ' + height;
        dimensionLabel.style.setProperty('left', (left + width + 10) + 'px', 'important');
        dimensionLabel.style.setProperty('top', top + 'px', 'important');
        dimensionLabel.style.setProperty('display', 'block', 'important');
      };
      
      const handleMouseUp = (e) => {
        if (!isSelecting) return;
        e.preventDefault();
        e.stopPropagation();
        isSelecting = false;
        
        const left = Math.min(startX, e.clientX);
        const top = Math.min(startY, e.clientY);
        const width = Math.abs(e.clientX - startX);
        const height = Math.abs(e.clientY - startY);
        
        const finalRect = { left, top, width, height };
        console.log('[PageSaver] Selection complete:', finalRect);
        
        if (width > 10 && height > 10) {
          window.__pageSaverResult = {
            rect: finalRect,
            devicePixelRatio: window.devicePixelRatio || 1
          };
          console.log('[PageSaver] Result stored:', JSON.stringify(window.__pageSaverResult));
          cleanup();
        } else {
          // Reset for new selection
          container.style.setProperty('background-color', 'rgba(0, 0, 0, 0.5)', 'important');
          selectionBox.style.setProperty('display', 'none', 'important');
          selectionBox.style.setProperty('box-shadow', 'none', 'important');
          dimensionLabel.style.setProperty('display', 'none', 'important');
        }
      };
      
      // Add event listeners
      document.addEventListener('keydown', handleKeydown, true);
      document.addEventListener('mousemove', handleMouseMove, true);
      document.addEventListener('mouseup', handleMouseUp, true);
      
      container.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        startX = e.clientX;
        startY = e.clientY;
        isSelecting = true;
        
        container.style.setProperty('background-color', 'transparent', 'important');
        selectionBox.style.setProperty('display', 'block', 'important');
        selectionBox.style.setProperty('left', startX + 'px', 'important');
        selectionBox.style.setProperty('top', startY + 'px', 'important');
        selectionBox.style.setProperty('width', '0px', 'important');
        selectionBox.style.setProperty('height', '0px', 'important');
        
        console.log('[PageSaver] Mouse down at', startX, startY);
      }, true);
      
      // Initialize result
      window.__pageSaverResult = null;
    }
  });
  
  // Poll for result
  console.log('[PageSaver BG] Starting poll...');
  const pollInterval = setInterval(async () => {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.__pageSaverResult
      });
      
      const result = results[0]?.result;
      
      if (result) {
        clearInterval(pollInterval);
        console.log('[PageSaver BG] Got result:', result);
        
        // Clear the result
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => { window.__pageSaverResult = null; }
        });
        
        if (result.cancelled) {
          console.log('[PageSaver BG] Selection cancelled');
          return;
        }
        
        if (result.rect) {
          await captureAndCrop(tabId, windowId, result.rect, result.devicePixelRatio);
        }
      }
    } catch (err) {
      console.error('[PageSaver BG] Poll error:', err);
      clearInterval(pollInterval);
    }
  }, 200);
  
  // Timeout after 60 seconds
  setTimeout(() => {
    clearInterval(pollInterval);
    console.log('[PageSaver BG] Timeout - stopped polling');
  }, 60000);
}

async function captureAndCrop(tabId, windowId, rect, dpr) {
  console.log('[PageSaver BG] Capturing visible tab...');
  
  // Wait for overlay to be fully removed
  await new Promise(r => setTimeout(r, 200));
  
  // Capture the visible tab
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  console.log('[PageSaver BG] Captured, length:', dataUrl.length);
  
  // Do canvas cropping in the content script (background service worker doesn't have Image/Canvas)
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (dataUrl, rect, dpr) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          canvas.width = Math.round(rect.width * dpr);
          canvas.height = Math.round(rect.height * dpr);
          
          ctx.drawImage(
            img,
            Math.round(rect.left * dpr),
            Math.round(rect.top * dpr),
            canvas.width,
            canvas.height,
            0,
            0,
            canvas.width,
            canvas.height
          );
          
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      });
    },
    args: [dataUrl, rect, dpr]
  });
  
  const croppedDataUrl = results[0]?.result;
  
  if (croppedDataUrl) {
    console.log('[PageSaver BG] Cropped image ready, length:', croppedDataUrl.length);
    
    // Get page info for filename
    const tab = await chrome.tabs.get(tabId);
    const titleResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.title
    });
    const pageTitle = titleResults[0]?.result || '';
    
    const filename = generateFilename(tab.url, pageTitle);
    console.log('[PageSaver BG] Downloading as:', filename);
    
    await chrome.downloads.download({
      url: croppedDataUrl,
      filename: filename,
      saveAs: false
    });
    
    console.log('[PageSaver BG] Download complete!');
  } else {
    console.error('[PageSaver BG] Failed to crop image');
  }
}

function generateFilename(url, title) {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const timeStr = date.toTimeString().slice(0, 8).replace(/:/g, '-');
  
  let pageName = 'page';
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    const pathname = urlObj.pathname;
    
    if (pathname && pathname !== '/') {
      const segments = pathname.split('/').filter(s => s && !s.match(/^\d+$/));
      if (segments.length > 0) {
        pageName = segments[segments.length - 1]
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '-')
          .slice(0, 50);
      } else {
        pageName = hostname.split('.')[0];
      }
    } else {
      pageName = hostname.split('.')[0];
    }
  } catch (e) {
    if (title) {
      pageName = title
        .replace(/[^a-zA-Z0-9\u4e00-\u9fff\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 50);
    }
  }
  
  return `${dateStr}_${pageName}-area_${timeStr}.png`;
}
