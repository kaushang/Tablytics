let activeTabId = null;
let lastActiveTime = null;
let tabData = {};
let activeDomain = null;
let timeLimits = {};  // Store time limits for domains
let strictLimits = {}; // Store domains with strict limits
let alertedDomains = new Set();  // Track which domains have been alerted
let isTrackingEnabled = true;  // Default to enabled
let updateInterval = null;  // Interval for regular updates
let isUpdating = false;  // Lock to prevent concurrent updates
let lastActiveUpdate = Date.now(); // Track when we last saw activity

// Load existing data from storage
chrome.storage.local.get(["tabData", "activeDomain", "timeLimits", "strictLimits", "isTrackingEnabled"], (result) => {
  if (result.tabData) {
    tabData = result.tabData;
  }
  if (result.activeDomain) {
    activeDomain = result.activeDomain;
  }
  if (result.timeLimits) {
    timeLimits = result.timeLimits;
  }
  if (result.strictLimits) {
    strictLimits = result.strictLimits;
  }
  if (result.isTrackingEnabled !== undefined) {
    isTrackingEnabled = result.isTrackingEnabled;
  }
  
  // Initial active tab check
  checkActiveTab();
  
  // Check for and remove any domains that don't have open tabs
  cleanupClosedTabs();
  
  // Initialize update interval after loading data
  startUpdateInterval();
});

// Function to check and get the active tab
async function checkActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      const currentActiveTab = tabs[0];
      if (currentActiveTab.id !== activeTabId) {
        // We have a new active tab
        activeTabId = currentActiveTab.id;
        lastActiveTime = Date.now();
        lastActiveUpdate = Date.now();
        
        // Update active domain if URL exists
        if (currentActiveTab.url) {
          try {
            activeDomain = new URL(currentActiveTab.url).hostname;
            chrome.storage.local.set({ activeDomain: activeDomain });
          } catch (error) {
            console.log("Error setting active domain:", error);
          }
        }
        console.log("Active tab updated to:", activeTabId, "Domain:", activeDomain);
      } else {
        // Same active tab, but update the active time
        lastActiveUpdate = Date.now();
      }
    }
  } catch (error) {
    console.log("Error checking active tab:", error);
  }
}

// Function to check time limits and show alert or close tabs
const checkTimeLimit = async (domain, timeSpent) => {
  if (timeLimits[domain] && timeSpent >= timeLimits[domain]) {
    // If this is a strict limit, close all tabs for this domain
    if (strictLimits[domain]) {
      // Find all tabs with this domain
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          if (tab.url && new URL(tab.url).hostname === domain) {
            // Close the tab
            chrome.tabs.remove(tab.id);
          }
        } catch (error) {
          console.log("Error processing tab for strict limit:", error);
        }
      }
      
      // Show notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Strict Time Limit Enforced',
        message: `Reached limit of ${formatTime(timeLimits[domain])} on ${domain}. Tabs have been closed.`
      });
      
    } else if (!alertedDomains.has(domain)) {
      // Show notification for regular (non-strict) limits
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Time Limit Reached',
        message: `You've spent ${formatTime(timeSpent)} on ${domain}. Your limit was ${formatTime(timeLimits[domain])}.`
      });
      
      // Mark domain as alerted
      alertedDomains.add(domain);
      
      // Reset alert after 1 hour
      setTimeout(() => {
        alertedDomains.delete(domain);
      }, 3600000); // 1 hour in milliseconds
    }
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

// Function to remove closed tabs from the tracking data
async function cleanupClosedTabs() {
  try {
    // Get all current tabs
    const tabs = await chrome.tabs.query({});
    
    // Extract domains from open tabs
    const openDomains = new Set();
    for (const tab of tabs) {
      try {
        if (tab.url) {
          const domain = new URL(tab.url).hostname;
          if (domain) {
            openDomains.add(domain);
          }
        }
      } catch (error) {
        // Skip invalid URLs
        console.log("Error processing tab URL:", error);
      }
    }
    
    // Track if we need to update storage
    let hasChanges = false;
    
    // Remove domains that no longer have any open tabs from tabData
    const updatedTabData = {};
    for (const [domain, time] of Object.entries(tabData)) {
      if (openDomains.has(domain)) {
        updatedTabData[domain] = time;
      } else {
        hasChanges = true;
      }
    }
    
    // Remove time limits for domains that no longer have open tabs
    const updatedTimeLimits = {};
    for (const [domain, limit] of Object.entries(timeLimits)) {
      if (openDomains.has(domain)) {
        updatedTimeLimits[domain] = limit;
      } else {
        hasChanges = true;
      }
    }
    
    // Remove strict limits for domains that no longer have open tabs
    const updatedStrictLimits = {};
    for (const domain in strictLimits) {
      if (openDomains.has(domain)) {
        updatedStrictLimits[domain] = strictLimits[domain];
      } else {
        hasChanges = true;
      }
    }
    
    // Only update if there were changes
    if (hasChanges) {
      tabData = updatedTabData;
      timeLimits = updatedTimeLimits;
      strictLimits = updatedStrictLimits;
      
      // Update all in storage
      chrome.storage.local.set({ 
        tabData: tabData,
        timeLimits: timeLimits,
        strictLimits: strictLimits
      });
      console.log("Removed closed tabs from tracking data, time limits, and strict limits");
    }
  } catch (error) {
    console.log("Error cleaning up closed tabs:", error);
  }
}

