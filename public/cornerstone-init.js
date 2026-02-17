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
