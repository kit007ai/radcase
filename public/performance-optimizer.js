// RadCase Performance Optimizer - Sprint 2 Advanced Mobile UX
// Network-aware loading and mobile performance optimization

class PerformanceOptimizer {
  constructor() {
    this.connection = this.getConnectionInfo();
    this.metrics = {
      loadStart: performance.now(),
      firstPaint: null,
      firstContentfulPaint: null,
      largestContentfulPaint: null,
      cumulativeLayoutShift: 0
    };
    
    this.resourceHints = new Map();
    this.criticalResourcesLoaded = false;
    this.lazyLoadQueue = [];
    
    this.init();
  }

  init() {
    // Monitor performance metrics
    this.observeWebVitals();
    
    // Network-aware optimization
    this.setupNetworkAwareLoading();
    
    // Preload critical resources
    this.preloadCriticalResources();
    
    // Setup lazy loading
    this.setupLazyLoading();
    
    // Service worker registration
    this.registerServiceWorker();
    
    console.log('🚀 Performance Optimizer initialized:', {
      connection: this.connection,
      criticalResourcesLoaded: this.criticalResourcesLoaded
    });
  }

  // Network detection and optimization
  getConnectionInfo() {
    if ('connection' in navigator) {
      const conn = navigator.connection;
      return {
        effectiveType: conn.effectiveType, // '4g', '3g', '2g', 'slow-2g'
        downlink: conn.downlink, // Mbps
        rtt: conn.rtt, // milliseconds
        saveData: conn.saveData // boolean
      };
    }
    
    return {
      effectiveType: 'unknown',
      downlink: 10,
      rtt: 100,
      saveData: false
    };
  }

  setupNetworkAwareLoading() {
    // Adjust loading strategy based on connection
    const strategy = this.getLoadingStrategy();
    
    if ('connection' in navigator) {
      navigator.connection.addEventListener('change', () => {
        this.connection = this.getConnectionInfo();
        this.adjustForConnection();
      });
    }
    
    console.log('📡 Network-aware loading:', strategy);
  }

  getLoadingStrategy() {
    const { effectiveType, saveData } = this.connection;
    
    if (saveData) {
      return 'data-saver';
    }
    
    switch (effectiveType) {
      case 'slow-2g':
      case '2g':
        return 'minimal';
      case '3g':
        return 'optimized';
      case '4g':
      default:
        return 'full';
    }
  }

  adjustForConnection() {
    const strategy = this.getLoadingStrategy();
    
    switch (strategy) {
      case 'data-saver':
      case 'minimal':
        this.enableDataSaverMode();
        break;
      case 'optimized':
        this.enableOptimizedMode();
        break;
      case 'full':
        this.enableFullMode();
        break;
    }
  }

  enableDataSaverMode() {
    // Disable non-essential features
    document.documentElement.classList.add('data-saver');
    
    // Reduce image quality
    document.querySelectorAll('img').forEach(img => {
      if (!img.dataset.originalSrc) {
        img.dataset.originalSrc = img.src;
      }
      
      // Use lower quality images
      if (img.src.includes('?')) {
        img.src = img.src + '&quality=30';
      } else {
        img.src = img.src + '?quality=30';
      }
    });
    
    // Disable animations
    document.documentElement.style.setProperty('--animation-duration', '0s');
  }

  enableOptimizedMode() {
    document.documentElement.classList.add('optimized');
    
    // Moderate optimizations
    document.querySelectorAll('img').forEach(img => {
      if (img.src.includes('?')) {
        img.src = img.src + '&quality=60';
      } else {
        img.src = img.src + '?quality=60';
      }
    });
    
    // Reduce animation duration
    document.documentElement.style.setProperty('--animation-duration', '0.2s');
  }

  enableFullMode() {
    document.documentElement.classList.remove('data-saver', 'optimized');
    
    // Restore full quality
    document.querySelectorAll('img').forEach(img => {
      if (img.dataset.originalSrc) {
        img.src = img.dataset.originalSrc;
      }
    });
    
    // Full animations
    document.documentElement.style.setProperty('--animation-duration', '0.3s');
  }

