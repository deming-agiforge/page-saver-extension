/**
 * Page Saver - Universal Web Page Saving Extension
 * Features: Screenshot, Full Page capture, HTML archive, Image download
 */

// Extract page title from the current tab
function extractPageTitle() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      try {
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => document.title
        });
        resolve(result[0].result || '');
      } catch (e) {
        resolve('');
      }
    });
  });
}

// Generate a clean filename from page title and URL
function getPageName(url, pageTitle = '') {
  // Use page title if available
  if (pageTitle) {
    return pageTitle
      .replace(/[<>:"/\\|?*]/g, '-')  // Replace illegal filename characters
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);  // Limit length
  }
  
  // Fallback to hostname
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return 'Screenshot';
  }
}

// Initialize: show current page name and last capture info
chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  const tab = tabs[0];
  const pageTitle = await extractPageTitle();
  const pageName = getPageName(tab.url, pageTitle);
  document.getElementById('currentPage').textContent = pageName;
  
  // Show last capture info if exists
  chrome.storage.local.get(['lastCapture'], (result) => {
    if (result.lastCapture) {
      showLastCapture(result.lastCapture);
    }
  });
});

// Format time as HH:MM:SS
function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour12: false });
}

// Show last capture info (persistent)
function showLastCapture(info) {
  const statusDiv = document.getElementById('status');
  const time = new Date(info.time);
  statusDiv.innerHTML = '<span class="check">&#10003;</span> ' + info.filename + '<div class="time">' + formatTime(time) + '</div>';
  statusDiv.className = 'status success';
}

// Show status message
// type: 'progress' | 'success' | 'error'
function showStatus(message, type = 'progress') {
  const statusDiv = document.getElementById('status');
  statusDiv.innerHTML = message;
  statusDiv.className = `status ${type}`;
}

// Save and show final result (persisted)
function showFinalResult(filename, isError = false) {
  const statusDiv = document.getElementById('status');
  const now = new Date();
  
  if (isError) {
    statusDiv.innerHTML = 'Error: ' + filename;
    statusDiv.className = 'status error';
    // Errors auto-hide after 10 seconds
    setTimeout(function() {
      statusDiv.innerHTML = '';
      statusDiv.className = 'status';
    }, 10000);
  } else {
    statusDiv.innerHTML = '<span class="check">&#10003;</span> ' + filename + '<div class="time">' + formatTime(now) + '</div>';
    statusDiv.className = 'status success';
    // Save to storage for next popup open
    chrome.storage.local.set({
      lastCapture: {
        filename: filename,
        time: now.toISOString()
      }
    });
  }
}

// Generate filename (browser auto-handles duplicates)
function getFilename(baseFilename, extension) {
  return `${baseFilename}.${extension}`;
}

// Capture visible area only (single screenshot)
document.getElementById('saveScreenshot').addEventListener('click', async () => {
  showStatus('⏳ Capturing visible area...', 'progress');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const pageTitle = await extractPageTitle();
    const pageName = getPageName(tab.url, pageTitle);
    const filename = getFilename(pageName, 'png');
    await chrome.downloads.download({ url: dataUrl, filename: filename, saveAs: false });
    showFinalResult(filename);
  } catch (error) {
    showFinalResult('Failed: ' + error.message, true);
  }
});

