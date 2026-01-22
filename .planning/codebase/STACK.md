# Technology Stack

**Analysis Date:** 2026-01-22

## Languages

**Primary:**
- TypeScript 5.6.3 - Client and server codebase
- JavaScript (ESNext) - Module transpilation target

**Secondary:**
- CSS - Styling via Tailwind CSS
- HTML - Generated from React components

## Runtime

**Environment:**
- Node.js (version not pinned; no .nvmrc file)

**Package Manager:**
- pnpm 10.4.1 - Specified in packageManager field
- Lockfile: pnpm-lock.yaml (present)

## Frameworks

**Core:**
- React 19.2.1 - UI framework
- Vite 7.1.7 - Build tool and dev server
- Express 4.21.2 - HTTP server for production static serving

**UI Components:**
- Radix UI (multiple packages) - Headless component library
  - @radix-ui/react-dialog, @radix-ui/react-select, @radix-ui/react-tabs, @radix-ui/react-menubar, @radix-ui/react-popover, etc.

**Styling:**
- Tailwind CSS 4.1.14 - Utility-first CSS framework
- @tailwindcss/vite 4.1.3 - Vite integration
- autoprefixer 10.4.20 - CSS vendor prefixing
- postcss 8.4.47 - CSS processing
- tailwind-merge 3.3.1 - Merge Tailwind classes intelligently
- tailwindcss-animate 1.0.7 - Animation utilities

**Form Handling:**
- react-hook-form 7.64.0 - Form state management
- @hookform/resolvers 5.2.2 - Schema validation integration
- zod 4.1.12 - Schema validation library

**Routing:**
- wouter 3.3.5 - Lightweight client-side router

**Data & State:**
- idb 8.0.3 - IndexedDB wrapper for browser storage
- React Context API - State management (via contexts in `client/src/contexts/`)

**Media & Audio:**
- MediaRecorder API (native browser) - Audio recording
- Web Audio API (native browser) - Audio analysis and playback
- axios 1.12.0 - HTTP client (may be unused or legacy)

**Animation & Motion:**
- framer-motion 12.23.22 - Animation library
- embla-carousel-react 8.6.0 - Carousel component

**Drag & Drop:**
- @dnd-kit/core 6.3.1 - Drag and drop functionality
- @dnd-kit/sortable 10.0.0 - Sortable elements
- @dnd-kit/utilities 3.2.2 - Utilities

**Charts & Visualization:**
- recharts 2.15.2 - Chart components
- lucide-react 0.453.0 - Icon library

**UI Enhancements:**
- cmdk 1.1.1 - Command menu component
- react-resizable-panels 3.0.6 - Resizable panel layouts
- vaul 1.1.2 - Drawer component
- sonner 2.0.7 - Toast notifications
- next-themes 0.4.6 - Theme switching (light/dark mode)
- react-day-picker 9.11.1 - Date picker component
- input-otp 1.4.2 - OTP input component
- class-variance-authority 0.7.1 - Component variant utility

**Utilities:**
- clsx 2.1.1 - Conditional classname utility
- nanoid 5.1.5 - Unique ID generation
- jszip 3.10.1 - ZIP file creation/handling
- streamdown 1.4.0 - Unknown utility package

## Build & Dev Tools

**Build:**
- esbuild 0.25.0 - Fast bundler for server code
- Vite 7.1.7 - Frontend bundling

**Development:**
- @vitejs/plugin-react 5.0.4 - React JSX transform for Vite
- @builder.io/vite-plugin-jsx-loc 0.1.1 - JSX location tracking
- vite-plugin-manus-runtime 0.0.57 - Custom Vite plugin

**Code Quality:**
- TypeScript 5.6.3 - Static type checking
- prettier 3.6.2 - Code formatter
- tsx 4.19.1 - TypeScript execution

**Testing:**
- vitest 2.1.4 - Vite-native testing framework
- add 2.0.6 - NPM add command wrapper (dev only)

**Types:**
- @types/react 19.2.1 - React type definitions
- @types/react-dom 19.2.1 - React DOM type definitions
- @types/node 24.7.0 - Node.js type definitions
- @types/express 4.17.21 - Express type definitions
- @types/google.maps 3.58.1 - Google Maps API types

## Key Dependencies

**Critical:**
- React 19.2.1 - Core UI framework
- Vite 7.1.7 - Development and build system
- TypeScript 5.6.3 - Type safety and development experience
- Tailwind CSS 4.1.14 - Primary styling approach
- idb 8.0.3 - Local data persistence via IndexedDB

**Infrastructure:**
- Express 4.21.2 - Production server
- node-html-parser (not in deps but likely used) - HTML parsing if needed

## Configuration

**Environment:**
- `.env` files supported (Vite's envDir configured in vite.config.ts)
- Environment variables prefixed with `VITE_` for client code
- Key variables:
  - `VITE_OAUTH_PORTAL_URL` - OAuth authentication endpoint
  - `VITE_APP_ID` - Application identifier
  - `VITE_FRONTEND_FORGE_API_KEY` - Forge API authentication
  - `VITE_FRONTEND_FORGE_API_URL` - Forge API endpoint (defaults to https://forge.butterfly-effect.dev)
  - `NODE_ENV` - Environment (production/development)
  - `PORT` - Server port (defaults to 3000)

**Build:**
- `vite.config.ts` - Vite configuration
  - Root: `client/` directory
  - Path aliases: `@` → `client/src`, `@shared` → `shared`, `@assets` → `attached_assets`
  - Output: `dist/public/`
  - Dev server: port 3000, allows hosts like .manus.computer, localhost

**Prettier:**
- `.prettierrc` - Code formatting rules
  - 2-space indentation
  - Double quotes
  - Semicolons required
  - 80 character line width
  - Trailing commas in ES5 syntax

**TypeScript:**
- `tsconfig.json` - Main config
  - Strict mode enabled
  - ESNext module target
  - JSX preserve mode
  - Bundler module resolution
  - Path aliases configured for imports
- `tsconfig.node.json` - Node-specific config

## Package Manager Configuration

**pnpm specifics:**
- Version: 10.4.1+sha512... (pinned with hash)
- Patches applied:
  - `wouter@3.7.1.patch` - Custom wouter router patch
- Overrides:
  - `tailwindcss>nanoid` → 3.3.7
- Built dependencies:
  - @tailwindcss/oxide (forced)
  - esbuild (forced)

## Platform Requirements

**Development:**
- macOS (based on repo location and dev setup)
- Node.js runtime (version unspecified)
- pnpm package manager
- Git for version control

**Production:**
- Node.js runtime
- HTTP hosting environment
- Environment variables for OAuth and API keys
- Browser support: Modern browsers with Web Audio API and MediaRecorder support

## Notable Architectural Patterns

**Monorepo Structure:**
- `client/src/` - React frontend application
- `server/` - Express static file server
- `shared/` - Shared types and constants
- `attached_assets/` - Static assets directory

**Build Process:**
1. Vite builds client code to `dist/public/`
2. esbuild bundles server code to `dist/index.js`
3. Production entry: `dist/index.js` serves static files from `dist/public/`

---

*Stack analysis: 2026-01-22*
