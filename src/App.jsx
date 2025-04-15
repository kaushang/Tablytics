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
  const lastUpdateTime = useRef(Date.now());

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
    chrome.storage.local.get(['tabData', 'activeDomain', 'timeLimits'], (result) => {
      if (result.tabData) {
        setTabData(result.tabData);
      }
      if (result.activeDomain) {
        setActiveDomain(result.activeDomain);
      }
      if (result.timeLimits) {
        setTimeLimits(result.timeLimits);
      }
      // After loading initial data, start real-time updates
      getTabData();
    });

    // Set up interval for real-time updates
    const interval = setInterval(getTabData, 1000);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
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

  const handleSelectFocus = () => {
    setIsDropdownOpen(true);
  };

  const handleSelectBlur = () => {
    // Small delay to allow click events to process
    setTimeout(() => {
      setIsDropdownOpen(false);
    }, 100);
  };

  const handleSelectChange = (e) => {
    setSelectedDomain(e.target.value);
    setIsDropdownOpen(false);
  };

  const handleSelectMouseDown = () => {
    setIsDropdownOpen(!isDropdownOpen);
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

      {showSettings && (
        <div className="settings-card">
          <h2>Time Limits</h2>
          <div className="settings-form">
            <div className="domain-select-container">
              <div className="domain-select-wrapper">
                <select 
                  value={selectedDomain} 
                  onChange={handleSelectChange}
                  onFocus={handleSelectFocus}
                  onBlur={handleSelectBlur}
                  onMouseDown={handleSelectMouseDown}
                  className="domain-select"
                >
                  <option value="">Select a domain</option>
                  {Object.keys(tabData).map(domain => (
                    <option key={domain} value={domain}>
                      <div className="domain-option">
                        <img 
                          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                          alt={`${domain} icon`}
                          className="domain-favicon"
                        />
                        {domain}
                      </div>
                    </option>
                  ))}
                </select>
                <div className={`select-arrow ${isDropdownOpen ? 'open' : ''}`}>▼</div>
              </div>
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

export default App 