// Full page screenshot with auto-scrolling
document.getElementById('saveFullScreenshot').addEventListener('click', async () => {
  showStatus('⏳ Capturing full page...', 'progress');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Get page dimensions - detect scroll method
    const pageInfo = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const viewportHeight = window.innerHeight;
        
        // First, try to detect if window scroll works
        const originalScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
        window.scrollTo(0, 100);
        const canWindowScroll = (window.pageYOffset || document.documentElement.scrollTop || 0) > 0;
        window.scrollTo(0, originalScrollY); // restore
        
        if (canWindowScroll) {
          // Window scroll works - use it
          const docHeight = Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight
          );
          window.__scrollContainer = null;
          return {
            hasContainer: false,
            viewportHeight: viewportHeight,
            totalHeight: docHeight,
            viewportWidth: window.innerWidth
          };
        }
        
        // Window scroll doesn't work - find custom scroll container
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          const style = window.getComputedStyle(el);
          if ((style.overflowY === 'scroll' || style.overflowY === 'auto') && 
              el.scrollHeight > el.clientHeight + 50 &&
              el.clientHeight > viewportHeight * 0.3) {
            window.__scrollContainer = el;
            return {
              hasContainer: true,
              viewportHeight: el.clientHeight,
              totalHeight: el.scrollHeight,
              viewportWidth: window.innerWidth
            };
          }
        }
        
        // Fallback: use document height anyway
        window.__scrollContainer = null;
        return {
          hasContainer: false,
          viewportHeight: viewportHeight,
          totalHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
          viewportWidth: window.innerWidth
        };
      }
    });
    
    const info = pageInfo[0].result;
    
    // If page fits in viewport, just capture once
    if (info.totalHeight <= info.viewportHeight * 1.1) {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      const pageTitle = await extractPageTitle();
      const pageName = getPageName(tab.url, pageTitle);
      const filename = getFilename(pageName, 'png');
      await chrome.downloads.download({ url: dataUrl, filename: filename, saveAs: false });
      showStatus('✓ Screenshot saved: ' + filename);
      return;
    }
    
    const screenshotList = [];
    const scrollPositions = [];
    
    // Function to detect header height and hide bottom elements
    const detectHeaderAndHideBottom = async () => {
      return await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function() {
          var vh = window.innerHeight;
          var vw = window.innerWidth;
          var maxHeaderBottom = 0;
          
          // Initialize storage for hidden elements
          if (!window.__pcHiddenElements) {
            window.__pcHiddenElements = [];
          }
          
          var all = document.querySelectorAll('*');
          
          all.forEach(function(el) {
            var style = window.getComputedStyle(el);
            var pos = style.position;
            
            if (pos === 'fixed' || pos === 'sticky') {
              var rect = el.getBoundingClientRect();
              
              // Check if it's a top header/nav
              var isWide = rect.width > vw * 0.5;
              var isAtTop = rect.top >= -5 && rect.top < vh * 0.25;
              var isReasonableHeight = rect.height > 20 && rect.height < vh * 0.35;
              
              if (isWide && isAtTop && isReasonableHeight) {
                var bottom = rect.top + rect.height;
                if (bottom > maxHeaderBottom) {
                  maxHeaderBottom = bottom;
                }
                console.log('[Page Capture] Found fixed header:', el.tagName, 'height=' + rect.height, 'bottom=' + bottom);
              }
              
              // Hide BOTTOM fixed elements (cookie banners, chat widgets, etc.)
              var isAtBottom = rect.bottom > vh * 0.7 && rect.top > vh * 0.5;
              if (isAtBottom && rect.height > 20) {
                window.__pcHiddenElements.push({
                  el: el,
                  originalStyle: el.style.cssText
                });
                el.style.setProperty('visibility', 'hidden', 'important');
                console.log('[Page Capture] Hidden bottom element:', el.tagName, 'height=' + rect.height);
              }
            }
          });
          
          // Also check for static headers (Google-style)
          var headerSelectors = ['header', '[role="banner"]', '#header', '.header', 'nav', '#searchform', 'form[role="search"]', '#hdtb', '.sfbg'];
          headerSelectors.forEach(function(sel) {
            try {
              document.querySelectorAll(sel).forEach(function(el) {
                var rect = el.getBoundingClientRect();
                var style = window.getComputedStyle(el);
                
                // Don't skip fixed/sticky - include them in header detection
                var isNearTop = rect.top >= -20 && rect.top < vh * 0.2;
                var isWide = rect.width > vw * 0.5;
                var isReasonableHeight = rect.height > 20 && rect.height < vh * 0.35;
                
                if (isNearTop && isWide && isReasonableHeight) {
                  var bottom = rect.bottom;
                  if (bottom > maxHeaderBottom && bottom < vh * 0.45) {
                    maxHeaderBottom = bottom;
                    console.log('[Page Capture] Found header via selector:', el.tagName, sel, 'height=' + rect.height, 'bottom=' + bottom, 'position=' + style.position);
                  }
                }
              });
            } catch(e) {}
          });
          
          // Special handling for Google search page - find the sticky search bar area
          if (window.location.hostname.includes('google')) {
            // Google's search bar + tabs area
            var googleElements = document.querySelectorAll('#hdtb, #sfcnt, .sfbg, .RNNXgb, .o3j99');
            var googleMaxBottom = 0;
            googleElements.forEach(function(el) {
              var rect = el.getBoundingClientRect();
              if (rect.top >= -10 && rect.bottom > googleMaxBottom && rect.bottom < vh * 0.4) {
                googleMaxBottom = rect.bottom;
              }
            });
            if (googleMaxBottom > maxHeaderBottom) {
              maxHeaderBottom = googleMaxBottom;
              console.log('[Page Capture] Found Google header area, bottom=' + googleMaxBottom);
            }
          }
          
          console.log('[Page Capture] Total header height to crop:', maxHeaderBottom);
          return Math.ceil(maxHeaderBottom);
        }
      });
    };
    
    // Function to restore hidden elements
    const restoreHiddenElements = async () => {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function() {
          if (window.__pcHiddenElements) {
            window.__pcHiddenElements.forEach(function(item) {
              item.el.style.cssText = item.originalStyle;
            });
            window.__pcHiddenElements = [];
            console.log('[Page Capture] Restored all hidden elements');
          }
        }
      });
    };
    
    // Scroll to top first
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (hasContainer) => {
        if (hasContainer && window.__scrollContainer) {
          window.__scrollContainer.scrollTop = 0;
        } else {
          window.scrollTo(0, 0);
        }
      },
      args: [info.hasContainer]
    });
    
    // Wait for layout to settle
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Detect header height FIRST, before calculating scroll steps
    const headerHeightResult = await detectHeaderAndHideBottom();
    const fixedHeaderHeight = headerHeightResult[0].result || 0;
    console.log('[Page Capture] Detected fixed header height:', fixedHeaderHeight);
    
    // Scroll step calculation depends on whether we have a custom scroll container
    // - For window scroll: header is "inside" the scrolling area, so scroll (viewport - header)
    // - For custom container: header is "outside" the container, so scroll full viewport
    let scrollStep;
    if (info.hasContainer) {
      // Custom scroll container: fixed header is outside, doesn't affect scroll
      scrollStep = info.viewportHeight;
      console.log('[Page Capture] Using custom container, scroll step = container height:', scrollStep);
    } else {
      // Window scroll: fixed header covers part of content
      const effectiveNewContent = info.viewportHeight - fixedHeaderHeight;
      scrollStep = effectiveNewContent > 100 ? effectiveNewContent : info.viewportHeight;
      console.log('[Page Capture] Using window scroll, effective content:', effectiveNewContent, 'scroll step:', scrollStep);
    }
    
    const totalSteps = Math.ceil(info.totalHeight / scrollStep) + 1; // +1 to ensure we capture everything
    
    console.log('[Page Capture] Total steps:', totalSteps);
    
    // Capture screenshots while scrolling
    let lastScrollPos = -1;
    for (let i = 0; i < totalSteps; i++) {
      
      const scrollPos = i * scrollStep;
      
      const scrollResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (pos, hasContainer) => {
          if (hasContainer && window.__scrollContainer) {
            window.__scrollContainer.scrollTop = pos;
            return { actual: window.__scrollContainer.scrollTop };
          } else {
            window.scrollTo(0, pos);
            return { actual: window.pageYOffset || document.documentElement.scrollTop || 0 };
          }
        },
        args: [scrollPos, info.hasContainer]
      });
      
      const actualPos = scrollResult[0].result.actual;
      
      // Skip if scroll position didn't change (reached end of page)
      if (i > 0 && actualPos === lastScrollPos) {
        console.log(`Scroll stuck at ${actualPos}, stopping early`);
        break;
      }
      lastScrollPos = actualPos;
      scrollPositions.push(actualPos);
      
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      screenshotList.push(dataUrl);
      showStatus('Capturing ' + (i + 1) + '/' + totalSteps + '...', 'progress');
    }
    
    // Restore hidden elements (bottom bars)
    await restoreHiddenElements();
    
    // Scroll back to top
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function(hasContainer) {
        if (hasContainer && window.__scrollContainer) {
          window.__scrollContainer.scrollTop = 0;
        } else {
          window.scrollTo(0, 0);
        }
      },
      args: [info.hasContainer]
    });
    
    showStatus('Stitching images...', 'progress');
    
    // Get actual window viewport height for scale calculation
    // captureVisibleTab captures the entire window, not just the scroll container
    const windowInfo = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.innerHeight
    });
    const windowViewportHeight = windowInfo[0].result;
    
    // Calculate scale ratio (screenshot pixel height vs window viewport CSS height)
    const firstImg = new Image();
    await new Promise((resolve, reject) => {
      firstImg.onload = resolve;
      firstImg.onerror = reject;
      firstImg.src = screenshotList[0];
    });
    
    const scale = firstImg.height / windowViewportHeight;
    const headerCropPixels = Math.round(fixedHeaderHeight * scale);
    
    // For canvas height, we need to use the scroll container's total height if applicable
    // But scale it based on window viewport
    const containerScale = info.hasContainer ? (windowViewportHeight / info.viewportHeight) : 1;
    
    console.log('[Page Capture] Window viewport:', windowViewportHeight, 'Container viewport:', info.viewportHeight);
    console.log('[Page Capture] Scale:', scale, 'Header crop pixels:', headerCropPixels);
    console.log('[Page Capture] Scroll positions:', scrollPositions);
    console.log('[Page Capture] Screenshot count:', screenshotList.length);
    
    // Calculate canvas height based on what we actually captured
    // Method: first screenshot full height + (subsequent screenshots - header) each
    // But limit to the actual content we have
    let expectedCanvasHeight;
    if (info.hasContainer) {
      // For container scroll: canvas = header + container's total content
      // The container content is info.totalHeight (container's scrollHeight)
      // We need to scale it relative to how much of the screenshot is container vs header
      const containerAreaInScreenshot = firstImg.height - headerCropPixels;
      const containerContentScale = containerAreaInScreenshot / info.viewportHeight;
      expectedCanvasHeight = headerCropPixels + Math.ceil(info.totalHeight * containerContentScale);
    } else {
      // For window scroll: canvas = page total height
      expectedCanvasHeight = Math.ceil(info.totalHeight * scale);
    }
    
    // Also calculate based on actual screenshots taken
    const calculatedHeight = firstImg.height + (screenshotList.length - 1) * (firstImg.height - headerCropPixels);
    const canvasHeight = Math.min(expectedCanvasHeight, calculatedHeight);
    
    console.log('[Page Capture] Expected canvas height:', expectedCanvasHeight, 'Calculated from screenshots:', calculatedHeight, 'Using:', canvasHeight);
    
    // Stitch screenshots together
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = firstImg.width;
    canvas.height = canvasHeight;
    
    console.log('[Page Capture] Canvas size:', canvas.width, 'x', canvas.height, 'totalHeight:', info.totalHeight);
    
    // Calculate scale for scroll positions
    // For container: scroll positions are in container coordinates
    // For window: scroll positions are in page coordinates
    const scrollScale = info.hasContainer 
      ? (firstImg.height - headerCropPixels) / info.viewportHeight  // container area scale
      : scale;  // full window scale
    
    let canvasY = 0;
    
    for (let i = 0; i < screenshotList.length; i++) {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = screenshotList[i];
      });
      
      const scrollY = scrollPositions[i];
      const prevScrollY = i > 0 ? scrollPositions[i - 1] : 0;
      const scrollDelta = scrollY - prevScrollY;
      
      if (i === 0) {
        // First screenshot: draw complete
        ctx.drawImage(img, 0, 0);
        canvasY = img.height;
        console.log('[Page Capture] Drew first image, canvasY now:', canvasY);
      } else {
        // Calculate how much new content this screenshot adds
        // Based on how much we actually scrolled since last screenshot
        const expectedNewContent = Math.round(scrollDelta * scrollScale);
        
        // The new content is at the bottom of the screenshot (after header)
        // We only draw the new content, not the overlapping part
        const srcY = img.height - expectedNewContent;
        const srcHeight = expectedNewContent;
        
        // Make sure srcY is at least headerCropPixels (don't include header)
        const actualSrcY = Math.max(srcY, headerCropPixels);
        const actualSrcHeight = img.height - actualSrcY;
        
        // Don't draw beyond canvas
        const remainingCanvas = canvasHeight - canvasY;
        const drawHeight = Math.min(actualSrcHeight, remainingCanvas);
        
        if (drawHeight > 0 && actualSrcHeight > 0) {
          ctx.drawImage(
            img,
            0, actualSrcY, img.width, drawHeight,
            0, canvasY, img.width, drawHeight
          );
          console.log('[Page Capture] Drew image', i, 'scrollDelta:', scrollDelta, 'expectedNew:', expectedNewContent, 'srcY:', actualSrcY, 'destY:', canvasY, 'height:', drawHeight);
          canvasY += drawHeight;
        } else {
          console.log('[Page Capture] Skipped image', i, '- no new content (scrollDelta:', scrollDelta, ')');
        }
      }
    }
    
    const finalDataUrl = canvas.toDataURL('image/png');
    const pageTitle = await extractPageTitle();
    const pageName = getPageName(tab.url, pageTitle);
    const filename = getFilename(pageName, 'png');
    
    await chrome.downloads.download({ url: finalDataUrl, filename: filename, saveAs: false });
    showFinalResult(filename);
    
  } catch (error) {
    showFinalResult('Failed: ' + error.message, true);
  }
});