  // Critical resource preloading
  preloadCriticalResources() {
    const criticalResources = [
      // Core JavaScript files
      { href: '/touch-gestures.js', as: 'script', priority: 'high' },
      { href: '/dicom-viewer.js', as: 'script', priority: 'high' },
      { href: '/swipe-quiz.js', as: 'script', priority: 'high' },

      // Mobile CSS
      { href: '/mobile.css', as: 'style', priority: 'high' },

      // Essential fonts
      {
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
        as: 'style',
        priority: 'high'
      }
    ];

    criticalResources.forEach(resource => {
      if (this.shouldPreload(resource)) {
        this.preloadResource(resource);
      }
    });
  }

  shouldPreload(resource) {
    const strategy = this.getLoadingStrategy();
    
    if (strategy === 'minimal') {
      return resource.priority === 'high' && !resource.href.includes('font');
    }
    
    return true;
  }

  preloadResource(resource) {
    // Check if already exists
    const existing = document.querySelector(`link[href="${resource.href}"]`);
    if (existing) return;

    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = resource.href;
    link.as = resource.as;
    
    if (resource.crossorigin) {
      link.crossOrigin = resource.crossorigin;
    }
    
    link.onload = () => {
      this.resourceHints.set(resource.href, 'loaded');
      this.checkCriticalResourcesComplete();
    };
    
    link.onerror = () => {
      this.resourceHints.set(resource.href, 'error');
      console.warn('Failed to preload:', resource.href);
    };
    
    document.head.appendChild(link);
    this.resourceHints.set(resource.href, 'loading');
  }

  checkCriticalResourcesComplete() {
    const allLoaded = Array.from(this.resourceHints.values())
      .every(status => status === 'loaded' || status === 'error');
    
    if (allLoaded && !this.criticalResourcesLoaded) {
      this.criticalResourcesLoaded = true;
      this.onCriticalResourcesLoaded();
    }
  }

  onCriticalResourcesLoaded() {
    console.log('✅ Critical resources loaded');
    
    // Start lazy loading non-critical resources
    this.startLazyLoading();
    
    // Dispatch custom event
    document.dispatchEvent(new CustomEvent('criticalResourcesLoaded'));
  }

