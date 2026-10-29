function WishlistPage({ onExploreProducts }) {
  return (
    <main className="main-content placeholder-view">
      <div className="placeholder-header">
        <h2>My Wishlist</h2>
        <p>Save and track items from Flipkart and Amazon.</p>
      </div>
      <div className="placeholder-card">
        <div className="placeholder-icon-wrap">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2874f0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </div>
        <h3>Your Wishlist is Empty</h3>
        <p>Browse products across Flipkart or Amazon and click save to receive price drop notifications.</p>
        <button
          type="button"
          className="placeholder-action-btn"
          onClick={onExploreProducts}
        >
          Explore Products
        </button>
      </div>
    </main>
  );
}

export default WishlistPage;