// ==================== Save Images Feature ====================

let imageDownloadAborted = false;

// Show/hide image options panel
document.getElementById('saveImages').addEventListener('click', async () => {
  const optionsDiv = document.getElementById('imageOptions');
  const archiveDiv = document.getElementById('archiveOptions');
  const isVisible = optionsDiv.style.display !== 'none';
  
  // Hide archive options if open
  archiveDiv.style.display = 'none';
  
  if (isVisible) {
    optionsDiv.style.display = 'none';
  } else {
    optionsDiv.style.display = 'block';
  }
});

// Cancel image download
document.getElementById('cancelImageDownload').addEventListener('click', () => {
  document.getElementById('imageOptions').style.display = 'none';
  imageDownloadAborted = true;
});

// Start image download
document.getElementById('startImageDownload').addEventListener('click', async () => {
  const minSize = parseInt(document.getElementById('minImageSize').value) || 0;
  const includeImgTags = document.getElementById('imgTag').checked;
  const includeBgImages = document.getElementById('bgImages').checked;
  
  document.getElementById('imageOptions').style.display = 'none';
  imageDownloadAborted = false;
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  showStatus('🔍 Scanning for images...', 'progress');
  
  try {
    // Extract all image URLs from the page
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (includeImg, includeBg) => {
        const imageUrls = new Set(); // Store clean URLs (without size params)
        
        // Helper: normalize URL by removing size-related query params to get original image
        function getCleanUrl(url) {
          try {
            const urlObj = new URL(url);
            // Remove common size/dimension parameters to get original full-size image
            ['width', 'height', 'w', 'h', 'size', 'resize', 'crop', 'fit', 'quality', 'q', 'auto', 'format'].forEach(param => {
              urlObj.searchParams.delete(param);
            });
            // Keep 'v' parameter (version/cache busting) as it's often required
            return urlObj.href;
          } catch {
            return url;
          }
        }
        
        // Helper: add URL (cleaned version)
        function addImageUrl(url) {
          if (!url || !url.startsWith('http')) return;
          const cleanUrl = getCleanUrl(url);
          imageUrls.add(cleanUrl);
        }
        
        // Get images from <img> tags
        if (includeImg) {
          document.querySelectorAll('img').forEach(img => {
            addImageUrl(img.src);
            // Also check srcset
            if (img.srcset) {
              img.srcset.split(',').forEach(s => {
                const url = s.trim().split(' ')[0];
                addImageUrl(url);
              });
            }
          });
          
          // Check <picture> sources
          document.querySelectorAll('picture source').forEach(source => {
            if (source.srcset) {
              source.srcset.split(',').forEach(s => {
                const url = s.trim().split(' ')[0];
                addImageUrl(url);
              });
            }
          });
        }
        
        // Get images from CSS background-image
        if (includeBg) {
          document.querySelectorAll('*').forEach(el => {
            const style = window.getComputedStyle(el);
            const bgImage = style.backgroundImage;
            if (bgImage && bgImage !== 'none') {
              const matches = bgImage.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/gi);
              if (matches) {
                matches.forEach(match => {
                  const url = match.replace(/url\(["']?|["']?\)/gi, '');
                  addImageUrl(url);
                });
              }
            }
          });
        }
        
        // Return unique clean URLs
        return Array.from(imageUrls);
      },
      args: [includeImgTags, includeBgImages]
    });
    
    const imageUrls = result[0]?.result || [];
    
    if (imageUrls.length === 0) {
      showStatus('❌ No images found on this page.', 'error');
      return;
    }
    
    showStatus(`📷 Found ${imageUrls.length} images. Checking sizes...`, 'progress');
    
    // Filter by size and download
    let downloaded = 0;
    let skipped = 0;
    let failed = 0;
    const failedUrls = [];
    
    for (let i = 0; i < imageUrls.length && !imageDownloadAborted; i++) {
      const url = imageUrls[i];
      
      try {
        // Check file size via HEAD request
        let fileSize = 0;
        if (minSize > 0) {
          const headResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async (imageUrl) => {
              try {
                const response = await fetch(imageUrl, { method: 'HEAD' });
                const size = response.headers.get('content-length');
                return size ? parseInt(size) : 0;
              } catch {
                return 0;
              }
            },
            args: [url]
          });
          fileSize = headResult[0]?.result || 0;
        }
        
        // Skip if too small (and we got a valid size)
        if (minSize > 0 && fileSize > 0 && fileSize < minSize) {
          skipped++;
          continue;
        }
        
        // Generate filename from URL
        const filename = getImageFilename(url, i);
        
        // Validate filename before download
        if (!filename || filename.length < 4) {
          console.warn('[Images] Invalid filename for:', url);
          failed++;
          failedUrls.push(url);
          continue;
        }
        
        showStatus(`⬇️ Downloading ${downloaded + 1}/${imageUrls.length - skipped}<br>${filename}`, 'progress');
        
        // Check if same origin (can use fetch) or cross-origin (use direct download)
        const pageOrigin = new URL(tab.url).origin;
        const imageOrigin = new URL(url).origin;
        const isSameOrigin = pageOrigin === imageOrigin;
        
        try {
          let downloadSuccess = false;
          
          if (isSameOrigin) {
            // Same origin: use fetch to get image with proper cookies/headers
            const fetchResult = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: async (imageUrl) => {
                try {
                  const response = await fetch(imageUrl, {
                    credentials: 'include',
                    headers: {
                      'Accept': 'image/*,*/*'
                    }
                  });
                  if (!response.ok) {
                    return { error: `HTTP ${response.status}` };
                  }
                  const blob = await response.blob();
                  // Convert blob to data URL
                  return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve({ dataUrl: reader.result, type: blob.type });
                    reader.onerror = () => resolve({ error: 'Failed to read blob' });
                    reader.readAsDataURL(blob);
                  });
                } catch (e) {
                  return { error: e.message };
                }
              },
              args: [url]
            });
            
            const imgResult = fetchResult[0]?.result;
            
            if (imgResult?.dataUrl) {
              await chrome.downloads.download({
                url: imgResult.dataUrl,
                filename: `images/${filename}`,
                saveAs: false
              });
              downloadSuccess = true;
            } else if (imgResult?.error) {
              console.warn('[Images] Fetch failed, trying direct download:', url);
            }
          }
          
          // Cross-origin or fetch failed: use direct download
          if (!downloadSuccess) {
            await chrome.downloads.download({
              url: url,
              filename: `images/${filename}`,
              saveAs: false
            });
            downloadSuccess = true;
          }
          
          if (downloadSuccess) {
            downloaded++;
          } else {
            failed++;
            failedUrls.push(url);
          }
        } catch (downloadError) {
          console.warn('[Images] Download failed:', filename, downloadError);
          failed++;
          failedUrls.push(url);
        }
        
        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (e) {
        console.warn('[Images] Failed to process:', url, e);
        failed++;
        failedUrls.push(url);
      }
    }
    
    // Show result
    if (imageDownloadAborted) {
      showStatus(`⚠️ Cancelled. Downloaded ${downloaded} images.`, 'error');
    } else {
      let msg = `${downloaded} images saved`;
      if (skipped > 0) msg += ` (${skipped} small skipped)`;
      if (failed > 0) msg += ` (${failed} failed)`;
      showFinalResult(msg);
      
      // Log failed URLs to console for debugging
      if (failedUrls.length > 0) {
        console.log('[Images] Failed URLs:');
        failedUrls.forEach((url, i) => console.log(`  ${i + 1}. ${url}`));
      }
    }
    
  } catch (error) {
    showStatus(`❌ Error: ${error.message}`, 'error');
  }
});

