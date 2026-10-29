import React, { useState, useRef, useEffect } from "react";
import "./ScraperDropdown.css";

const PLATFORM_OPTIONS = [
  { id: "amazon", name: "Amazon" },
  { id: "flipkart", name: "Flipkart" },
  { id: "apple", name: "Apple" },
  { id: "vivo", name: "Vivo" },
];

function ScraperDropdown({
  selectedPlatform = "Amazon",
  onSelectPlatform,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard interaction (Escape to close)
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (platformName) => {
    if (onSelectPlatform) {
      onSelectPlatform(platformName);
    }
    setIsOpen(false);
  };

  return (
    <div className="scraper-dropdown-wrapper" ref={containerRef}>
      <button
        type="button"
        className={`scraper-dropdown-btn ${isOpen ? "active" : ""}`}
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Scraper: ${selectedPlatform}. Click to switch platform`}
      >
        <span className="scraper-dropdown-label">Scraper:</span>
        <span className="scraper-dropdown-value">{selectedPlatform}</span>
        <svg
          className={`scraper-dropdown-chevron ${isOpen ? "open" : ""}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <ul
          className="scraper-dropdown-menu"
          role="listbox"
          aria-label="Scraper platforms"
        >
          {PLATFORM_OPTIONS.map((opt) => {
            const isSelected =
              selectedPlatform.toLowerCase() === opt.name.toLowerCase();
            return (
              <li key={opt.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`scraper-dropdown-option ${
                    isSelected ? "selected" : ""
                  }`}
                  onClick={() => handleSelect(opt.name)}
                >
                  <span className="scraper-option-left">
                    <span className={`scraper-option-dot dot-${opt.id}`} />
                    <span className="scraper-option-name">{opt.name}</span>
                  </span>
                  {isSelected && (
                    <svg
                      className="scraper-option-check"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default ScraperDropdown;
