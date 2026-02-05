import React from 'react';
import { useNavigate } from 'react-router-dom';
import './LogoMarquee.css';

const LogoMarquee = () => {
  const navigate = useNavigate();

  const groups = [
    { name: 'BTS', logo: '/images/BTS_logo.png' },
    { name: 'BLACKPINK', logo: '/images/bp_logo.png' },
    { name: 'TWICE', logo: '/images/TWICE-Logo.png' },
    { name: 'SEVENTEEN', logo: '/images/Seventeen-logo.png' },
    { name: 'STRAY KIDS', logo: '/images/straykids.jpg' },
    { name: 'EXO', logo: '/images/Exo-Logo.png' },
    { name: 'RED VELVET', logo: '/images/redvelvet.jpg' },
    { name: 'NEWJEANS', logo: '/images/newjeans.jpg' }
  ];

  // Duplicate the array to create a seamless loop
  const duplicatedGroups = [...groups, ...groups];

  const handleGroupClick = (groupName) => {
    navigate(`/collections?group=${groupName}`);
  };

  return (
    <section className="logo-marquee-section">
      <div className="container">
        <h2 className="logo-marquee-title">Featured <span>K-Pop Groups</span></h2>
      </div>
      <div className="marquee-container">
        <div className="marquee-gradient-left"></div>
        <div className="marquee-gradient-right"></div>
        <div className="marquee-track">
          {duplicatedGroups.map((group, index) => (
            <div 
              key={index} 
              className="logo-item"
              onClick={() => handleGroupClick(group.name)}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === 'Enter') handleGroupClick(group.name);
              }}
            >
              <div className="logo-circle">
                <img src={group.logo} alt={group.name} />
              </div>
              <div className="logo-text">{group.name}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LogoMarquee;