// Generate a clean filename from image URL
function getImageFilename(url, index) {
  try {
    const urlObj = new URL(url);
    let pathname = urlObj.pathname;
    
    // Get the last part of the path
    let filename = pathname.split('/').filter(Boolean).pop() || '';
    
    // Remove query string remnants
    filename = filename.split('?')[0];
    
    // Decode URL encoding
    try {
      filename = decodeURIComponent(filename);
    } catch {}
    
    // Clean up filename - remove invalid characters
    filename = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
    
    // Remove leading/trailing dashes and spaces
    filename = filename.replace(/^[-\s]+|[-\s]+$/g, '');
    
    // If filename is empty or too short, generate one from URL hash
    if (!filename || filename.length < 3) {
      // Use part of hostname + hash of URL
      const hash = url.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
      const absHash = Math.abs(hash).toString(36);
      filename = `${urlObj.hostname.replace(/\./g, '-')}-${absHash}`;
    }
    
    // Truncate if too long (leave room for extension)
    filename = filename.substring(0, 80);
    
    // Add extension if missing
    if (!/\.(jpg|jpeg|png|gif|webp|svg|avif|bmp|ico|tiff|tif)$/i.test(filename)) {
      // Try to guess from URL
      const ext = pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|avif|bmp|ico|tiff|tif)/i);
      filename += ext ? ext[0].toLowerCase() : '.jpg';
    }
    
    return filename;
  } catch {
    // Fallback with index
    return `image-${index || Date.now()}.jpg`;
  }
}

