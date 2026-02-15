// RadCase Lazy Loader - IntersectionObserver-based image and module lazy loading
// Sprint 2: Performance Optimization

(function() {
  'use strict';

  const imageObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target;

      // Swap data-src -> src
      if (img.dataset.src) {
        img.src = img.dataset.src;
        delete img.dataset.src;
      }

      // <picture> <source> lazy srcset
      if (img.dataset.srcset) {
        img.srcset = img.dataset.srcset;
        delete img.dataset.srcset;
      }

      img.classList.remove('lazy');
      img.classList.add('loaded');
      imageObserver.unobserve(img);
    }
  }, {
    rootMargin: '100px'
  });

  // Observe all lazy images on initial load and after DOM mutations
  function observeLazyImages(root) {
    (root || document).querySelectorAll('img[data-src], img.lazy, source[data-srcset]').forEach(el => {
      imageObserver.observe(el);
    });
  }

  // Watch for dynamically added images (case cards loaded via JS)
  const mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if ((node.tagName === 'IMG' && node.dataset.src) || node.classList?.contains('lazy')) {
          imageObserver.observe(node);
        }
        // Also check children
        if (node.querySelectorAll) {
          observeLazyImages(node);
        }
      }
    }
  });

  // Lazy-load non-critical CSS
  function lazyLoadCSS(href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.media = 'print'; // Load without blocking render
    link.onload = () => { link.media = 'all'; };
    document.head.appendChild(link);
  }

  // Lazy-load a script on demand
  function lazyLoadScript(src) {
    return new Promise((resolve, reject) => {
      // Avoid duplicates
      if (document.querySelector(`script[src="${src}"]`)) {
        return resolve();
      }
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  // Init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    observeLazyImages();
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Public API
  window.lazyLoader = {
    observeLazyImages,
    lazyLoadCSS,
    lazyLoadScript
  };
})();
