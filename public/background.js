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
let activeTabs = []; // Store all tabs that are currently active
let dailyTabData = {}; // Store daily tab data
let lastTabCheck = 0; // Last time we did a full tab check
let currentSessionStartTime = null; // Track when the current session started
let isBrowserJustStarted = false; // Flag to identify browser startup

// Function to get today's date in YYYY-MM-DD format
const getTodayDateString = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

// Initialize session tracking
function initializeSession() {
  // Always start a new session when initializing
  // This ensures we don't continue sessions from before the browser was closed
  startNewSession();
}

// Function to start a new session
function startNewSession() {
  const newSessionStartTime = Date.now();
  const newSessionId = `session_${newSessionStartTime}`;

  // Save to session storage (persists until browser closes)
  chrome.storage.session.set({
    sessionStartTime: newSessionStartTime,
    sessionId: newSessionId
  });

  // Save to local storage for persistence across extension reloads
  chrome.storage.local.set({
    persistentSessionStartTime: newSessionStartTime,
    persistentSessionId: newSessionId,
    lastSessionId: newSessionId
  });

  // Update our local reference
  currentSessionStartTime = newSessionStartTime;

  console.log("New session started:", newSessionId, "at", new Date(newSessionStartTime));

  return newSessionId;
}

// Load existing data from storage
chrome.storage.local.get([
  "tabData", 
  "activeDomain", 
  "timeLimits", 
  "strictLimits", 
  "isTrackingEnabled",
  "dailyTabData",
  "extensionReloadCount" // Track how many times the extension has been reloaded
], (result) => {
  // Increment and save the reload counter - this will help us detect multiple reloads
  let reloadCount = 0;
  if (result.extensionReloadCount !== undefined) {
    reloadCount = result.extensionReloadCount + 1;
  }
  chrome.storage.local.set({ extensionReloadCount: reloadCount });
  console.log(`Extension reload count: ${reloadCount}`);

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
  if (result.dailyTabData) {
    dailyTabData = result.dailyTabData;
  }

  // Initialize daily data for today if not exists
  const todayStr = getTodayDateString();
  if (!dailyTabData[todayStr]) {
    dailyTabData[todayStr] = {
      tabData: {},
      websitesVisited: [],
      totalTime: 0
    };
    chrome.storage.local.set({ dailyTabData });
  }

  // Check if this is an extension load from a browser startup
  // Chrome sends different events for startup vs installation  
  chrome.runtime.getPlatformInfo(function(info) {
    // We only initialize a session if the extension is loaded by the user
    // This avoids background tracking when the browser is closed
    console.log("Extension loaded, platform:", info.os);

    // Check for and remove any domains that don't have open tabs
    cleanupClosedTabs();

    // DON'T reset session time or initialize a new session here
    // This prevents losing session data when extension is reloaded

    // Initial active tab check to detect current state
    checkAllTabs();
  });
});

// Function to update daily tracking data
function updateDailyData(domain, timeAdded) {
  const todayStr = getTodayDateString();

  // Initialize daily data for today if not exists
  if (!dailyTabData[todayStr]) {
    dailyTabData[todayStr] = {
      tabData: {},
      websitesVisited: [],
      totalTime: 0
    };
  }

  const todayData = dailyTabData[todayStr];

  // Initialize domain data if not exists
  if (!todayData.tabData[domain]) {
    todayData.tabData[domain] = 0;
  }

  // Add time to domain
  todayData.tabData[domain] += timeAdded;

  // Add to websites visited if not already in list
  if (!todayData.websitesVisited.includes(domain)) {
    todayData.websitesVisited.push(domain);
  }

  // Update total time
  todayData.totalTime = Object.values(todayData.tabData).reduce((a, b) => a + b, 0);

  // Save to storage
  chrome.storage.local.set({ dailyTabData });
}

