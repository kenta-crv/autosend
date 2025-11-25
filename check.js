function isValidUrl(urlString) {
  if (!urlString || urlString.trim() === '') {
    return false;
  }
  
  // Remove common prefixes that might be in the data
  let cleanUrl = urlString.trim().replace(/^__+|__+$/g, '');
  
  // Add protocol if missing for validation
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }
  
  try {
    const url = new URL(cleanUrl);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function cleanUrl(urlString) {
  if (!urlString) return null;
  
  // Trim whitespace
  let cleaned = urlString.trim();
  
  // Extract URL from parentheses if present (e.g., "ãƒ†ãƒ« (teruyadenki.co.jp)" -> "teruyadenki.co.jp")
  const match = cleaned.match(/\(([^)]+)\)/);
  if (match) {
    cleaned = match[1].trim();
  }
  
  // Remove double underscores from start and end
  cleaned = cleaned.replace(/^__+|__+$/g, '');
  
  // Remove trailing slash if present
  cleaned = cleaned.replace(/\/$/, '');
  
  // Remove garbled text after valid domain extension
  // Matches domain with common TLD, then removes any garbled characters after it
  const domainMatch = cleaned.match(/^([a-zA-Z0-9.-]+\.(com|co\.jp|jp|net|org|info|biz|io|ai))/);
  if (domainMatch) {
    cleaned = domainMatch[1];
  }
  return isValidUrl(cleaned) ? cleaned : null;
}
let k = cleanUrl('ã‚¹ãƒ¼ãƒ‘ãƒ¼ãƒžãƒ¼ã‚±ãƒƒãƒˆ ã‚ªã‚ªã‚¼ã‚­ (ozeki-net.co.jp)')
console.log(k);
