import React from 'react';
import './NewArrivals.css';

const NewArrivals = () => {
  const newProducts = [
    {
      id: 101,
      name: "BTS 'Yet to Come' Hoodie",
      price: 2499,
      image: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      group: "BTS"
    },
    {
      id: 102,
      name: "BLACKPINK Lightstick Ver.2",
      price: 3599,
      image: "https://images.unsplash.com/photo-1511735111819-9a3f7709049c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      group: "BLACKPINK"
    },
    {
      id: 103,
      name: "TWICE 'READY TO BE' Album",
      price: 1899,
      image: "https://images.unsplash.com/photo-1517230878791-4d28214057c2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      group: "TWICE"
    }
  ];

  return (
    <div className="new-arrivals-page">
      <div className="page-header">
        <h1>New Arrivals</h1>
        <p>Check out the latest K-pop merchandise</p>
      </div>
      
      <div className="new-products-grid">
        {newProducts.map(product => (
          <div key={product.id} className="new-product-card">
            <div className="new-product-badge">NEW</div>
            <img src={product.image} alt={product.name} />
            <div className="new-product-info">
              <span className="product-group">{product.group}</span>
              <h3>{product.name}</h3>
              <p className="price">₱{product.price.toLocaleString()}</p>
              <button className="btn btn-primary">Pre-order Now</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NewArrivals;