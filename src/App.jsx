import { useState, useEffect, useRef } from 'react'
import { FaClock, FaTrash, FaCog } from 'react-icons/fa'
import './styles.css'

function App() {
  const [tabData, setTabData] = useState({});
  const [activeDomain, setActiveDomain] = useState(null);
  const [timeLimits, setTimeLimits] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState('');
  const [timeLimit, setTimeLimit] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(true);
  const lastUpdateTime = useRef(Date.now());
  const dropdownRef = useRef(null);

  // Function to get latest tab data
  const getTabData = () => {
    const currentTime = Date.now();
    // Only update if at least 1 second has passed
    if (currentTime - lastUpdateTime.current >= 1000) {
      chrome.runtime.sendMessage({ type: 'GET_TAB_DATA' }, (response) => {
        if (response) {
          setTabData(response.tabData || {});
          setActiveDomain(response.activeDomain);
          setTimeLimits(response.timeLimits || {});
          lastUpdateTime.current = currentTime;
        }
      });
    }
  };

  useEffect(() => {
    // Load initial data from storage immediately
    chrome.storage.local.get(['tabData', 'activeDomain', 'timeLimits', 'isTrackingEnabled'], (result) => {
      if (result.tabData) {
        setTabData(result.tabData);
      }
      if (result.activeDomain) {
        setActiveDomain(result.activeDomain);
      }
      if (result.timeLimits) {
        setTimeLimits(result.timeLimits);
      }
      if (result.isTrackingEnabled !== undefined) {
        setIsTrackingEnabled(result.isTrackingEnabled);
      }
      // After loading initial data, start real-time updates
      getTabData();
    });

    // Set up interval for real-time updates
    const interval = setInterval(getTabData, 1000);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);

  // Add click outside listener to close dropdown
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
    // Send message to background script to clear data
    chrome.runtime.sendMessage({ type: 'CLEAR_DATA' }, (response) => {
      if (response && response.success) {
        // Reset local state
        setTabData({});
        setActiveDomain(null);
        setTimeLimits({});
      }
    });
  };

  const toggleTracking = () => {
    const newTrackingState = !isTrackingEnabled;
    chrome.runtime.sendMessage({ 
      type: 'TOGGLE_TRACKING', 
      enabled: newTrackingState 
    }, (response) => {
      if (response && response.success) {
        setIsTrackingEnabled(newTrackingState);
      }
    });
  };

  const handleSetTimeLimit = () => {
    if (!selectedDomain || !timeLimit) return;
    
    // Convert time limit to milliseconds
    const limitMs = parseInt(timeLimit) * 60 * 1000; // Convert minutes to milliseconds
    
    chrome.runtime.sendMessage({ 
      type: 'SET_TIME_LIMIT',
      domain: selectedDomain,
      limit: limitMs
    }, (response) => {
      if (response && response.success) {
        setTimeLimits(prev => ({
          ...prev,
          [selectedDomain]: limitMs
        }));
        setTimeLimit('');
        setSelectedDomain(''); // Reset the selected domain
      }
    });
  };

  const handleRemoveTimeLimit = (domain) => {
    chrome.runtime.sendMessage({ 
      type: 'SET_TIME_LIMIT',
      domain,
      limit: null
    }, (response) => {
      if (response && response.success) {
        const newTimeLimits = { ...timeLimits };
        delete newTimeLimits[domain];
        setTimeLimits(newTimeLimits);
      }
    });
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleDomainSelect = (domain) => {
    setSelectedDomain(domain);
    setIsDropdownOpen(false);
  };

  const sortedTabs = Object.entries(tabData)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const totalTime = Object.values(tabData).reduce((a, b) => a + b, 0);

  return (
    <div className="app-container">
      <div className="header">
        <h1 className="title">Tablytics</h1>
        <div className="header-buttons">
          <button className="settings-button" onClick={() => setShowSettings(!showSettings)}>
            <FaCog />
            Settings
          </button>
          <button className="clear-button" onClick={clearData}>
            <FaTrash />
            Reset
          </button>
        </div>
      </div>

      {!isTrackingEnabled && (
        <div className="tracking-paused-notice">
          <p>Tracking is currently paused. No tab is being tracked.</p>
        </div>
      )}

      {showSettings && (
        <div className="settings-card">
          <div className="settings-section">
            <h2>Tracking</h2>
            <div className="toggle-container">
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
          </div>
          
          <div className="settings-section">
            <h2>Time Limits</h2>
            <div className="settings-form">
              {/* Custom Domain Dropdown */}
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
                    <span className="placeholder">Select a domain</span>
                  )}
                  <div className={`dropdown-arrow ${isDropdownOpen ? 'open' : ''}`}>▼</div>
                </div>
                
                {isDropdownOpen && (
                  <div className="custom-dropdown-list">
                    {Object.keys(tabData).length > 0 ? (
                      Object.keys(tabData).map(domain => (
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
                      <div className="dropdown-empty">No domains available</div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="time-input-container">
                <input
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                  placeholder="Time limit (minutes)"
                  className="time-input"
                  min="1"
                />
              </div>
              <button 
                onClick={handleSetTimeLimit} 
                className="set-limit-button"
                disabled={!selectedDomain || !timeLimit}
              >
                Set Limit
              </button>
            </div>
            <div className="time-limits-list">
              {Object.entries(timeLimits).map(([domain, limit]) => (
                <div key={domain} className="time-limit-item">
                  <div className="time-limit-domain">
                    <img 
                      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                      alt={`${domain} icon`}
                      className="domain-favicon"
                    />
                    <span>{domain}</span>
                  </div>
                  <div className="time-limit-details">
                    <span className="time-limit-value">{formatTime(limit)}</span>
                    <button 
                      onClick={() => handleRemoveTimeLimit(domain)}
                      className="remove-limit-button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="stats-card">
        <div className="stats-header">
          <h2 className="active-tabs">
            Active Tabs
          </h2>
          <div className="total-time">
            <FaClock />
            {formatTime(totalTime)}
          </div>
        </div>

        <ul className="tabs-list">
          {sortedTabs.map(([domain, time]) => (
            <li key={domain} className={`tab-item ${domain === activeDomain ? 'active' : ''}`}>
              <div className="tab-header">
                <div className="domain-info">
                  <img 
                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                    alt={`${domain} icon`}
                    className="favicon"
                    onError={(e) => {
                      e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌐</text></svg>';
                    }}
                  />
                  <span className="domain">{domain}</span>
                </div>
                <span className="time">{formatTime(time)}</span>
              </div>
              <div className="progress-container">
                <div 
                  className="progress-bar" 
                  style={{ width: `${(time / totalTime) * 100}%` }}
                />
              </div>
              {timeLimits[domain] && (
                <div className="time-limit-indicator">
                  Limit: {formatTime(timeLimits[domain])}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default App;