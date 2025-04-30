import { useState, useEffect, useRef } from "react";
import {
  FaClock,
  FaTrash,
  FaCog,
  FaChartLine,
  FaExclamationTriangle,
  // FaPieChart,
  FaBars,
  FaTimes,
  FaChartPie,
  FaSun,
  FaMoon,
  FaCalendarDay,
} from "react-icons/fa";
import PieChart from "./PieChart";
import "./styles.css";
import { IoMdRefresh } from "react-icons/io";

function App() {
  const [tabData, setTabData] = useState({});
  const [activeDomain, setActiveDomain] = useState(null);
  const [timeLimits, setTimeLimits] = useState({});
  const [strictLimits, setStrictLimits] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(true);
  const [isStrictMode, setIsStrictMode] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [activeTabs, setActiveTabs] = useState([]);
  const [todayWebsitesVisited, setTodayWebsitesVisited] = useState([]);
  const [todayTotalTime, setTodayTotalTime] = useState(0);
  const [currentSessionTime, setCurrentSessionTime] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [dailyTabData, setDailyTabData] = useState({});
  const lastUpdateTime = useRef(Date.now());
  const dropdownRef = useRef(null);
  const menuRef = useRef(null);
  const [count, setCount] = useState(0);
  const [lastSessionId, setLastSessionId] = useState(null);

  // Function to get today's date in YYYY-MM-DD format
  const getTodayDateString = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(today.getDate()).padStart(2, "0")}`;
  };

  // Function to start a new session
  const startNewSession = () => {
    const newSessionStartTime = Date.now();
    const newSessionId = `session_${newSessionStartTime}`;

    // Save session data to chrome.storage.session which is cleared when browser closes
    chrome.storage.session.set({
      sessionStartTime: newSessionStartTime,
      sessionId: newSessionId,
    });

    // Update state
    setSessionStartTime(newSessionStartTime);
    setCurrentSessionTime(0);
    setLastSessionId(newSessionId);

    // Log for debugging
    console.log("New session started:", newSessionId);

    return newSessionId;
  };

  // Function to get latest tab data
  const getTabData = (force = false) => {
    const currentTime = Date.now();
    console.log("Getting tab data, force:", force);
    // Skip the time check if force=true to allow immediate updates
    if (force || currentTime - lastUpdateTime.current >= 1000) {
      chrome.runtime.sendMessage(
        {
          type: "GET_TAB_DATA",
          multiTabTracking: true, // Always use multi-tab tracking
          forceRefresh: true, // Force refresh to detect new tabs/sites
        },
        (response) => {
          if (response) {
            console.log("Got tab data response:", response);
            setTabData(response.tabData || {});
            setActiveDomain(response.activeDomain);
            setTimeLimits(response.timeLimits || {});
            setStrictLimits(response.strictLimits || {});

            // Update tracking state if needed
            if (
              response.isTrackingEnabled !== undefined &&
              response.isTrackingEnabled !== isTrackingEnabled
            ) {
              console.log(
                "Updating tracking state:",
                response.isTrackingEnabled
              );
              setIsTrackingEnabled(response.isTrackingEnabled);
            }

            if (response.activeTabs) {
              setActiveTabs(response.activeTabs);
            }
            if (response.dailyData) {
              setTodayWebsitesVisited(response.dailyData.websitesVisited || []);
              setTodayTotalTime(response.dailyData.totalTime || 0);
            }
            setDailyTabData(response.dailyData.tabData || {});

            // Handle session time calculation
            if (!isTrackingEnabled) {
              // If tracking is disabled, get accurate paused time
              if (response.currentSessionTime !== undefined) {
                console.log(
                  "Using session time from response (tracking disabled):",
                  response.currentSessionTime
                );
                setCurrentSessionTime(response.currentSessionTime);
              } else {
                // Double check storage for paused time
                chrome.storage.local.get(
                  ["trackingPaused", "persistentSessionTimeAtPause"],
                  (pauseData) => {
                    if (
                      pauseData.trackingPaused &&
                      pauseData.persistentSessionTimeAtPause
                    ) {
                      console.log(
                        "Using paused session time from storage:",
                        pauseData.persistentSessionTimeAtPause
                      );
                      setCurrentSessionTime(
                        pauseData.persistentSessionTimeAtPause
                      );
                    }
                  }
                );
              }
            } else {
              // Update current session time - for active tracking
              if (response.currentSessionTime !== undefined) {
                console.log(
                  "Using session time from response (tracking enabled):",
                  response.currentSessionTime
                );
                setCurrentSessionTime(response.currentSessionTime);
              } else if (sessionStartTime) {
                const elapsed = Math.floor(Date.now() - sessionStartTime);
                console.log(
                  "Calculating session time from start time:",
                  elapsed
                );
                setCurrentSessionTime(elapsed);
              }
            }

            lastUpdateTime.current = currentTime;
          }
        }
      );
    }
  };

  // Function to signal user activity to background script
  const signalActivity = () => {
    chrome.runtime.sendMessage({ type: "USER_ACTIVITY" });
  };

  useEffect(() => {
    // First, check if there's a session in session storage
    chrome.storage.session.get(
      ["sessionId", "sessionStartTime"],
      (sessionResult) => {
        // Then check local storage for persistent data
        chrome.storage.local.get(
          [
            "tabData",
            "activeDomain",
            "timeLimits",
            "strictLimits",
            "isTrackingEnabled",
            "dailyTabData",
            "lastSessionId",
            "trackingPaused",
            "persistentSessionTimeAtPause",
          ],
          (result) => {
            if (result.tabData) {
              setTabData(result.tabData);
            }
            if (result.activeDomain) {
              setActiveDomain(result.activeDomain);
            }
            if (result.timeLimits) {
              setTimeLimits(result.timeLimits);
            }
            if (result.strictLimits) {
              setStrictLimits(result.strictLimits);
            }
            if (result.isTrackingEnabled !== undefined) {
              setIsTrackingEnabled(result.isTrackingEnabled);
            }

            const storedLastSessionId = result.lastSessionId;
            setLastSessionId(storedLastSessionId);

            // Check if tracking is paused - handle the stored pause time
            if (result.trackingPaused && result.persistentSessionTimeAtPause) {
              console.log(
                "Found paused tracking data:",
                result.persistentSessionTimeAtPause
              );
              // If tracking is paused, use the exact time that was saved at pause
              setCurrentSessionTime(result.persistentSessionTimeAtPause);

              // Still set the session start time for reference
              if (sessionResult.sessionStartTime) {
                setSessionStartTime(sessionResult.sessionStartTime);
              }
            } else if (!sessionResult.sessionId) {
              // Only start a new session if there isn't an existing one
              const newSessionId = startNewSession();
              chrome.storage.local.set({ lastSessionId: newSessionId });
            } else {
              // Continue existing session
              setSessionStartTime(sessionResult.sessionStartTime);
              // Calculate time for current session
              const elapsed = Math.floor(
                Date.now() - sessionResult.sessionStartTime
              );
              if (result.isTrackingEnabled !== false) {
                setCurrentSessionTime(elapsed);
              } else {
                // Fetch the latest pause time if tracking is disabled
                chrome.runtime.sendMessage(
                  { type: "GET_TAB_DATA", forceRefresh: true },
                  (response) => {
                    if (response && response.currentSessionTime) {
                      console.log(
                        "Setting paused session time from GET_TAB_DATA:",
                        response.currentSessionTime
                      );
                      setCurrentSessionTime(response.currentSessionTime);
                    }
                  }
                );
              }
            }

            // Get today's data
            if (result.dailyTabData) {
              const todayStr = getTodayDateString();
              const todayData = result.dailyTabData[todayStr];

              if (todayData) {
                setTodayWebsitesVisited(todayData.websitesVisited || []);
                setTodayTotalTime(todayData.totalTime || 0);
              }
            }

            // Force immediate refresh of tab data on initial load
            getTabData(true);
          }
        );
      }
    );

    // Set up interval for updating current session time
    const sessionTimeInterval = setInterval(() => {
      if (sessionStartTime && isTrackingEnabled) {
        const elapsed = Math.floor(Date.now() - sessionStartTime);
        setCurrentSessionTime(elapsed);
      }
    }, 1000);

    const tabDataInterval = setInterval(getTabData, 1000);

    return () => {
      clearInterval(tabDataInterval);
      clearInterval(sessionTimeInterval);
    };
  }, [sessionStartTime, isTrackingEnabled]);

  // Click outside dropdown to close
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

  // Add event listeners for user activity
  useEffect(() => {
    const activityEvents = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
    ];
    activityEvents.forEach((event) => {
      document.addEventListener(event, signalActivity);
    });

    return () => {
      activityEvents.forEach((event) => {
        document.removeEventListener(event, signalActivity);
      });
    };
  }, []);

  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m ${seconds % 60}s`;
  };

  const clearData = () => {
    chrome.runtime.sendMessage({ type: "CLEAR_DATA" }, (response) => {
      if (response && response.success) {
        console.log("Session reset successful, response:", response);

        // Reset all frontend state
        setTabData({});
        setActiveDomain(null);

        // Update with new session data from background
        if (response.sessionStartTime) {
          console.log("Setting new session time:", response.sessionStartTime);
          setSessionStartTime(response.sessionStartTime);
        }

        // Reset current session time to 0
        setCurrentSessionTime(0);

        // Force a data refresh from background
        setTimeout(() => {
          getTabData(true);
        }, 100);
      }
    });
  };

  const clearDailyData = () => {
    chrome.runtime.sendMessage({ type: "CLEAR_DAILY_DATA" }, (response) => {
      if (response && response.success) {
        setTodayWebsitesVisited([]);
        setTodayTotalTime(0);
      }
    });
  };

  const toggleTracking = () => {
    const newTrackingState = !isTrackingEnabled;
    chrome.runtime.sendMessage(
      {
        type: "TOGGLE_TRACKING",
        enabled: newTrackingState,
      },
      (response) => {
        if (response && response.success) {
          setIsTrackingEnabled(newTrackingState);

          // We need a small delay to make sure background.js has time to process the toggle
          // This is especially important when pausing tracking to ensure the pauseTime is saved
          setTimeout(() => {
            console.log(
              "Getting updated data after toggling tracking:",
              newTrackingState
            );

            // Get the latest updated data from background.js immediately
            chrome.runtime.sendMessage(
              {
                type: "GET_TAB_DATA",
                forceRefresh: true,
              },
              (dataResponse) => {
                if (dataResponse) {
                  console.log("Got data response after toggle:", dataResponse);

                  // If tracking is now disabled, we should have a paused session time
                  if (!newTrackingState) {
                    // Check paused state in storage directly to be certain we get the right time
                    chrome.storage.local.get(
                      ["trackingPaused", "persistentSessionTimeAtPause"],
                      (pauseData) => {
                        if (
                          pauseData.trackingPaused &&
                          pauseData.persistentSessionTimeAtPause
                        ) {
                          console.log(
                            "Setting paused time from storage:",
                            pauseData.persistentSessionTimeAtPause
                          );
                          setCurrentSessionTime(
                            pauseData.persistentSessionTimeAtPause
                          );
                        } else if (dataResponse.currentSessionTime) {
                          console.log(
                            "Setting paused time from response:",
                            dataResponse.currentSessionTime
                          );
                          setCurrentSessionTime(
                            dataResponse.currentSessionTime
                          );
                        }
                      }
                    );
                  } else {
                    // For enabled tracking, use time from background
                    if (dataResponse.sessionStartTime) {
                      setSessionStartTime(dataResponse.sessionStartTime);
                      // Use the exact current session time from background
                      if (dataResponse.currentSessionTime) {
                        setCurrentSessionTime(dataResponse.currentSessionTime);
                      } else {
                        // Calculate it from start time
                        const elapsed = Math.floor(
                          Date.now() - dataResponse.sessionStartTime
                        );
                        setCurrentSessionTime(elapsed);
                      }
                    }
                  }

                  // Update other data as well
                  setTabData(dataResponse.tabData || {});
                  setActiveDomain(dataResponse.activeDomain);
                  if (dataResponse.dailyData) {
                    setTodayWebsitesVisited(
                      dataResponse.dailyData.websitesVisited || []
                    );
                    setTodayTotalTime(dataResponse.dailyData.totalTime || 0);
                    setDailyTabData(dataResponse.dailyData.tabData || {});
                  }
                }
              }
            );
          }, 100); // Small delay to ensure background.js has processed the toggle
        }
      }
    );
  };

  const handleSetTimeLimit = () => {
    if (!selectedDomain || !timeLimit) return;

    const limitMs = parseInt(timeLimit) * 60 * 1000;

    chrome.runtime.sendMessage(
      {
        type: "SET_TIME_LIMIT",
        domain: selectedDomain,
        limit: limitMs,
        strict: isStrictMode,
      },
      (response) => {
        if (response && response.success) {
          setTimeLimits((prev) => ({
            ...prev,
            [selectedDomain]: limitMs,
          }));

          if (isStrictMode) {
            setStrictLimits((prev) => ({
              ...prev,
              [selectedDomain]: true,
            }));
          }

          setTimeLimit("");
          setSelectedDomain("");
          setIsStrictMode(false);
        }
      }
    );
  };

  const handleRemoveTimeLimit = (domain) => {
    chrome.runtime.sendMessage(
      {
        type: "SET_TIME_LIMIT",
        domain,
        limit: null,
      },
      (response) => {
        if (response && response.success) {
          const newTimeLimits = { ...timeLimits };
          delete newTimeLimits[domain];
          setTimeLimits(newTimeLimits);

          const newStrictLimits = { ...strictLimits };
          delete newStrictLimits[domain];
          setStrictLimits(newStrictLimits);
        }
      }
    );
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleDomainSelect = (domain) => {
    setSelectedDomain(domain);
    setIsDropdownOpen(false);
  };

  // Calculate total time across all tabs - used for showing tab proportions
  const totalTimeTracked = Object.values(tabData).reduce((a, b) => a + b, 0);
  const websitesTracked = Object.keys(tabData).length;
  const websitesOverLimit = Object.entries(timeLimits).filter(
    ([domain, limit]) => tabData[domain] && tabData[domain] >= limit
  ).length;

  // Calculate total time spent on all websites visited today (for analytics)
  const totalDailyTimeTracked = Object.values(dailyTabData).reduce(
    (a, b) => a + b,
    0
  );

  // Sort the tab data for current session (for dashboard)
  const sortedTabs = Object.entries(tabData)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  // Sort daily website data by time spent (for analytics)
  const sortedDailyTabs = Object.entries(dailyTabData)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  // Prepare data for the pie chart - format data properly for PieChart component
  // Use dailyTabData instead of tabData to show all websites visited today
  const pieChartData = Object.entries(dailyTabData).map(([domain, time]) => ({
    domain,
    time,
  }))
  .sort((a, b) => b.time - a.time)
  .slice(0, 10); // Limit to top 8 to prevent overcrowding the chart

  // Handle navigation menu clicks
  const handleNavigation = (section) => {
    setShowDashboard(false);
    setShowAnalytics(false);
    setShowSettings(false);
    setIsMenuOpen(false);

    if (section === "dashboard") {
      setShowDashboard(true);
    } else if (section === "analytics") {
      setShowAnalytics(true);
      // Refresh data when switching to analytics tab to get the latest website times
      getTabData(true);
    } else if (section === "settings") {
      setShowSettings(true);
    }
  };

  // Click outside menu to close
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        !event.target.classList.contains("menu-toggle")
      ) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuRef]);

  // Save dark mode preference to storage
  useEffect(() => {
    chrome.storage.local.get(["darkMode"], (result) => {
      if (result.darkMode !== undefined) {
        setDarkMode(result.darkMode);
      }
    });
  }, []);

  // Update body class and save dark mode preference when it changes
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add("dark-theme");
    } else {
      document.body.classList.remove("dark-theme");
    }

    // Save the dark mode preference
    chrome.storage.local.set({ darkMode: darkMode });
  }, [darkMode]);

  // Toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  function refresh() {
    setCount(count + 1);
    getTabData(); // Force refresh data
  }

  return (
    <div className={`app-container ${darkMode ? "dark-theme" : ""}`}>
      <div className="nav">
        <h1 className="title">Tablytics</h1>
        <div className="nav-controls">
          <button
            className="theme-toggle"
            onClick={toggleDarkMode}
            aria-label={
              darkMode ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {darkMode ? <FaSun /> : <FaMoon />}
          </button>
          <button
            className="menu-toggle"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {isMenuOpen ? <FaTimes /> : <FaBars />}
          </button>
        </div>
      </div>

      {/* Sliding menu */}
      <div className={`slide-menu ${isMenuOpen ? "open" : ""}`} ref={menuRef}>
        <div className="menu-items">
          <button
            className={`menu-item ${showDashboard ? "active" : ""}`}
            onClick={() => handleNavigation("dashboard")}
          >
            <FaChartLine />
            <span>Dashboard</span>
          </button>
          <button
            className={`menu-item ${showAnalytics ? "active" : ""}`}
            onClick={() => handleNavigation("analytics")}
          >
            <FaChartPie />
            <span>Analytics</span>
          </button>
          <button
            className={`menu-item ${showSettings ? "active" : ""}`}
            onClick={() => handleNavigation("settings")}
          >
            <FaCog />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {!isTrackingEnabled && (
        <div className="tracking-paused-notice">
          <p>Tracking is currently paused. No tab is being tracked.</p>
        </div>
      )}

      {/* Dashboard section */}
      {showDashboard && (
        <>
          <div className="dashboard-container">
            {/* First row of stats cards - Current Session */}
            <div className="stats-card-container">
              <div className="dashboard-card">
                <h2>Current Session</h2>
                <div className="dashboard-value">
                  <FaClock className="dashboard-icon" />
                  <span>{formatTime(currentSessionTime)}</span>
                </div>
              </div>

              <div className="dashboard-card">
                <h2>Tabs opened</h2>
                <div className="dashboard-value">
                  <FaChartLine className="dashboard-icon" />
                  <span>{websitesTracked}</span>
                </div>
              </div>

              <div className="dashboard-card">
                <h2>Websites Over Limit</h2>
                <div className="dashboard-value">
                  <FaExclamationTriangle className="dashboard-icon warning" />
                  <span>{websitesOverLimit}</span>
                </div>
              </div>
            </div>

            {/* Second row of stats cards - Daily Stats */}
            <div className="stats-card-container">
              <div className="dashboard-card">
                <h2>Sites Visited Today</h2>
                <div className="dashboard-value">
                  <FaCalendarDay className="dashboard-icon" />
                  <span>{todayWebsitesVisited.length}</span>
                </div>
              </div>

              <div className="dashboard-card">
                <h2>Total Time Today</h2>
                <div className="dashboard-value">
                  <FaClock className="dashboard-icon" />
                  <span>{formatTime(todayTotalTime)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-container-active-tabs">
            <div className="stats-card">
              <div className="stats-header">
                <h2 className="active-tabs">Active Tabs</h2>
                <div className="total-time">
                  <FaClock />
                  {formatTime(currentSessionTime)}
                </div>
              </div>

              <ul className="tabs-list">
                {sortedTabs.map(([domain, time]) => {
                  // Check if this domain is active in any of the currently tracked tabs
                  console.log(`Checking if domain "${domain}" is active...`);

                  const isActive = activeTabs.some((tab) => {
                    try {
                      if (tab.url) {
                        // Special handling for Chrome special pages
                        if (
                          domain.startsWith("chrome://") ||
                          domain.startsWith("chrome-extension://") ||
                          domain.startsWith("about:") ||
                          domain.startsWith("edge://") ||
                          domain === "New Tab"
                        ) {
                          // For tab URLs that are special pages
                          if (
                            tab.url.startsWith("chrome://") ||
                            tab.url.startsWith("chrome-extension://") ||
                            tab.url.startsWith("about:") ||
                            tab.url.startsWith("edge://")
                          ) {
                            // Extract the special URL as domain
                            const urlParts = tab.url.split("/");
                            // Use protocol + location (e.g., chrome://extensions)
                            const tabDomain = urlParts
                              .slice(0, 3)
                              .join("/")
                              .replace(/\/$/, "");

                            console.log(
                              `Special URL comparison: Tab URL=${
                                tab.url
                              }, Tab domain=${tabDomain}, List domain=${domain}, Match=${
                                tabDomain === domain
                              }`
                            );
                            return tabDomain === domain;
                          }
                          // For new tabs (empty hostname)
                          else if (domain === "New Tab") {
                            try {
                              const hostname = new URL(tab.url).hostname;
                              const isNewTab = hostname === "";
                              console.log(
                                `New Tab check: URL=${tab.url}, hostname=${hostname}, isNewTab=${isNewTab}`
                              );
                              return isNewTab;
                            } catch (e) {
                              return false;
                            }
                          }
                        }
                        // Regular domain comparison
                        else {
                          const hostname = new URL(tab.url).hostname;
                          const match = hostname === domain;
                          if (match) {
                            console.log(
                              `Regular domain match: ${hostname} === ${domain}`
                            );
                          }
                          return match;
                        }
                      }
                      return false;
                    } catch (e) {
                      console.log(
                        "Error in isActive check for domain",
                        domain,
                        ":",
                        e
                      );
                      return false;
                    }
                  });

                  console.log(`Domain "${domain}" active status: ${isActive}`);

                  return (
                    <li
                      key={domain}
                      className={`tab-item ${isActive ? "active" : ""}`}
                    >
                      <div className="tab-header">
                        <div className="domain-info">
                          <img
                            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                            alt={`${domain} icon`}
                            className="favicon"
                            onError={(e) => {
                              e.target.src =
                                'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌐</text></svg>';
                            }}
                          />
                          <span className="domain">{domain}</span>
                          {timeLimits[domain] && (
                            <div
                              className={`time-limit-indicator ${
                                strictLimits[domain] ? "strict" : ""
                              } ${
                                tabData[domain] >= timeLimits[domain]
                                  ? "over-limit"
                                  : ""
                              }`}
                            >
                              Limit: {formatTime(timeLimits[domain])}
                              {strictLimits[domain] && " (Strict)"}
                            </div>
                          )}
                        </div>
                        <span className="time">{formatTime(time)}</span>
                      </div>
                      <div className="progress-container">
                        <div
                          className="progress-bar"
                          style={{
                            width: `${(time / totalTimeTracked) * 100}%`,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </>
      )}
      {/* Analytics section with pie chart */}
      {showAnalytics && (
        <div className="analytics-container">
          {pieChartData.length > 0 && (
            <div className="stats-card">
              <div className="stats-header">
                <h2 className="active-tabs">Time Distribution</h2>
                <div className="timeNrefresh">
                  <div className="total-time">
                    {formatTime(totalDailyTimeTracked)}
                  </div>
                  <button className="refreshBtn" onClick={refresh}>
                    {" "}
                    <IoMdRefresh />
                  </button>
                </div>
              </div>
              <div className="pie-chart-wrapper" style={{ height: "400px" }}>
                <PieChart
                  data={pieChartData}
                  title="Today's Website Time Distribution"
                  refresh={count}
                />
              </div>
            </div>
          )}

          <div className="stats-card">
            <div className="stats-header">
              <h2 className="active-tabs">Top 10 most used Websites</h2>
            </div>
            <ul className="analytics-list">
              {sortedDailyTabs.map(([domain, time], index) => {
                const adjustedTime = time * 2;
                return (
                  <li key={domain} className="analytics-item">
                    <div className="rank">{index + 1}</div>
                    <div className="domain-info">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                        alt={`${domain} icon`}
                        className="favicon"
                        onError={(e) => {
                          e.target.src =
                            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌐</text></svg>';
                        }}
                      />
                      <span className="domain">{domain}</span>
                    </div>
                    <div className="time-info">
                      <span className="time">{formatTime(adjustedTime)}</span>
                      <span className="percentage">
                        ({Math.round((time / totalDailyTimeTracked) * 100)}%)
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Settings section */}
      {showSettings && (
        <div>
          <div className="settings-section">
            <div className="toggle-container">
              <div className="inside-toggle-container">
                <h2 className="toggle-label">Enable Tab Tracking</h2>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={isTrackingEnabled}
                    onChange={toggleTracking}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
              <p className="form-help-text">
                When disabled, your browsing time will not be tracked
              </p>
            </div>
          </div>

          <div className="settings-section">
            <div className="time-limit-card">
              <div className="form-group">
                <label className="form-label">Set Website Time Limit</label>
                <div className="custom-dropdown-container" ref={dropdownRef}>
                  <div
                    className="custom-dropdown-header"
                    onClick={toggleDropdown}
                  >
                    {selectedDomain ? (
                      <div className="selected-domain-display">
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${selectedDomain}&sz=32`}
                          alt={`${selectedDomain} icon`}
                          className="domain-favicon"
                        />
                        <span>{selectedDomain}</span>
                      </div>
                    ) : (
                      <span className="placeholder">Select a website</span>
                    )}
                    <div
                      className={`dropdown-arrow ${
                        isDropdownOpen ? "open" : ""
                      }`}
                    >
                      ▼
                    </div>
                  </div>

                  {isDropdownOpen && (
                    <div className="custom-dropdown-list">
                      {Object.keys(tabData).length > 0 ? (
                        Object.keys(tabData).map((domain) => (
                          <div
                            key={domain}
                            className="dropdown-item"
                            onClick={() => handleDomainSelect(domain)}
                          >
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                              alt={`${domain} icon`}
                              className="domain-favicon"
                            />
                            <span>{domain}</span>
                          </div>
                        ))
                      ) : (
                        <div className="dropdown-empty">
                          No domains available
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="form-help-text">
                  Choose the website you want to limit time on
                </p>
              </div>

              <div className="form-group">
                <input
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                  className="form-input"
                  min="1"
                  placeholder="Enter time in minutes"
                />
                <p className="form-help-text">
                  Set the maximum time you want to spend on this website
                </p>
              </div>

              <div className="form-group strict-toggle-container">
                <div className="inside-toggle-container">
                  <span className="toggle-label">Strict Enforcement</span>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={isStrictMode}
                      onChange={() => setIsStrictMode(!isStrictMode)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <p className="form-help-text">
                  When enabled, the browser extension will close the website
                  when you reach the limit
                </p>
              </div>

              <button
                onClick={handleSetTimeLimit}
                className="set-time-limit-button"
                disabled={!selectedDomain || !timeLimit}
              >
                Set Time Limit
              </button>
            </div>

            <div className="time-limits-list">
              <div className="time-limit-item">
                <span className="toggle-label">Current Time Limits</span>
                {Object.entries(timeLimits).length > 0 ? (
                  Object.entries(timeLimits).map(([domain, limit]) => (
                    <div key={domain} className="current-limit">
                      <div className="time-limit-domain">
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                          alt={`${domain} icon`}
                          className="domain-favicon"
                        />
                        <span>{domain}</span>
                        {strictLimits[domain] && (
                          <span
                            className="strict-badge"
                            title="Strict limit - tabs will close automatically"
                          >
                            ⚠️
                          </span>
                        )}
                      </div>
                      <div className="time-limit-details">
                        <span className="time-limit-value">
                          {formatTime(limit)}
                        </span>
                        <button
                          onClick={() => handleRemoveTimeLimit(domain)}
                          className="remove-limit-button"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="no-limits-message">No time limits set</p>
                )}
              </div>
            </div>
          </div>
          <div className="settings-sections">
            <div className="time-limit-card reset">
              <div>
                <span className="form-label">Reset Session Data</span>
                <button className="clear-button" onClick={clearData}>
                  <FaTrash />
                  &nbsp; Reset Session
                </button>
                <p className="form-help-text reset">
                  Resets the current session time and clears all active tab data
                </p>
              </div>

              <div>
                <span className="form-label">Reset Today's Data</span>
                <button className="clear-button" onClick={clearDailyData}>
                  <FaTrash />
                  &nbsp; Reset Today's Data
                </button>
                <p className="form-help-text reset">
                  Resets all data collected today while keeping historical data
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
