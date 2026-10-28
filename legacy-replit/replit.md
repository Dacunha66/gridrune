# GridRune

## Overview
GridRune is a full-stack, web-based, turn-based card battle game. Players engage on a grid, strategically placing cards to capture opponents' cards through numerical comparisons. The game features local, AI, and real-time multiplayer modes. Key capabilities include a sophisticated shield system, comprehensive card effects, and a detailed card rarity system with visual progression. The project aims to deliver an immersive and strategic card game experience with rich visual feedback and a robust backend.

## User Preferences
Preferred communication style: Simple, everyday language.
**Card Value Positioning**: All card values are perfectly centered on their respective card edges using absolute positioning with proper transforms: top/bottom values (top-0/bottom-0 left-1/2 -translate-x-1/2), left/right values (left-0/right-0 top-1/2 -translate-y-1/2). Blue selection triangle perfectly aligned with top/bottom value positioning. FINAL POSITIONING - DO NOT CHANGE WITHOUT EXPLICIT USER REQUEST AND PERMISSION.

## System Architecture

### Frontend Architecture
The client is built with React 18 and TypeScript, using Vite. Radix UI and TailwindCSS are used for UI development. Zustand manages client-side state, separating game logic and audio. A comprehensive layered UI system ensures proper z-index management and consistent overlay behavior across all components.

### Backend Architecture
The server uses Express.js with TypeScript and an ESM module system. It follows a clean architecture with an interface-based storage pattern (`IStorage`), currently using in-memory storage (`MemStorage`) but designed for easy database integration.

### Layered UI System
A comprehensive z-index management system has been implemented with dedicated constants (`Z_INDEX`), reusable components (`LayeredContainer`, `ModalBackdrop`, `GameOverlay`), and context-based layer management (`LayerManagerProvider`). This ensures proper stacking order for modals, notifications, game effects, and system overlays, preventing visual conflicts and ensuring consistent user experience.

### Data Storage Solutions
PostgreSQL is integrated using Drizzle ORM for TypeScript-first schema definitions, supporting migrations via Drizzle Kit. User authentication tables include username and password fields, with Zod for validation.

### Game Logic Architecture
The core game involves cards with four directional values, placed on a grid. Battle resolution is turn-based, with adjacent card comparisons determining captures. Special handling for the neutral "O-Card" ensures correct ownership changes. Win conditions are based on card ownership on the board. The game supports both 3x3 and 4x4 board sizes.

### Audio System
A dedicated audio store manages background music, hit sounds, and success audio, providing mute/unmute functionality and volume control, supporting various audio formats and overlapping sound effects.

### Card Rarity System
A comprehensive animation system enables visual progression of card rarity through five tiers (Common, Uncommon, Rare, Epic, Legendary). This includes sparkle effects, transformation rings, and dynamic visual feedback. The system uses probability-based upgrade logic.

### UI/UX Decisions
The game features animated hover and selection effects for cards using motion.div and spring animations. Card detail modals and main menus have been redesigned with consistent theming. A comprehensive color-coding system applies rarity colors across all interfaces. Key UI/UX features include animated card collection and deck building, interactive achievement and leaderboard systems, seasonal rewards, weekly challenges, and one-click deck sharing. Dynamic background and holographic card effects enhance visual immersion, while mobile optimizations include swipe gestures and a visual placement guide.

## External Dependencies

### Core Framework Dependencies
- React ecosystem (React 18, React DOM, React Three Fiber)
- TypeScript (Frontend and Backend)
- Vite (Build tool and development server)
- Express.js (Backend web framework)

### Database & ORM
- Drizzle ORM (PostgreSQL dialect)
- @neondatabase/serverless (Serverless PostgreSQL adapter)
- Zod (Schema validation)

### UI & Styling
- Radix UI (Unstyled UI components)
- TailwindCSS (Utility-first CSS framework)
- Lucide React (Icon library)

### State Management & Data Fetching
- Zustand (Lightweight state management)
- TanStack Query (Server state management and caching)

### Development Tools
- TSX (TypeScript execution)
- ESBuild (JavaScript bundler)
- PostCSS (CSS post-processing)

### Audio & 3D Graphics
- @react-three/drei (Helpers for React Three Fiber)
- GLSL shader support (Custom shaders)

### Authentication & User Management
- bcrypt (Password hashing)
- express-session (Session management)
- connect-pg-simple (PostgreSQL session store)

### Real-time Communication
- Socket.io (Real-time multiplayer communication)