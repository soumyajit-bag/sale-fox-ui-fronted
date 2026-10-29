import React, { useState, useMemo } from "react";

function ProductCard({
  name,
  image,
  price,
  originalPrice,
  discount,
  rating,
  delivery,
  seller,
  badge,
  badgeType,
  url,
}) {
  const [isWishListed, setIsWishListed] = useState(false);
  const [purchaseMode, setPurchaseMode] = useState("single"); // "single" | "bulk"
  const [bulkQuantity, setBulkQuantity] = useState(10);

  // Parse numeric unit price from price prop (e.g. "₹65,999" -> 65999)
  const unitPriceNum = useMemo(() => {
    if (typeof price === "number") return price;
    const cleaned = String(price || "").replace(/[^0-9.]/g, "");
    return parseFloat(cleaned) || 0;
  }, [price]);

  // Ensure positive whole number for calculation
  const safeQuantity =
    typeof bulkQuantity === "number" && bulkQuantity > 0 ? bulkQuantity : 10;

  // Calculate total price: Unit Price × Quantity
  const totalPriceNum = unitPriceNum * safeQuantity;

  // Format prices using Indian numbering system
  const formattedUnitPrice = useMemo(() => {
    return "₹" + Math.round(unitPriceNum).toLocaleString("en-IN");
  }, [unitPriceNum]);

  const formattedTotal = useMemo(() => {
    return "₹" + Math.round(totalPriceNum).toLocaleString("en-IN");
  }, [totalPriceNum]);

  // Quantity input handlers with validation (positive whole numbers only)
  const handleQuantityChange = (e) => {
    const val = e.target.value;
    if (val === "") {
      setBulkQuantity("");
      return;
    }
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setBulkQuantity(parsed);
    }
  };

  const handleQuantityBlur = () => {
    if (!bulkQuantity || bulkQuantity < 1) {
      setBulkQuantity(10);
    }
  };

  const handleIncrement = () => {
    const current = typeof bulkQuantity === "number" ? bulkQuantity : 10;
    setBulkQuantity(current + 1);
  };

  const handleDecrement = () => {
    const current = typeof bulkQuantity === "number" ? bulkQuantity : 10;
    if (current > 1) {
      setBulkQuantity(current - 1);
    }
  };

  return (
    <div className={`product-card ${badgeType ? `card-${badgeType}` : ""}`}>
      <div className="product-image">
        {badge && (
          <span className={`product-badge-tag badge-${badgeType || "default"}`}>
            {badge}
          </span>
        )}
        <img
          src={image}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            // Prevent infinite loop if placeholder also fails
            if (!e.target.dataset.errored) {
              e.target.dataset.errored = "1";
              e.target.src =
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23f0f0f0'/%3E%3Crect x='60' y='50' width='80' height='70' rx='4' fill='%23d0d0d0'/%3E%3Ccircle cx='85' cy='75' r='10' fill='%23b0b0b0'/%3E%3Cpolygon points='60,120 90,85 115,105 140,75 140,120' fill='%23c0c0c0'/%3E%3Ctext x='100' y='155' text-anchor='middle' font-family='sans-serif' font-size='11' fill='%23999'%3ENo image%3C/text%3E%3C/svg%3E";
            }
          }}
        />
      </div>
      <button
        type="button"
        className={`wishlist-button ${isWishListed ? "Clicked" : "notClicked"}`}
        onClick={() => setIsWishListed((prev) => !prev)}
        aria-label={isWishListed ? "Remove from wishlist" : "Add to wishlist"}
      >
        {isWishListed ? "♥" : "♡"}
      </button>
      <div className="product-info">
        <h3 title={name}>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="product-title-link"
              title={name}
            >
              {name}
            </a>
          ) : (
            name
          )}
        </h3>

        {/* Dynamic Price Display: Single vs Bulk */}
        {purchaseMode === "bulk" ? (
          <div className="product-bulk-pricing">
            <div className="product-price-row">
              <span className="product-price bulk-total-price">
                {formattedTotal}
              </span>
              <span className="bulk-badge-pill">
                Bulk ({safeQuantity} units)
              </span>
            </div>
            <div className="product-unit-price-line">
              Unit price: <strong>{formattedUnitPrice}</strong>
            </div>
          </div>
        ) : (
          <div className="product-price-row">
            <p className="product-price">{price}</p>
            {originalPrice && (
              <span className="product-original-price">{originalPrice}</span>
            )}
            {discount && (
              <span className="product-discount-pill">{discount}</span>
            )}
          </div>
        )}

        <p className="product-seller">Seller: {seller}</p>
      </div>

      <div className="product-details">
        <div className="product-details-left">
          <p className="product-rating">
            <span className="star-icon">★</span> {rating}
          </p>
          <p className="product-delivery">Delivery: {delivery}</p>
        </div>

        <div className="product-details-right">
          {/* Bulk Quantity Input (only displayed in Bulk mode) */}
          {purchaseMode === "bulk" && (
            <div
              className="bulk-qty-control"
              aria-label="Bulk quantity selection"
            >
              <span className="bulk-qty-label">Qty:</span>
              <div className="bulk-qty-input-group">
                <button
                  type="button"
                  className="bulk-qty-btn"
                  onClick={handleDecrement}
                  aria-label="Decrease quantity"
                  disabled={safeQuantity <= 1}
                >
                  −
                </button>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="bulk-qty-input"
                  value={bulkQuantity}
                  onChange={handleQuantityChange}
                  onBlur={handleQuantityBlur}
                  aria-label={`Bulk quantity for ${name}`}
                />
                <button
                  type="button"
                  className="bulk-qty-btn"
                  onClick={handleIncrement}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* Compact Single / Bulk Selector */}
          <div
            className="purchase-mode-selector"
            role="radiogroup"
            aria-label={`Purchase option for ${name}`}
          >
            <button
              type="button"
              role="radio"
              aria-checked={purchaseMode === "single"}
              className={`mode-selector-btn ${
                purchaseMode === "single" ? "active" : ""
              }`}
              onClick={() => setPurchaseMode("single")}
            >
              Single
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={purchaseMode === "bulk"}
              className={`mode-selector-btn ${
                purchaseMode === "bulk" ? "active" : ""
              }`}
              onClick={() => setPurchaseMode("bulk")}
            >
              Bulk
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductCard;
