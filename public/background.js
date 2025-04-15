let activeTabId = null;
let lastActiveTime = null;
let tabData = {};
let activeDomain = null;
let timeLimits = {};  // Store time limits for domains
let alertedDomains = new Set();  // Track which domains have been alerted

// Load existing data from storage
chrome.storage.local.get(["tabData", "activeDomain", "timeLimits"], (result) => {
  if (result.tabData) {
    tabData = result.tabData;
  }
  if (result.activeDomain) {
    activeDomain = result.activeDomain;
  }
  if (result.timeLimits) {
    timeLimits = result.timeLimits;
  }
});

// Function to check time limits and show alert
const checkTimeLimit = async (domain, timeSpent) => {
  if (timeLimits[domain] && timeSpent >= timeLimits[domain] && !alertedDomains.has(domain)) {
    // Show notification
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

// Track tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log("Tab activated:", activeInfo);
  const currentTime = Date.now();

  if (activeTabId && lastActiveTime) {
    const timeSpent = currentTime - lastActiveTime;
    try {
      const previousTab = await chrome.tabs.get(activeTabId);
      if (previousTab.url) {
        const domain = new URL(previousTab.url).hostname;
        if (!tabData[domain]) {
          tabData[domain] = 0;
        }
        tabData[domain] += timeSpent;
        chrome.storage.local.set({ tabData: tabData });
        
        // Check time limit for the previous tab
        await checkTimeLimit(domain, tabData[domain]);
      }
    } catch (error) {
      console.log("Previous tab no longer exists:", error);
      activeTabId = null;
      lastActiveTime = null;
      activeDomain = null;
      chrome.storage.local.set({ activeDomain: null });
    }
  }

  activeTabId = activeInfo.tabId;
  lastActiveTime = currentTime;

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

// Track tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === activeTabId && changeInfo.url) {
    const currentTime = Date.now();
    if (lastActiveTime) {
      const timeSpent = currentTime - lastActiveTime;
      const domain = new URL(tab.url).hostname;
      if (!tabData[domain]) {
        tabData[domain] = 0;
      }
      tabData[domain] += timeSpent;
      chrome.storage.local.set({ tabData: tabData });
      
      // Check time limit for the updated tab
      checkTimeLimit(domain, tabData[domain]);
    }
    lastActiveTime = currentTime;
    
    // Update active domain
    activeDomain = new URL(tab.url).hostname;
    chrome.storage.local.set({ activeDomain: activeDomain });
  }
});

// Track tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === activeTabId) {
    activeTabId = null;
    lastActiveTime = null;
    activeDomain = null;
    chrome.storage.local.set({ activeDomain: null });
  }

  // Get all tabs to check if any tabs from the same domain remain
  const tabs = await chrome.tabs.query({});
  const domains = new Set(tabs.map(tab => {
    try {
      return new URL(tab.url).hostname;
    } catch {
      return null;
    }
  }));

  // Remove domains that no longer have any open tabs
  const updatedTabData = {};
  for (const [domain, time] of Object.entries(tabData)) {
    if (domains.has(domain)) {
      updatedTabData[domain] = time;
    }
  }

  // Update storage if changes were made
  if (Object.keys(updatedTabData).length !== Object.keys(tabData).length) {
    tabData = updatedTabData;
    chrome.storage.local.set({ tabData: tabData });
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_TAB_DATA') {
    // If there's an active tab, update its time before sending data
    if (activeTabId && lastActiveTime) {
      const currentTime = Date.now();
      const timeSpent = currentTime - lastActiveTime;
      chrome.tabs.get(activeTabId).then(tab => {
        if (tab.url) {
          const domain = new URL(tab.url).hostname;
          if (!tabData[domain]) {
            tabData[domain] = 0;
          }
          tabData[domain] += timeSpent;
          lastActiveTime = currentTime; // Update lastActiveTime after adding the time
          chrome.storage.local.set({ tabData: tabData }, () => {
            // Check time limit before sending response
            checkTimeLimit(domain, tabData[domain]);
            sendResponse({ 
              tabData: tabData,
              activeDomain: activeDomain,
              timeLimits: timeLimits
            });
          });
        }
      }).catch(() => {
        sendResponse({ 
          tabData: tabData,
          activeDomain: activeDomain,
          timeLimits: timeLimits
        });
      });
    } else {
      sendResponse({ 
        tabData: tabData,
        activeDomain: activeDomain,
        timeLimits: timeLimits
      });
    }
    return true; // Required for async response
  } else if (request.type === 'CLEAR_DATA') {
    // Reset all state
    tabData = {};
    activeDomain = null;
    activeTabId = null;
    lastActiveTime = null;
    alertedDomains.clear();
    
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
  }
}); 