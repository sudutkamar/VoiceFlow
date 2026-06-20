const { nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

// Create a simple tray icon programmatically
// For Windows tray, we need a 16x16 icon with good contrast

// Create a simple microphone icon using SVG data
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">
  <rect width="16" height="16" rx="2" fill="transparent"/>
  <path d="M8 2a2 2 0 0 0-2 2v4a2 2 0 0 0 4 0V4a2 2 0 0 0-2-2z" fill="#53c0f0"/>
  <path d="M12 7v1a4 4 0 0 1-8 0V7" stroke="#53c0f0" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="8" y1="11" x2="8" y2="13" stroke="#53c0f0" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="6" y1="13" x2="10" y2="13" stroke="#53c0f0" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

// Save SVG to temp file
const tempSvgPath = path.join(__dirname, '..', 'resources', 'icons', 'temp-tray.svg');
fs.writeFileSync(tempSvgPath, svgIcon);

console.log('SVG tray icon created at:', tempSvgPath);
console.log('Please convert this SVG to PNG format (16x16) for use as tray icon.');
console.log('You can use online tools like https://convertio.co/svg-png/ or install sharp/npm packages.');