// ==================== Archive Site Feature ====================

// State for archive operation
let archiveAborted = false;

// Show/hide archive options panel
document.getElementById('archiveSite').addEventListener('click', async () => {
  const optionsDiv = document.getElementById('archiveOptions');
  const imageDiv = document.getElementById('imageOptions');
  const isVisible = optionsDiv.style.display !== 'none';
  
  // Hide image options if open
  imageDiv.style.display = 'none';
  
  if (isVisible) {
    optionsDiv.style.display = 'none';
  } else {
    // Pre-fill URL prefix with current page's path
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
      const urlObj = new URL(tab.url);
      // Use current path as prefix (e.g., /en/manual/shopify-admin -> /en/manual/shopify-admin)
      document.getElementById('urlPrefix').value = urlObj.origin + urlObj.pathname;
    } catch (e) {
      document.getElementById('urlPrefix').value = tab.url;
    }
    optionsDiv.style.display = 'block';
  }
});

// Cancel archive
document.getElementById('cancelArchive').addEventListener('click', () => {
  document.getElementById('archiveOptions').style.display = 'none';
  archiveAborted = true;
});

// Generate file path from URL (with directory structure)
// isStartPage: true for the initial page, false for linked pages
function getFilePathFromUrl(url, prefix, isStartPage) {
  try {
    const urlObj = new URL(url);
    const prefixObj = new URL(prefix);
    
    // Get the last segment of prefix path as the base folder name
    const prefixPath = prefixObj.pathname.replace(/\/+$/g, '');
    const prefixSegments = prefixPath.split('/').filter(Boolean);
    const baseFolderName = prefixSegments[prefixSegments.length - 1] || 'archive';
    
    // Get the path relative to prefix
    let relativePath = urlObj.pathname;
    if (relativePath.startsWith(prefixObj.pathname)) {
      relativePath = relativePath.slice(prefixObj.pathname.length);
    }
    
    // Remove leading/trailing slashes
    relativePath = relativePath.replace(/^\/+|\/+$/g, '');
    
    // Clean path segments
    const cleanSegment = (s) => s.replace(/[<>:"/\\|?*]/g, '-').replace(/-+/g, '-');
    
    if (isStartPage || !relativePath) {
      // Start page: save directly as baseFolderName.html
      return `${cleanSegment(baseFolderName)}.html`;
    }
    
    // Sub-pages: save under baseFolderName/ directory with path structure
    const pathSegments = relativePath.split('/').filter(Boolean);
    
    if (pathSegments.length === 1) {
      // Single level: baseFolderName/filename.html
      return `${cleanSegment(baseFolderName)}/${cleanSegment(pathSegments[0])}.html`;
    } else {
      // Multiple levels: baseFolderName/a/b/.../filename.html
      const dirs = pathSegments.slice(0, -1).map(cleanSegment);
      const filename = cleanSegment(pathSegments[pathSegments.length - 1]);
      return `${cleanSegment(baseFolderName)}/${dirs.join('/')}/${filename}.html`;
    }
  } catch (e) {
    return 'page.html';
  }
}

// Extract links from HTML that match prefix
function extractLinksFromHtml(html, baseUrl, prefix) {
  const links = new Set();
  
  // Match href attributes
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match;
  
  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      // Resolve relative URLs
      const absoluteUrl = new URL(match[1], baseUrl).href;
      
      // Check if URL matches prefix
      if (absoluteUrl.startsWith(prefix)) {
        // Remove hash and query string for comparison
        const cleanUrl = absoluteUrl.split('#')[0].split('?')[0];
        // Remove trailing slash for consistency
        const normalizedUrl = cleanUrl.replace(/\/+$/, '');
        links.add(normalizedUrl);
      }
    } catch (e) {
      // Invalid URL, skip
    }
  }
  
  return Array.from(links);
}