// Function to check and get all active tabs
async function checkAllTabs() {
  if (!isTrackingEnabled) return;

  try {
    // Update the timestamp of the last check
    const currentTime = Date.now();
    lastTabCheck = currentTime;

    // Get only active tabs from all windows
    let activeTabsList = [];

    // Get all windows
    const windows = await chrome.windows.getAll({ populate: true });

    // Get active tab from each window
    for (const window of windows) {
      // For each window, find the active tab (the one visible to the user)
      const activeTab = window.tabs.find(tab => tab.active);
      if (activeTab && isValidTab(activeTab)) {
        activeTabsList.push(activeTab);

        // If this window is focused, it's the primary active tab
        if (window.focused) {
          activeTabId = activeTab.id;
          lastActiveTime = Date.now();
          lastActiveUpdate = Date.now();

          // Update active domain for the popup display
          if (activeTab.url) {
            try {
              // Handle special URLs like chrome:// and about:
              if (activeTab.url.startsWith('chrome://') || 
                  activeTab.url.startsWith('chrome-extension://') ||
                  activeTab.url.startsWith('about:') ||
                  activeTab.url.startsWith('edge://')) {
                // Extract the special URL as domain (e.g., "chrome://extensions")
                const urlParts = activeTab.url.split('/');
                // Use first two parts (protocol + location)
                activeDomain = urlParts.slice(0, 3).join('/').replace(/\/$/, '');
              } else {
                // Regular URL - use hostname
                activeDomain = new URL(activeTab.url).hostname;
              }

              // If domain is empty (like for new tabs), use a placeholder
              if (!activeDomain) {
                activeDomain = "New Tab";
              }

              chrome.storage.local.set({ activeDomain });
            } catch (error) {
              console.log("Error setting active domain:", error);
            }
          }
        }
      }
    }

    // Update our activeTabs list with all trackable active tabs (one per window)
    activeTabs = activeTabsList.filter(tab => {
      try {
        return tab.url;
      } catch (e) {
        return false;
      }
    });

    // If we have active tabs but no session, start one
    if (activeTabs.length > 0 && !currentSessionStartTime) {
      startNewSession();
    }

    console.log(`Tracking ${activeTabs.length} active tabs across ${new Set(activeTabs.map(tab => tab.windowId)).size} windows`);
  } catch (error) {
    console.log("Error checking active tabs:", error);
  }
}

// Helper function to check if a tab is valid for tracking
function isValidTab(tab) {
  try {
    return tab && 
           tab.url && 
           tab.status === 'complete';
  } catch (e) {
    return false;
  }
}

// Function to check time limits and show alert or close tabs
const checkTimeLimit = async (domain, timeSpent) => {
  if (timeLimits[domain] && timeSpent >= timeLimits[domain]) {
    // If this is a strict limit, close all tabs for this domain
    if (strictLimits[domain]) {
      // Only proceed if we haven't already alerted about this domain
      if (!alertedDomains.has(domain)) {
        console.log(`Strict time limit reached for ${domain}. Closing tabs...`);

        // Mark domain as alerted to prevent repeated notifications
        alertedDomains.add(domain);

        // Find all tabs with this domain
        const tabs = await chrome.tabs.query({});
        let tabsClosed = 0;

        for (const tab of tabs) {
          try {
            // Match the domain format exactly as it appears in our tabData
            let tabDomain;

            if (tab.url) {
              // For special URLs like chrome://, about:, etc.
              if (tab.url.startsWith('chrome://') || 
                  tab.url.startsWith('chrome-extension://') ||
                  tab.url.startsWith('about:') ||
                  tab.url.startsWith('edge://')) {
                // Extract the special URL as domain
                const urlParts = tab.url.split('/');
                tabDomain = urlParts.slice(0, 3).join('/').replace(/\/$/, '');
              } else {
                // Regular URL - use hostname
                tabDomain = new URL(tab.url).hostname;
              }

              // For new tabs
              if (!tabDomain) {
                tabDomain = "New Tab";
              }

              // Close tabs that match the exact domain
              if (tabDomain === domain) {
                await chrome.tabs.remove(tab.id);
                tabsClosed++;
              }
            }
          } catch (error) {
            console.log("Error processing tab for strict limit:", error);
          }
        }

        // Show notification only once when tabs are closed
        if (tabsClosed > 0) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Strict Time Limit Enforced',
            message: `Reached limit of ${formatTime(timeLimits[domain])} on ${domain}. ${tabsClosed} tab(s) have been closed.`
          });

          // Remove the strict limit after tabs are closed
          console.log(`Removing strict time limit for ${domain} after enforcement`);
          delete strictLimits[domain];
          delete timeLimits[domain];

          // Save the updated limits to storage
          chrome.storage.local.set({ 
            timeLimits: timeLimits,
            strictLimits: strictLimits
          });
        }

        // Reset the alert flag after 5 minutes
        setTimeout(() => {
          alertedDomains.delete(domain);
        }, 300000); // 5 minutes in milliseconds
      }
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

      // Reset alert after 1 hour for non-strict limits
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
          let domain;

          // For special URLs like chrome://, about:, etc. use the protocol and first part as domain
          if (tab.url.startsWith('chrome://') || 
              tab.url.startsWith('chrome-extension://') ||
              tab.url.startsWith('about:') ||
              tab.url.startsWith('edge://')) {
            // Extract the special URL as domain (e.g., "chrome://extensions")
            const urlParts = tab.url.split('/');
            // Use first two parts (protocol + location)
            domain = urlParts.slice(0, 3).join('/').replace(/\/$/, '');
          } else {
            // Regular URL - use hostname
            domain = new URL(tab.url).hostname;
          }

          // If domain is empty (like for new tabs), use a placeholder
          if (!domain) {
            domain = "New Tab";
          }

          openDomains.add(domain);
        }
      } catch (error) {
        // Skip invalid URLs
        console.log("Error processing tab URL:", error);
      }
    }

    // Get today's date - don't clear daily data for domains
    const todayStr = getTodayDateString();

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

    // Only update if there were changes to current session data
    if (hasChanges) {
      tabData = updatedTabData;

      // Update in storage
      chrome.storage.local.set({ tabData });
      console.log("Removed closed tabs from tracking data");
    }
  } catch (error) {
    console.log("Error cleaning up closed tabs:", error);
  }
}

