import { useState, useEffect, useRef } from "react";
import {
  FaClock,
  FaTrash,
  FaCog,
  FaChartLine,
  FaExclamationTriangle,
} from "react-icons/fa";
import "./styles.css";

function App() {
  const [tabData, setTabData] = useState({});
  const [activeDomain, setActiveDomain] = useState(null);
  const [timeLimits, setTimeLimits] = useState({});
  const [strictLimits, setStrictLimits] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(true);
  const [isStrictMode, setIsStrictMode] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const lastUpdateTime = useRef(Date.now());
  const dropdownRef = useRef(null);

  // Function to get latest tab data
  const getTabData = () => {
    const currentTime = Date.now();
    if (currentTime - lastUpdateTime.current >= 1000) {
      chrome.runtime.sendMessage({ type: "GET_TAB_DATA" }, (response) => {
        if (response) {
          setTabData(response.tabData || {});
          setActiveDomain(response.activeDomain);
          setTimeLimits(response.timeLimits || {});
          setStrictLimits(response.strictLimits || {});
          lastUpdateTime.current = currentTime;
        }
      });
    }
  };

  // Function to signal user activity to background script
  const signalActivity = () => {
    chrome.runtime.sendMessage({ type: "USER_ACTIVITY" });
  };

  useEffect(() => {
    chrome.storage.local.get(
      [
        "tabData",
        "activeDomain",
        "timeLimits",
        "strictLimits",
        "isTrackingEnabled",
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
        getTabData();
      }
    );

    const interval = setInterval(getTabData, 1000);

    return () => clearInterval(interval);
  }, []);

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
        setTabData({});
        setActiveDomain(null);
        setTimeLimits({});
        setStrictLimits({});
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

  const totalTimeTracked = Object.values(tabData).reduce((a, b) => a + b, 0);
  const websitesTracked = Object.keys(tabData).length;
  const websitesOverLimit = Object.entries(timeLimits).filter(
    ([domain, limit]) => tabData[domain] && tabData[domain] >= limit
  ).length;

  const sortedTabs = Object.entries(tabData)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  return (
    <div className="app-container">
      <div className="nav">
        <h1 className="title">Tablytics</h1>
        <div className="header">
          <div className="header-buttons">
            <button
              className="nav-button"
              onClick={() => {
                setShowDashboard(true);
                setShowSettings(false);
              }}
            >
              <FaChartLine />
              Dashboard
            </button>
            <button
              className="nav-button"
              onClick={() => {
                setShowDashboard(false);
                setShowSettings(true);
              }}
            >
              <FaCog />
              Settings
            </button>
          </div>
        </div>
      </div>

      {!isTrackingEnabled && (
        <div className="tracking-paused-notice">
          <p>Tracking is currently paused. No tab is being tracked.</p>
        </div>
      )}

      {showDashboard && (
        <div className="dashboard-container">
          <div className="stats-card-container">
            <div className="dashboard-card">
              <h2>Total Time Tracked</h2>
              <div className="dashboard-value">
                <FaClock className="dashboard-icon" />
                <span>{formatTime(totalTimeTracked)}</span>
              </div>
            </div>

            <div className="dashboard-card">
              <h2>Websites Tracked</h2>
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

          <div className="stats-card">
            <div className="stats-header">
              <h2 className="active-tabs">Active Tabs</h2>
              <div className="total-time">
                <FaClock />
                {formatTime(totalTimeTracked)}
              </div>
            </div>

            <ul className="tabs-list">
              {sortedTabs.map(([domain, time]) => (
                <li
                  key={domain}
                  className={`tab-item ${
                    domain === activeDomain ? "active" : ""
                  }`}
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
                    </div>
                    <span className="time">{formatTime(time)}</span>
                  </div>
                  <div className="progress-container">
                    <div
                      className="progress-bar"
                      style={{ width: `${(time / totalTimeTracked) * 100}%` }}
                    />
                  </div>
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
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="settings-card">
          <div className="settings-section">
            <h2>Tracking Options</h2>
            <p className="form-help-text">
              Configure how website tracking works
            </p>
            <div className="toggle-container">
              <div className="inside-toggle-container">
                <span className="toggle-label">Enable Tab Tracking</span>
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
                <label className="form-label">Time Limit (minutes)</label>
                <input
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                  className="form-input"
                  min="1"
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
            <div className="time-limit-card">
              <span className="form-label">Reset Time</span>
              <button className="clear-button" onClick={clearData}>
                <FaTrash />
                &nbsp; Reset
              </button>
              <p className="form-help-text reset">
                Resets all the time counted on all the sites to 0
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
