import React, { useState, useRef, useEffect } from "react";
import "./Navbar.css";

function Navbar({
  onToggleSidebar,
  searchQuery = "",
  onSearchChange,
  onSearchSubmit,
  searchHistory = [],
  onDeleteHistoryItem,
  onClearHistory,
  onToggleFilters,
  isFilterOpen = false,
  hasActiveFilters = false,
  onCategorySelect,
  activeCategory = "All products",
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const containerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
        setShowClearConfirm(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    setIsDropdownOpen(false);
    setShowClearConfirm(false);
    if (onSearchSubmit) {
      onSearchSubmit(searchQuery);
    }
  };

  const handleSelectHistoryItem = (item) => {
    if (onSearchChange) onSearchChange(item.query);
    if (onSearchSubmit) onSearchSubmit(item.query);
    setIsDropdownOpen(false);
    setShowClearConfirm(false);
  };

  const categories = [
    "All products",
    "Mobiles",
    "Electronics",
    "Accessories",
    "Smart home",
  ];

  return (
    <>
      <header className="navbar">
        <div className="nav-bar">
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar menu"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div className="brand-mark">S</div>
          <div className="brand-copy">
            <h1>Scalefox</h1>
            <span>Your shopping list</span>
          </div>
        </div>

        {/* Search Bar with History Dropdown & Filters Toggle */}
        <div className="navbar-search-container" ref={containerRef}>
          <form className="navbar-search-form" onSubmit={handleFormSubmit}>
            <div className="search-input-wrapper">
              <svg
                className="search-mag-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search products (e.g. phones under 25000, Samsung, 5G)..."
                className="navbar-search"
                value={searchQuery}
                onChange={(e) => {
                  if (onSearchChange) onSearchChange(e.target.value);
                  setIsDropdownOpen(true);
                }}
                onFocus={() => setIsDropdownOpen(true)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-query-btn"
                  onClick={() => {
                    if (onSearchChange) onSearchChange("");
                  }}
                  aria-label="Clear search input"
                >
                  ✕
                </button>
              )}
            </div>

            <button type="submit" className="navbar-search-button">
              Search
            </button>

            {/* Smart Filters Toggle Button */}
            <button
              type="button"
              className={`navbar-filter-btn ${isFilterOpen ? "filter-active" : ""} ${
                hasActiveFilters ? "has-filters" : ""
              }`}
              onClick={onToggleFilters}
              title="Toggle Filters"
              aria-label="Toggle Smart Filters"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="4" y1="21" x2="4" y2="14" />
                <line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" />
                <line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" />
                <line x1="9" y1="8" x2="15" y2="8" />
                <line x1="17" y1="16" x2="23" y2="16" />
              </svg>
              <span>Filters</span>
              {hasActiveFilters && <span className="filter-badge-dot" />}
            </button>
          </form>

          {/* Search History Dropdown */}
          {isDropdownOpen && searchHistory && searchHistory.length > 0 && (
            <div className="search-history-dropdown">
              <div className="search-history-header">
                <span className="search-history-title">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Recent Searches
                </span>
              </div>

              <ul className="search-history-list">
                {searchHistory.map((item) => (
                  <li
                    key={item.id}
                    className="search-history-item"
                    onClick={() => handleSelectHistoryItem(item)}
                  >
                    <div className="history-item-left">
                      <svg
                        className="history-clock-icon"
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span className="history-query-text">{item.query}</span>
                    </div>

                    <div className="history-item-right">
                      <span className="history-date-text">{item.date}</span>
                      <button
                        type="button"
                        className="history-delete-btn"
                        title="Delete from history"
                        aria-label="Delete query from history"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onDeleteHistoryItem) onDeleteHistoryItem(item.id);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Clear History Footer with Confirmation */}
              <div className="search-history-footer">
                {showClearConfirm ? (
                  <div className="history-confirm-row">
                    <span className="confirm-text">Clear all search history?</span>
                    <button
                      type="button"
                      className="confirm-btn-yes"
                      onClick={() => {
                        if (onClearHistory) onClearHistory();
                        setShowClearConfirm(false);
                      }}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="confirm-btn-no"
                      onClick={() => setShowClearConfirm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="clear-history-btn"
                    onClick={() => setShowClearConfirm(true)}
                  >
                    Clear History
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="searchbar">
          <button className="login-button">Login</button>
          <button className="cart-button">Cart (3)</button>
        </div>
      </header>

      {/* Category Navigation Bar */}
      <nav className="category-nav" aria-label="Product categories">
        {categories.map((cat) => (
          <span
            key={cat}
            className={activeCategory === cat ? "active" : ""}
            onClick={() => onCategorySelect && onCategorySelect(cat)}
            style={{ cursor: "pointer" }}
          >
            {cat}
          </span>
        ))}
      </nav>
    </>
  );
}

export default Navbar;