// Start archive process
document.getElementById('startArchive').addEventListener('click', async () => {
  const prefix = document.getElementById('urlPrefix').value.trim();
  const maxPages = parseInt(document.getElementById('maxPages').value) || 50;
  
  if (!prefix) {
    showStatus('Please enter a URL prefix', 'error');
    return;
  }
  
  // Hide options panel
  document.getElementById('archiveOptions').style.display = 'none';
  archiveAborted = false;
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const startUrl = tab.url.split('#')[0].split('?')[0].replace(/\/+$/, '');
  
  // Track visited URLs and queue
  const visited = new Set();
  const queue = [startUrl];
  const archived = [];
  const failed = [];
  
  showStatus('🔍 Starting archive...', 'progress');
  
  // Normalize prefix for comparison
  const normalizedPrefix = prefix.replace(/\/+$/, '');
  
  while (queue.length > 0 && archived.length < maxPages && !archiveAborted) {
    const currentUrl = queue.shift();
    
    // Skip if already visited
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);
    
    // Check if URL matches prefix
    if (!currentUrl.startsWith(normalizedPrefix)) continue;
    
    // Display URL path (truncate from end if too long)
    const displayUrl = currentUrl.length > 500 ? currentUrl.slice(0, 500) + '...' : currentUrl;
    showStatus(`📄 Fetching #${archived.length + 1} (max ${maxPages})<br>${displayUrl}`, 'progress');
    
    try {
      // Fetch the page HTML using content script
      console.log('[Archive] Fetching:', currentUrl);
      
      let fetchResult;
      try {
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: async (url) => {
            try {
              const response = await fetch(url, {
                credentials: 'include',
                headers: {
                  'Accept': 'text/html,application/xhtml+xml,application/xml'
                }
              });
              if (!response.ok) {
                return { error: `HTTP ${response.status}` };
              }
              const html = await response.text();
              return { html, finalUrl: response.url };
            } catch (e) {
              return { error: e.message };
            }
          },
          args: [currentUrl]
        });
        fetchResult = result[0]?.result;
      } catch (scriptError) {
        console.warn('[Archive] Script execution error:', scriptError);
        failed.push({ url: currentUrl, error: `Script error: ${scriptError.message}` });
        continue;
      }
      
      if (!fetchResult) {
        console.warn('[Archive] No result from script');
        failed.push({ url: currentUrl, error: 'No result from script' });
        continue;
      }
      
      if (fetchResult.error) {
        console.warn('[Archive] Fetch error:', fetchResult.error);
        failed.push({ url: currentUrl, error: fetchResult.error });
        continue;
      }
      
      let html = fetchResult.html;
      console.log('[Archive] Fetched HTML length:', html?.length);
      
      // Remove all <script> tags to prevent JS redirects and errors
      html = removeScriptTags(html);
      
      // Extract links from the page (before script removal to catch all links)
      const links = extractLinksFromHtml(fetchResult.html, currentUrl, normalizedPrefix);
      
      // Add new links to queue
      for (const link of links) {
        if (!visited.has(link)) {
          queue.push(link);
        }
      }
      
      // Determine if this is the start page
      const isStartPage = (currentUrl === startUrl);
      
      // Save HTML file with proper directory structure
      const filePath = getFilePathFromUrl(currentUrl, normalizedPrefix, isStartPage);
      const blob = new Blob([html], { type: 'text/html' });
      const dataUrl = await blobToDataUrl(blob);
      
      await chrome.downloads.download({
        url: dataUrl,
        filename: `archive/${filePath}`,
        saveAs: false
      });
      
      archived.push({ url: currentUrl, filename: filePath });
      
      // Small delay to avoid overwhelming
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      failed.push({ url: currentUrl, error: error.message });
    }
  }
  
  // Show final result
  if (archiveAborted) {
    showStatus(`⚠️ Archive cancelled. Saved ${archived.length} pages.`, 'error');
  } else if (archived.length === 0) {
    showStatus(`❌ No pages archived. ${failed.length} failed.`, 'error');
  } else {
    showFinalResult(`Archived ${archived.length} pages to /archive/`);
  }
  
  // Log summary to console
  console.log('[Archive] Completed:', archived);
  console.log('[Archive] Failed:', failed);
  console.log('[Archive] Total visited:', visited.size);
});

// Helper: Convert Blob to data URL
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper: Remove all script tags from HTML to prevent JS redirects
function removeScriptTags(html) {
  // Remove <script>...</script> tags (including multiline)
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove inline event handlers that might cause redirects
  html = html.replace(/\s(on\w+)\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove <noscript> content (often contains redirect messages)
  html = html.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
  
  // Add a meta tag to prevent any remaining redirects
  const metaNoRedirect = '<meta http-equiv="Content-Security-Policy" content="script-src \'none\';">';
  html = html.replace(/<head([^>]*)>/i, `<head$1>\n${metaNoRedirect}`);
  
  return html;
}
