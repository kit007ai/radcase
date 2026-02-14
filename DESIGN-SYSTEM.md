# RadCase Design System

## Overview
RadCase uses a dark, professional HUD aesthetic inspired by medical imaging workstations. The design system prioritizes readability, accessibility, and mobile-first responsive design for medical professionals who need to access cases on various devices.

## Design Tokens

### Colors
```css
/* Primary Palette */
--bg-primary: #0a0a0f;        /* Main background */
--bg-secondary: #12121a;      /* Sidebar, cards */
--bg-tertiary: #1a1a25;       /* Interactive elements */
--bg-card: rgba(255, 255, 255, 0.03);  /* Glass effect */

/* Text */
--text-primary: #f4f4f5;      /* Main text */
--text-secondary: #a1a1aa;    /* Secondary text */
--text-muted: #71717a;        /* Muted text, placeholders */

/* Accent Colors */
--accent: #6366f1;            /* Primary brand color */
--accent-hover: #818cf8;      /* Hover states */
--success: #22c55e;           /* Success states */
--warning: #f59e0b;           /* Warning states */
--danger: #ef4444;            /* Error states */

/* Borders */
--border: rgba(255, 255, 255, 0.08);

/* Gradients */
--gradient-1: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%);
--gradient-2: linear-gradient(135deg, #06b6d4 0%, #6366f1 100%);
```

### Typography
```css
/* Font Stack */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;

/* Font Sizes */
--text-xs: 0.75rem;     /* 12px - Badges, metadata */
--text-sm: 0.85rem;     /* 14px - Small labels */
--text-base: 0.95rem;   /* 15px - Body text, buttons */
--text-lg: 1.1rem;      /* 18px - Card titles */
--text-xl: 1.5rem;      /* 24px - Page headers */
--text-2xl: 2rem;       /* 32px - Main headings */

/* Line Heights */
--leading-tight: 1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.7;
```

### Spacing
```css
/* Spacing Scale (px) */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;
--space-12: 48px;
--space-16: 64px;
--space-20: 80px;
```

### Breakpoints
```css
/* Mobile First Approach */
--mobile: 480px;      /* Small phones */
--tablet: 768px;      /* Tablets, large phones */
--desktop: 1024px;    /* Desktop, laptops */
--wide: 1400px;       /* Large screens */
```

## Components

### Buttons
```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  min-height: 44px;     /* Touch-friendly */
  border-radius: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  font-size: 0.95rem;
}

/* Variants */
.btn-primary   { /* Gradient background */ }
.btn-secondary { /* Subtle background */ }
.btn-danger    { /* Red accent */ }
.btn-sm        { min-height: 40px; padding: 10px 16px; }
```

**Usage:**
- Use `.btn-primary` for primary actions (Save, Submit)
- Use `.btn-secondary` for secondary actions (Cancel, Back)
- Use `.btn-danger` for destructive actions (Delete)
- Always include `aria-label` for icon-only buttons

### Cards
```css
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  backdrop-filter: blur(10px);
}

.case-card {
  /* Special styling for medical case cards */
  cursor: pointer;
  transition: all 0.3s;
}
```

**Usage:**
- Use for grouping related content
- Include appropriate `role` attributes for accessibility
- Ensure adequate contrast for readability

### Navigation
```css
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  min-height: 44px;     /* Touch-friendly */
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
```

**Accessibility Requirements:**
- Include `role="navigation"` on nav containers
- Use `aria-current="page"` for active navigation items
- Include `aria-label` descriptions for each nav item
- Support keyboard navigation (arrow keys, Enter)

### Forms
```css
.form-input, .form-select {
  width: 100%;
  padding: 12px 16px;
  min-height: 44px;     /* Touch-friendly */
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 16px;      /* Prevent zoom on iOS */
}
```

**Accessibility Requirements:**
- Always pair inputs with labels
- Use `aria-describedby` for help text
- Include validation messages with `aria-live`
- Ensure proper focus indicators

### Modals
```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-secondary);
  border-radius: 20px;
  max-width: 900px;
  width: 95%;
  max-height: 90vh;
}
```

**Accessibility Requirements:**
- Trap focus within modal when open
- Close on Escape key
- Return focus to trigger element when closed
- Include `role="dialog"` and `aria-labelledby`

## Responsive Design

### Mobile-First Approach
Always start with mobile styles and enhance for larger screens:

```css
/* Base styles for mobile */
.card-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

/* Tablet and up */
@media (min-width: 768px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Desktop and up */
@media (min-width: 1024px) {
  .card-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

### Touch Targets
- Minimum 44px height for all interactive elements
- Adequate spacing between touch targets (8px minimum)
- Consider thumb reach on mobile devices

### Mobile Navigation
- Hamburger menu for mobile/tablet
- Overlay pattern for mobile sidebar
- Focus management for accessibility

## Accessibility Guidelines

### ARIA Labels
```html
<!-- Navigation -->
<nav role="navigation" aria-label="Main navigation">
  <button class="nav-item" aria-label="View case library" aria-current="page">
    Case Library
  </button>
</nav>

<!-- Search -->
<div role="search" aria-label="Search and filter cases">
  <input aria-label="Search radiology cases" />
  <select aria-label="Filter by modality">
</div>

<!-- Interactive elements -->
<button aria-label="Toggle menu" aria-expanded="false">☰</button>
```

### Keyboard Navigation
- Tab order follows logical content flow
- All interactive elements reachable via keyboard
- Visual focus indicators
- Escape key closes modals/overlays
- Arrow keys for navigation within components

### Screen Reader Support
- Semantic HTML structure
- Descriptive text for images (`alt` attributes)
- Status announcements with `aria-live`
- Proper heading hierarchy (h1 → h2 → h3)

### Color Contrast
- Minimum 4.5:1 ratio for normal text
- Minimum 3:1 ratio for large text
- Don't rely solely on color for information
- Test with actual screen readers

## Testing Checklist

### Mobile Testing
- [ ] Test on actual devices, not just browser dev tools
- [ ] Verify touch targets are adequate size
- [ ] Check text readability without zooming
- [ ] Test hamburger menu functionality
- [ ] Ensure forms work with mobile keyboards

### Accessibility Testing
- [ ] Navigate entire app using only keyboard
- [ ] Test with screen reader (VoiceOver/NVDA)
- [ ] Verify color contrast ratios
- [ ] Check focus indicators are visible
- [ ] Test with users who have disabilities

### Performance
- [ ] Fast loading on mobile networks
- [ ] Smooth animations and transitions
- [ ] Efficient image loading
- [ ] Minimal JavaScript for critical path

## Implementation Notes

### CSS Organization
1. **CSS Custom Properties** at the top
2. **Base styles** (typography, resets)
3. **Layout components** (sidebar, main, grids)
4. **UI components** (buttons, cards, forms)
5. **Responsive styles** (mobile-first)
6. **Accessibility styles** (focus, sr-only)

### JavaScript Patterns
- Progressive enhancement
- Touch event support
- Keyboard event handling
- Focus management
- Screen reader announcements

### Future Improvements
- CSS-in-JS for component isolation
- Design token automation
- Component library with Storybook
- Automated accessibility testing
- Performance monitoring

## Brand Voice
Professional, trustworthy, medical-grade interface that works seamlessly across all devices. The design should feel like a high-end medical workstation while being approachable for learning.