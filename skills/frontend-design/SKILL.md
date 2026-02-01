---
name: frontend-design
description: Create production-grade frontend interfaces with high design quality. Use when building web components, pages, or applications that require: (1) Responsive layouts, (2) Modern design patterns, (3) Accessibility compliance, (4) Performance optimization. Supports React, Vue, and vanilla HTML/CSS.
---

# Frontend Design Skill

Create production-grade frontend interfaces with high design quality.

## Workflow

1. **Analyze requirements** - Understand functionality and constraints
2. **Design structure** - Plan component hierarchy
3. **Implement** - Build with semantic HTML and proper styling
4. **Verify** - Check responsiveness and accessibility

## Component Design

### Atomic Design Principles

```
atoms → molecules → organisms → templates → pages
```

**Atoms** (basic building blocks):
- Buttons
- Inputs
- Labels

**Molecules** (simple combinations):
- Form fields
- Search bars
- Card headers

**Organisms** (complex components):
- Navigation
- Forms
- Cards

### Component Structure

```tsx
interface ComponentProps {
  // Props
}

export function Component({ prop }: ComponentProps) {
  return (
    <div className="component">
      {/* Content */}
    </div>
  )
}
```

**Best practices:**
- Use functional components
- Define clear prop types
- Keep components focused
- Use composition over inheritance

## Styling Guidelines

### CSS-in-JS (Tailwind)

```tsx
<div className="flex items-center gap-4 p-4 rounded-lg bg-white shadow">
  {/* Content */}
</div>
```

**Common patterns:**
- `flex items-center gap-4` - horizontal layout
- `flex flex-col gap-4` - vertical layout
- `grid grid-cols-2 gap-4` - 2-column grid
- `p-4` - padding
- `rounded-lg` - border radius
- `shadow` - box shadow

### Responsive Design

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Content */}
</div>
```

**Breakpoints:**
- `sm`: 640px
- `md`: 768px
- `laptop`: 1024px
- `lg`: 1280px

## Accessibility

### Semantic HTML

```tsx
<nav aria-label="Main navigation">
  <ul>
    <li><a href="/">Home</a></li>
    <li><a href="/about">About</a></li>
  </ul>
</nav>
```

### ARIA Labels

```tsx
<button aria-label="Close dialog" onClick={onClose}>
  <XIcon />
</button>
```

### Keyboard Navigation

- All interactive elements must be focusable
- Use `<button>` for actions, `<div>` with `role="button"` only when necessary
- Support `Enter` and `Space` for buttons
- Support `Escape` to close modals

## Quality Checklist

### Structure
- [ ] Semantic HTML elements
- [ ] Proper heading hierarchy (h1 → h2 → h3)
- [ ] Landmark regions (header, nav, main, footer)

### Accessibility
- [ ] All images have alt text
- [ ] Form inputs have associated labels
- [ ] Interactive elements are keyboard accessible
- [ ] Sufficient color contrast (4.5:1 for text)
- [ ] Focus indicators are visible

### Performance
- [ ] Images are optimized (WebP, lazy loading)
- [ ] No unnecessary re-renders
- [ ] Code is split by route
- [ ] Bundle size is optimized

### Responsive
- [ ] Works on mobile (320px+)
- [ ] Works on tablet (768px+)
- [ ] Works on desktop (1024px+)
- [ ] Touch targets are at least 44x44px

## Common Patterns

### Button Component

```tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  onClick?: () => void
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  onClick
}: ButtonProps) {
  const baseStyles = 'rounded-lg font-medium transition-colors'
  const variantStyles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300'
  }
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  }

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
```

### Card Component

```tsx
interface CardProps {
  title: string
  description: string
  actions?: React.ReactNode
}

export function Card({ title, description, actions }: CardProps) {
  return (
    <div className="p-6 rounded-lg bg-white shadow-md border border-gray-200">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-600 mb-4">{description}</p>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}
```

### Form Component

```tsx
interface FormFieldProps {
  label: string
  name: string
  type?: 'text' | 'email' | 'password'
  required?: boolean
}

export function FormField({ label, name, type = 'text', required }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="font-medium">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        id={name}
        name={name}
        required={required}
        className="px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}
```