// Update active tabs time
async function updateAllActiveTabs() {
  // Use a lock to prevent concurrent updates
  if (isUpdating || !isTrackingEnabled) return;

  isUpdating = true;

  try {
    // First do a complete refresh of active tabs if needed
    const currentTime = Date.now();
    if (currentTime - lastTabCheck > 5000) {
      await checkAllTabs();
    }

    // CRITICAL: Do not update time if there's no active session
    // This prevents counting time when browser is closed
    if (!currentSessionStartTime) {
      // Attempt to recover session data if we should have an active session
      if (activeTabs.length > 0) {
        console.log("No session data but active tabs detected - attempting to recover session data");
        
        // Try to restore from persistent storage
        chrome.storage.local.get(['persistentSessionStartTime', 'persistentSessionId'], (result) => {
          if (result.persistentSessionStartTime) {
            console.log("Recovered session from persistent storage:", new Date(result.persistentSessionStartTime));
            currentSessionStartTime = result.persistentSessionStartTime;
            
            // Re-save to both storage types to ensure consistency
            chrome.storage.local.set({
              persistentSessionStartTime: result.persistentSessionStartTime,
              persistentSessionId: result.persistentSessionId
            });
            chrome.storage.session.set({
              sessionStartTime: result.persistentSessionStartTime,
              sessionId: result.persistentSessionId
            });
          } else {
            // If no session data found but we have active tabs, start a new session
            console.log("Could not recover session data - starting new session");
            startNewSession();
          }
        });
      }
      isUpdating = false;
      return;
    }

    if (activeTabs.length === 0) {
      // No active tabs to track
      isUpdating = false;
      return;
    }

    // Update time for all active tabs
    const timeNow = Date.now();
    const timeElapsed = 1000; // Always add exactly 1 second to avoid drift

    // Calculate time per tab
    const timePerTab = timeElapsed / activeTabs.length;

    // Process each active tab
    for (const tab of activeTabs) {
      try {
        if (tab.url) {
          // Get domain or special URL name
          let domain;

          // For special URLs like chrome://, about:, etc. use the protocol and first part as domain
          if (tab.url.startsWith('chrome://') || 
              tab.url.startsWith('chrome-extension://') ||
              tab.url.startsWith('about:') ||
              tab.url.startsWith('edge://')) {
            // Extract the special URL as domain (e.g., "chrome://extensions")
            const urlParts = tab.url.split('/');
            // Use first two parts (protocol + location)
            domain = urlParts.slice(0, 3).join('/').replace(/\/$/, '');
          } else {
            // Regular URL - use hostname
            domain = new URL(tab.url).hostname;
          }

          // If domain is empty (like for new tabs), use a placeholder
          if (!domain) {
            domain = "New Tab";
          }

          // Initialize if needed
          if (!tabData[domain]) {
            tabData[domain] = 0;
          }

          // Update time
          tabData[domain] += timeElapsed;

          updateDailyData(domain, timePerTab);

          // Check time limit
          await checkTimeLimit(domain, tabData[domain]);
        }
      } catch (error) {
        console.log("Error processing tab in tracking:", error);
      }
    }

    // Save all tab data to storage along with session information
    // This ensures the session data is consistently maintained during extension reloads
    await chrome.storage.local.set({ 
      tabData,
      // Always re-save the session data with each update to ensure persistence
      persistentSessionStartTime: currentSessionStartTime,
      persistentSessionId: `session_${currentSessionStartTime}`
    });
    
    // Keep session storage in sync as well
    await chrome.storage.session.set({
      sessionStartTime: currentSessionStartTime,
      sessionId: `session_${currentSessionStartTime}`
    });

    // Update lastActiveTime for the next update
    lastActiveTime = timeNow;

  } catch (error) {
    console.log("Error in tab tracking update:", error);
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
    // Always update time if we have a valid session
    // The session will ONLY be created when browser is actually open
    // and it will be reset when browser closes (via onStartup event)
    if (currentSessionStartTime) {
      await updateAllActiveTabs();
    }
  }, 1000);

  // Add a separate heartbeat interval to check active tabs regularly
  // This helps recover from any state where tracking might have stopped
  setInterval(async () => {
    await checkAllTabs();
  }, 10000);
}

