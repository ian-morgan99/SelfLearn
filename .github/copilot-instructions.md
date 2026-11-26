<!-- Use this file to provide workspace-specific custom instructions to Copilot -->

# AI Learning Repository Extension - Custom Instructions

## Project Overview

This is a VS Code extension that self-learns from AI coding interactions (Copilot, Continue, Codex) and builds a master repository of learnings to accelerate future projects.

## Architecture

- **LearningManager**: Core storage and retrieval of learnings (global VS Code storage)
- **InteractionTracker**: Monitors and captures AI interactions from text changes
- **ContextAnalyzer**: Detects project type, languages, frameworks
- **ContextInjector**: Injects relevant learnings into new projects
- **LearningsTreeView**: UI for browsing learnings by language

## Key Patterns

1. All data is stored locally in VS Code's global storage (no external calls)
2. Learnings are scored by relevance (language, framework, recency, outcome)
3. Extension activates on `onStartupFinished` event
4. Interactions are captured via document change monitoring

## Development Guidelines

1. Always use VS Code's API for storage and file operations
2. Keep all learnings local - no external API calls
3. Use TypeScript with strict type checking
4. Follow the modular architecture (managers, trackers, analyzers, injectors)
5. Test new features with multiple project types

## Testing Scenarios

- TypeScript/JavaScript projects
- Python projects
- Mixed-language workspaces
- Projects with no detected frameworks
- Export/import workflows

## Extension Manifest

- ID: `ai-learning-repo`
- Publisher: `TheDynamicsFactory`
- Full Extension ID: `TheDynamicsFactory.ai-learning-repo`
- Display Name: `AI Learning Repository`
- Main Entry: `extension.ts` → compiled to `dist/extension.js`
- Activation: `onStartupFinished`

## Important Notes

- Extension uses esbuild for bundling (watch mode: `npm run esbuild-watch`)
- Data persistence uses VS Code's encrypted storage
- Tree view auto-refreshes after operations
- All commands are registered in extension activation
