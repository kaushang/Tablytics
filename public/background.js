let activeTabId = null;
let lastActiveTime = null;
let tabData = {};
let activeDomain = null;
let timeLimits = {};  // Store time limits for domains
let alertedDomains = new Set();  // Track which domains have been alerted
let isTrackingEnabled = true;  // Default to enabled
let updateInterval = null;  // Interval for regular updates
let isUpdating = false;  // Lock to prevent concurrent updates

// Load existing data from storage
chrome.storage.local.get(["tabData", "activeDomain", "timeLimits", "isTrackingEnabled"], (result) => {
  if (result.tabData) {
    tabData = result.tabData;
  }
  if (result.activeDomain) {
    activeDomain = result.activeDomain;
  }
  if (result.timeLimits) {
    timeLimits = result.timeLimits;
  }
  if (result.isTrackingEnabled !== undefined) {
    isTrackingEnabled = result.isTrackingEnabled;
  }
  
  // Initialize update interval after loading data
  startUpdateInterval();
});

// Function to check time limits and show alert
const checkTimeLimit = (domain, timeSpent) => {
  if (timeLimits[domain] && timeSpent >= timeLimits[domain] && !alertedDomains.has(domain)) {
    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Time\'s up!',
      message: `You've spent ${formatTime(timeSpent)} on ${domain}. Your limit was ${formatTime(timeLimits[domain])}.`
    });
    
    // Mark domain as alerted
    alertedDomains.add(domain);
    
    // Reset alert after 1 hour
    setTimeout(() => {
      alertedDomains.delete(domain);
    }, 3600000); // 1 hour in milliseconds
  }
};

// Helper function to format time
const formatTime = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m ${seconds % 60}s`;
};

// Update active tab time
async function updateActiveTabTime() {
  // Use a lock to prevent concurrent updates
  if (isUpdating || !isTrackingEnabled || !activeTabId || !lastActiveTime) return;
  
  isUpdating = true;
  
  try {
    const activeTab = await chrome.tabs.get(activeTabId);
    if (activeTab && activeTab.url) {
      const currentTime = Date.now();
      const timeElapsed = currentTime - lastActiveTime;
      
      // Only update if time elapsed is reasonable (max 1 second per update)
      // This prevents huge jumps if the timer somehow gets delayed
      const actualTimeToAdd = Math.min(timeElapsed, 1000);
      
      // Update the time for this domain
      const domain = new URL(activeTab.url).hostname;
      if (!tabData[domain]) {
        tabData[domain] = 0;
      }
      
      tabData[domain] += actualTimeToAdd;
      lastActiveTime = currentTime;
      
      // Save to storage
      await chrome.storage.local.set({ tabData: tabData });
      
      // Check time limit
      checkTimeLimit(domain, tabData[domain]);
    }
  } catch (error) {
    console.log("Error updating active tab time:", error);
    // Tab might have been closed
    if (error.message && error.message.includes("No tab with id")) {
      activeTabId = null;
      lastActiveTime = null;
      activeDomain = null;
    }
  } finally {
    isUpdating = false;
  }
}

// Function to start the update interval
function startUpdateInterval() {
  // Clear any existing interval first
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  
  // Set up a regular interval to update tab time every second
  updateInterval = setInterval(updateActiveTabTime, 1000);
}

// Track tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log("Tab activated:", activeInfo);
  
  if (!isTrackingEnabled) {
    // If tracking is disabled, just update the activeTabId but don't track time
    activeTabId = activeInfo.tabId;
    return;
  }
  
  // Update activeTabId and lastActiveTime 
  activeTabId = activeInfo.tabId;
  lastActiveTime = Date.now();

  // Update active domain immediately
  try {
    const tab = await chrome.tabs.get(activeTabId);
    if (tab.url) {
      activeDomain = new URL(tab.url).hostname;
      chrome.storage.local.set({ activeDomain: activeDomain });
    }
  } catch (error) {
    console.log("Error getting active tab:", error);
  }
});

// Track tab updates (URL changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isTrackingEnabled) return;
  
  if (tabId === activeTabId && changeInfo.url) {
    // Reset timing when URL changes
    lastActiveTime = Date.now();
    
    // Update active domain
    activeDomain = new URL(tab.url).hostname;
    chrome.storage.local.set({ activeDomain: activeDomain });
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_TAB_DATA') {
    // Just return the current data without updating
    // (since the interval is already updating regularly)
    sendResponse({ 
      tabData: tabData,
      activeDomain: activeDomain,
      timeLimits: timeLimits
    });
    return true;
  } else if (request.type === 'CLEAR_DATA') {
    // Reset all state
    tabData = {};
    activeDomain = null;
    alertedDomains.clear();
    
    // Keep tracking the current tab
    if (isTrackingEnabled) {
      lastActiveTime = Date.now();
    } else {
      activeTabId = null;
      lastActiveTime = null;
    }
    
    // Clear storage
    chrome.storage.local.set({ 
      tabData: {}, 
      activeDomain: null 
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  } else if (request.type === 'SET_TIME_LIMIT') {
    // Update time limit for a domain
    const { domain, limit } = request;
    if (limit) {
      timeLimits[domain] = limit;
    } else {
      delete timeLimits[domain];
    }
    chrome.storage.local.set({ timeLimits }, () => {
      sendResponse({ success: true });
    });
    return true;
  } else if (request.type === 'TOGGLE_TRACKING') {
    isTrackingEnabled = request.enabled;
    
    // If tracking was disabled, reset the current active session
    if (!isTrackingEnabled) {
      activeTabId = null;
      lastActiveTime = null;
    } else {
      // If tracking was enabled, start a new session
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
          activeTabId = tabs[0].id;
          lastActiveTime = Date.now();
          try {
            activeDomain = new URL(tabs[0].url).hostname;
            chrome.storage.local.set({ activeDomain: activeDomain });
          } catch (error) {
            console.log("Error setting active domain:", error);
          }
        }
      });
    }
    
    chrome.storage.local.set({ isTrackingEnabled }, () => {
      sendResponse({ success: true, isTrackingEnabled });
    });
    return true;
  }
});

// Listen for fullscreen changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isTrackingEnabled) return;
  
  // Check if this is our active tab and the status has changed (could be fullscreen event)
  if (tabId === activeTabId && changeInfo.status) {
    // Reset the timer to ensure continuous tracking
    lastActiveTime = Date.now();
  }
});

// Initialize right away
startUpdateInterval();