// Track tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log("Tab activated:", activeInfo);

  // Update activeTabId and lastActiveTime
  activeTabId = activeInfo.tabId;
  lastActiveTime = Date.now();
  lastActiveUpdate = Date.now();

  // Start a session if we don't have one yet
  if (!currentSessionStartTime) {
    startNewSession();
  }

  // Always refresh our active tabs list
  await checkAllTabs();
});

// Track tab updates (URL changes)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!isTrackingEnabled) return;

  // If URL changed in any tab, refresh our active tabs
  if (changeInfo.url) {
    console.log("Tab URL changed:", tabId, changeInfo.url);
    lastActiveUpdate = Date.now();
    await checkAllTabs();
  }

  // If the tab's status changed to 'complete', it might be relevant
  if (changeInfo.status === 'complete') {
    await checkAllTabs();
  }

  // Any tab update might indicate user activity
  lastActiveUpdate = Date.now();
});

// Track tab creation
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!isTrackingEnabled) return;

  console.log("New tab created:", tab.id);
  lastActiveUpdate = Date.now();

  // New tab created, refresh our active tabs list
  await checkAllTabs();
});

// Track tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
  // If the closed tab was the active tab, reset active tab state
  if (tabId === activeTabId) {
    activeTabId = null;
    lastActiveTime = null;

    // Try to find a new active tab
    await checkAllTabs();
  }

  // Update our active tabs list
  const tabIndex = activeTabs.findIndex(tab => tab.id === tabId);
  if (tabIndex >= 0) {
    activeTabs.splice(tabIndex, 1);
  }

  // Wait a moment for the tab close to complete
  setTimeout(async () => {
    // Cleanup tab data and refresh tabs
    await cleanupClosedTabs();
    await checkAllTabs();
  }, 500);
});

// Handle window focus events
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  // If a window gets focus, check active tabs
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    lastActiveUpdate = Date.now();
    await checkAllTabs();
  }
});

