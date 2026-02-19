// Cornerstone.js library initialization - wire up external dependencies
'use strict';

if (typeof cornerstoneWADOImageLoader !== 'undefined') {
  cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
  cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
}

if (typeof cornerstoneTools !== 'undefined') {
  cornerstoneTools.external.cornerstone = cornerstone;
  cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
  cornerstoneTools.external.Hammer = Hammer;
}

// Raise Cornerstone image cache limit (default ~200MB, raise to 1GB)
if (typeof cornerstone !== 'undefined' && cornerstone.imageCache) {
  cornerstone.imageCache.setMaximumSizeBytes(1024 * 1024 * 1024);
}