// Update active tab time
async function updateActiveTabTime() {
  // First, check if we've been inactive too long (more than 5 seconds)
  const currentTime = Date.now();
  if (currentTime - lastActiveUpdate > 5000) {
    console.log("Too much time since last activity update, checking active tab...");
    await checkActiveTab();
  }

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
      lastActiveUpdate = currentTime; // Update the activity time
      
      // Save to storage
      await chrome.storage.local.set({ tabData: tabData });
      
      // Check time limit
      await checkTimeLimit(domain, tabData[domain]);
    } else {
      // If the active tab doesn't have a URL, reset active tab tracking
      await checkActiveTab();
    }
  } catch (error) {
    console.log("Error updating active tab time:", error);
    // Tab might have been closed
    if (error.message && error.message.includes("No tab with id")) {
      activeTabId = null;
      lastActiveTime = null;
      activeDomain = null;
      // Try to find a new active tab
      await checkActiveTab();
    }
  } finally {
    isUpdating = false;
  }
}

// Function to start the update interval with heartbeat checking
function startUpdateInterval() {
  // Clear any existing interval first
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  
  // Set up a regular interval to update tab time every second
  updateInterval = setInterval(async () => {
    await updateActiveTabTime();
  }, 1000);
  
  // Add a separate heartbeat interval to check the active tab regularly
  // This helps recover from any state where tracking might have stopped
  setInterval(async () => {
    const currentTime = Date.now();
    if (currentTime - lastActiveUpdate > 3000) {
      console.log("Heartbeat check - no recent updates, checking active tab");
      await checkActiveTab();
    }
  }, 5000);
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
  lastActiveUpdate = Date.now();

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
    lastActiveUpdate = Date.now();
    
    // Update active domain
    activeDomain = new URL(tab.url).hostname;
    chrome.storage.local.set({ activeDomain: activeDomain });
  }
  
  // Any tab update might indicate user activity, so update the activity time
  if (tabId === activeTabId) {
    lastActiveUpdate = Date.now();
  }
});

// Track tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
  // If the closed tab was the active tab, reset active tab state
  if (tabId === activeTabId) {
    activeTabId = null;
    lastActiveTime = null;
    activeDomain = null;
    chrome.storage.local.set({ activeDomain: null });
    
    // Try to find a new active tab
    await checkActiveTab();
  }

  // Cleanup tab data - remove domains that no longer have open tabs
  await cleanupClosedTabs();
});

// Handle window focus events
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  // If a window gets focus, check active tab
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    await checkActiveTab();
  }
});

// Track user activity through clicks and other interactions
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'USER_ACTIVITY') {
    // Update the active time
    lastActiveUpdate = Date.now();
    sendResponse({ success: true });
    return true;
  }
  
  if (request.type === 'GET_TAB_DATA') {
    // Run cleanup before sending data
    checkActiveTab().then(() => {
      cleanupClosedTabs().then(() => {
        sendResponse({ 
          tabData: tabData,
          activeDomain: activeDomain,
          timeLimits: timeLimits,
          strictLimits: strictLimits
        });
      });
    });
    return true;
  } else if (request.type === 'CLEAR_DATA') {
    // Reset all state
    tabData = {};
    timeLimits = {};
    strictLimits = {};
    activeDomain = null;
    alertedDomains.clear();
    
    // Keep tracking the current tab
    if (isTrackingEnabled) {
      lastActiveTime = Date.now();
      lastActiveUpdate = Date.now();
    } else {
      activeTabId = null;
      lastActiveTime = null;
    }
    
    // Clear storage
    chrome.storage.local.set({ 
      tabData: {}, 
      timeLimits: {},
      strictLimits: {},
      activeDomain: null 
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  } else if (request.type === 'SET_TIME_LIMIT') {
    // Update time limit for a domain
    const { domain, limit, strict } = request;
    
    if (limit) {
      timeLimits[domain] = limit;
      // Update strict limit status
      if (strict) {
        strictLimits[domain] = true;
      } else {
        delete strictLimits[domain];
      }
    } else {
      // If limit is removed, remove both regular and strict limits
      delete timeLimits[domain];
      delete strictLimits[domain];
    }
    
    chrome.storage.local.set({ 
      timeLimits: timeLimits,
      strictLimits: strictLimits
    }, () => {
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
      checkActiveTab();
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
    lastActiveUpdate = Date.now();
  }
});

// For robust tracking, we need to modify app.jsx to report user activity
// This will help keep tracking running even during long periods of inactivity

// Cleanup on initial load
cleanupClosedTabs();

// Initialize right away
startUpdateInterval();

// Check active tab initially
checkActiveTab();