// Listen for window creation
chrome.windows.onCreated.addListener(async (window) => {
  // New window created, check active tabs
  lastActiveUpdate = Date.now();
  await checkAllTabs();
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
    // Force refresh if requested
    if (request.forceRefresh) {
      checkAllTabs().then(() => {
        cleanupClosedTabs().then(() => {
          // Get today's data
          const todayStr = getTodayDateString();
          const todayData = dailyTabData[todayStr] || { websitesVisited: [], totalTime: 0 };

          // Send response with all data
          sendResponse({ 
            tabData: tabData,
            activeDomain: activeDomain,
            timeLimits: timeLimits,
            strictLimits: strictLimits,
            activeTabs: activeTabs,
            dailyData: todayData,
            sessionStartTime: currentSessionStartTime,
            currentSessionTime: currentSessionStartTime ? Date.now() - currentSessionStartTime : 0
          });
        });
      });
    } else {
      // Get today's data
      const todayStr = getTodayDateString();
      const todayData = dailyTabData[todayStr] || { websitesVisited: [], totalTime: 0 };

      // Send current data without refresh
      sendResponse({ 
        tabData: tabData,
        activeDomain: activeDomain,
        timeLimits: timeLimits,
        strictLimits: strictLimits,
        activeTabs: activeTabs,
        dailyData: todayData,
        sessionStartTime: currentSessionStartTime,
        currentSessionTime: currentSessionStartTime ? Date.now() - currentSessionStartTime : 0
      });
    }
    return true;
  } else if (request.type === 'CLEAR_DATA') {
    // Reset session state
    tabData = {};
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

    // Clear session storage
    chrome.storage.local.set({ 
      tabData: {}, 
      activeDomain: null 
    }, () => {
      sendResponse({ success: true });
    });

    // Refresh active tabs
    checkAllTabs();

    return true;
  } else if (request.type === 'CLEAR_DAILY_DATA') {
    // Reset daily data for today
    const todayStr = getTodayDateString();

    if (dailyTabData[todayStr]) {
      dailyTabData[todayStr] = {
        tabData: {},
        websitesVisited: [],
        totalTime: 0
      };

      // Save to storage
      chrome.storage.local.set({ dailyTabData }, () => {
        sendResponse({ success: true });
      });
    } else {
      sendResponse({ success: true });
    }

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
      // Keep the tab IDs but don't track time
      lastActiveTime = null;
    } else {
      // If tracking was enabled, start a new session
      lastActiveTime = Date.now();
      lastActiveUpdate = Date.now();

      // Start a new session if there isn't one
      if (!currentSessionStartTime) {
        startNewSession();
      }

      checkAllTabs();
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

// Listen for browser startup - this event fires when the browser starts
chrome.runtime.onStartup.addListener(() => {
  console.log("Browser started - initializing session tracking");
  // Force a new session when browser starts (not continuing from background)
  currentSessionStartTime = null;
  
  // Set our browser startup flag to true - this will prevent restoration of old sessions
  isBrowserJustStarted = true;
  
  // Record browser startup time
  const startupTime = Date.now();
  chrome.storage.local.set({ lastBrowserStartTime: startupTime });
  
  // Start a new session when the browser starts
  initializeSession();
  // Make sure we check for active tabs immediately
  checkAllTabs();
});

// When the extension is about to be unloaded (browser close or extension disable)
chrome.runtime.onSuspend.addListener(() => {
  console.log("Browser closing - recording shutdown time");
  
  // Record the time of browser closure
  const closeTime = Date.now();
  chrome.storage.local.set({ lastBrowserCloseTime: closeTime });
});

// Cleanup on initial load
cleanupClosedTabs();

// Handle extension initialization based on startup type
// We need to use storage to first check if this is a browser startup
chrome.storage.local.get(['lastBrowserCloseTime', 'extensionReloadCount', 'persistentSessionStartTime', 'persistentSessionId'], (result) => {
  if (isBrowserJustStarted) {
    console.log("Browser startup detected - resetting session time to 0");
    
    // On browser startup, we reset everything
    currentSessionStartTime = null;
    
    // Reset the reload counter on browser startup
    chrome.storage.local.set({ extensionReloadCount: 0 });
    
    // Clear session data from storage
    chrome.storage.local.remove(['persistentSessionStartTime', 'persistentSessionId']);
    chrome.storage.session.remove(['sessionStartTime', 'sessionId']);
    
    // Initialize a fresh session
    initializeSession();
    
    // Reset the startup flag
    isBrowserJustStarted = false;
    
    // Start tracking
    startUpdateInterval();
    checkAllTabs();
  } else {
    console.log("Extension reload detected - preserving current session");
    
    // IMPORTANT: Always preserve existing session data on extension reload
    if (result.persistentSessionStartTime && result.persistentSessionId) {
      // Restore session from previous extension load
      console.log(`Restoring session ${result.persistentSessionId} with start time ${new Date(result.persistentSessionStartTime)}`);
      currentSessionStartTime = result.persistentSessionStartTime;
      
      // Make sure session storage is also updated for consistency
      chrome.storage.session.set({
        sessionStartTime: result.persistentSessionStartTime,
        sessionId: result.persistentSessionId
      });
      
      // Verify the session data was properly saved to local storage
      // This ensures it's available for the next extension reload
      chrome.storage.local.set({
        persistentSessionStartTime: result.persistentSessionStartTime,
        persistentSessionId: result.persistentSessionId,
      });
    } else {
      // If no persistent session data found, check session storage
      chrome.storage.session.get(['sessionStartTime', 'sessionId'], (sessionResult) => {
        if (sessionResult.sessionStartTime && sessionResult.sessionId) {
          console.log("Restoring session from current browser session:", sessionResult.sessionId);
          currentSessionStartTime = sessionResult.sessionStartTime;
          
          // Save to persistent storage for future reloads
          chrome.storage.local.set({
            persistentSessionStartTime: sessionResult.sessionStartTime,
            persistentSessionId: sessionResult.sessionId
          });
        } else {
          // No session data at all, initialize a new one
          // This should only happen on first install, not on reload
          console.log("No existing session found, initializing new session");
          initializeSession();
        }
      });
    }
    
    // Always start interval and check tabs
    startUpdateInterval();
    checkAllTabs();
  }
});