  // Lazy loading implementation
  setupLazyLoading() {
    // Intersection Observer for images
    this.imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.loadImage(entry.target);
          this.imageObserver.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '50px' // Start loading 50px before entering viewport
    });

    // Observe existing lazy images
    this.observeLazyImages();

    // Module loading observer
    this.moduleObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.loadModule(entry.target);
          this.moduleObserver.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '100px'
    });
  }

  observeLazyImages() {
    document.querySelectorAll('img[data-src]').forEach(img => {
      this.imageObserver.observe(img);
    });
  }

  loadImage(img) {
    const strategy = this.getLoadingStrategy();
    let src = img.dataset.src;
    
    // Apply quality based on connection
    if (strategy === 'minimal' || strategy === 'data-saver') {
      src = this.addQualityParam(src, 30);
    } else if (strategy === 'optimized') {
      src = this.addQualityParam(src, 60);
    }
    
    img.src = src;
    img.classList.remove('lazy');
    img.classList.add('loaded');
    
    // Remove data-src to prevent reloading
    delete img.dataset.src;
  }

  addQualityParam(src, quality) {
    if (src.includes('?')) {
      return src + `&quality=${quality}`;
    } else {
      return src + `?quality=${quality}`;
    }
  }

  startLazyLoading() {
    // Load non-critical modules
    this.lazyLoadQueue.forEach(item => {
      this.loadModule(item.element);
    });
    
    this.lazyLoadQueue = [];
  }

  loadModule(element) {
    const modulePath = element.dataset.module;
    if (!modulePath) return;

    import(modulePath)
      .then(module => {
        element.classList.add('module-loaded');
        if (typeof module.default === 'function') {
          module.default(element);
        }
      })
      .catch(error => {
        console.error('Failed to load module:', modulePath, error);
        element.classList.add('module-error');
      });
  }

  // Service Worker registration
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('✅ Service Worker registered:', registration);
        
        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Show update notification
              this.showUpdateNotification();
            }
          });
        });
      } catch (error) {
        console.error('❌ Service Worker registration failed:', error);
      }
    }
  }

  showUpdateNotification() {
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.innerHTML = `
      <div class="update-content">
        <span>📱 RadCase has been updated!</span>
        <button class="update-btn" onclick="location.reload()">Refresh</button>
        <button class="update-dismiss" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;
    
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--accent);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      max-width: 300px;
      font-size: 14px;
    `;
    
    document.body.appendChild(notification);
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 10000);
  }

  // Web Vitals monitoring
  observeWebVitals() {
    // First Paint
    const paintObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-paint') {
          this.metrics.firstPaint = entry.startTime;
        } else if (entry.name === 'first-contentful-paint') {
          this.metrics.firstContentfulPaint = entry.startTime;
        }
      }
    });
    paintObserver.observe({ entryTypes: ['paint'] });

    // Largest Contentful Paint
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      this.metrics.largestContentfulPaint = lastEntry.startTime;
    });
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

    // Cumulative Layout Shift
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          this.metrics.cumulativeLayoutShift += entry.value;
        }
      }
    });
    clsObserver.observe({ entryTypes: ['layout-shift'] });

    // Report metrics when page is hidden (user navigates away)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.reportMetrics();
      }
    });
  }

  reportMetrics() {
    const totalLoadTime = performance.now() - this.metrics.loadStart;
    
    const report = {
      loadTime: totalLoadTime,
      firstPaint: this.metrics.firstPaint,
      firstContentfulPaint: this.metrics.firstContentfulPaint,
      largestContentfulPaint: this.metrics.largestContentfulPaint,
      cumulativeLayoutShift: this.metrics.cumulativeLayoutShift,
      connection: this.connection,
      timestamp: Date.now()
    };
    
    console.log('📊 Performance Report:', report);
    
    // Send to analytics (if configured)
    this.sendAnalytics(report);
    
    // Store locally for debugging
    localStorage.setItem('radcase_last_performance', JSON.stringify(report));
  }

  sendAnalytics(report) {
    // Only send if analytics is configured and connection is good
    if (!this.connection.saveData && this.connection.effectiveType !== 'slow-2g') {
      // Could integrate with analytics service here
      // For now, just log significant performance issues
      if (report.loadTime > 2000) {
        console.warn('⚠️ Slow load time:', report.loadTime + 'ms');
      }
      
      if (report.largestContentfulPaint > 2500) {
        console.warn('⚠️ Poor LCP:', report.largestContentfulPaint + 'ms');
      }
      
      if (report.cumulativeLayoutShift > 0.1) {
        console.warn('⚠️ High CLS:', report.cumulativeLayoutShift);
      }
    }
  }

  // Critical CSS inlining
  inlineCriticalCSS() {
    const criticalCSS = `
      /* Critical above-the-fold styles */
      .loading-spinner { animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      
      .mobile-optimized {
        transform: translateZ(0);
        will-change: transform;
      }
      
      @media (max-width: 768px) {
        .touch-optimized {
          min-height: 44px;
          min-width: 44px;
        }
      }
    `;
    
    if (!document.querySelector('#critical-css')) {
      const style = document.createElement('style');
      style.id = 'critical-css';
      style.textContent = criticalCSS;
      document.head.insertBefore(style, document.head.firstChild);
    }
  }

  // Utility methods
  prefetchResource(url, priority = 'low') {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    
    if (priority === 'high') {
      link.rel = 'preload';
      link.as = 'fetch';
    }
    
    document.head.appendChild(link);
  }

  preconnectOrigin(origin) {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    document.head.appendChild(link);
  }

  // Public API
  optimizeForTouch() {
    document.documentElement.classList.add('touch-optimized');
  }

  getPerformanceScore() {
    const totalLoadTime = performance.now() - this.metrics.loadStart;
    
    let score = 100;
    
    // Deduct points for slow metrics
    if (totalLoadTime > 2000) score -= 20;
    if (this.metrics.firstContentfulPaint > 1800) score -= 15;
    if (this.metrics.largestContentfulPaint > 2500) score -= 15;
    if (this.metrics.cumulativeLayoutShift > 0.1) score -= 10;
    
    return Math.max(0, score);
  }
}

// Global instance
window.performanceOptimizer = new PerformanceOptimizer();

// Initialize critical optimizations immediately
document.addEventListener('DOMContentLoaded', () => {
  performanceOptimizer.inlineCriticalCSS();
  performanceOptimizer.optimizeForTouch();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PerformanceOptimizer;
}