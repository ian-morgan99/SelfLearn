# Change Log

All notable changes to the "AI Learning Repository" extension will be documented in this file.

## [1.0.21] - 2026-05-21

### Fixed
- Added explicit view activation events so the learnings tree and analytics view activate reliably when opened.
- Reduced cases where VS Code could report "No view is registered with id: learnings-tree" before startup activation completed.

## [1.0.20] - 2026-05-21

### Fixed
- Test license override no longer depends on writing contributed user settings in production installs.
- Temporary production test unlock is now stored in extension-owned state, avoiding the "not a registered configuration" error.

## [1.0.19] - 2026-05-20

### Added
- Test license override command to unlock Pro-gated features during local validation.
- Pro feature warning prompt now includes a direct test override action.

### Improved
- Documented the local Pro feature testing flow in the README.

## [1.0.16] - 2026-02-06

### Added
- **Multi-AI Tool Integration**
  - Native VS Code chat participant for GitHub Copilot Chat (`@learnings`)
  - Continue extension integration with context provider API
  - OpenAI Codex integration via clipboard context copying
  - Microsoft AI Toolkit direct API integration
  - Microsoft Foundry/AI Foundry context source registration
  - Universal command: "Query Learnings" works across all tools
  - Copy Context for Codex/OpenAI command

- **Chat Participant Features**
  - Use `@learnings` in GitHub Copilot Chat to query repository
  - Use `/learnings` in Continue extension
  - Automatically surfaces relevant learnings with confidence scores
  - Shows similar questions and related solutions from your history
  - Displays context analysis with detected languages, concepts, and frameworks
  - Non-invasive: only activates when explicitly invoked

### Enhanced
- **Context Injection System**
  - Real-time context enrichment during AI interactions
  - Smart relevance scoring based on language, frameworks, and problem types
  - Confidence percentage for each context suggestion
  - Solution previews directly in chat interface
  - Support for 5+ AI tools in one extension

### Improved
- Better documentation for multi-AI tool support
- Enhanced user experience for learning retrieval across tools
- Unified context format for different AI assistants

### Fixed
- Package.json syntax error with orphaned properties
- Context injection now properly integrated with VS Code Chat API
- Multi-tool support ensures compatibility across AI ecosystems

## [1.0.0] - 2026-02-05

### Added
- **Core Features**
  - Automatic AI interaction capture from Copilot, Continue, and other AI tools
  - Learning repository with structured storage of interactions
  - Smart context injection for new projects
  - Tree view for browsing learnings by language/framework
  - Export learnings to JSON for backup and portability

- **Storage Options**
  - Local storage in VS Code global storage (default)
  - Configurable custom storage location (OneDrive, Google Drive, Dropbox, etc.)
  - Support for cloud-synced folders for cross-device access

- **GitHub Integration**
  - Private GitHub repository support for secure learning storage
  - Secure credential storage using VS Code SecretStorage API
  - Automatic git commit and push on learning save
  - Auto-create private repositories via GitHub API
  - Manual sync commands (push/pull)
  - GitHub repository status checking

- **Configuration**
  - Comprehensive settings UI accessible via command
  - Auto-capture toggle
  - Custom storage path configuration
  - GitHub sync configuration
  - Private repository management

- **Security**
  - Encrypted credential storage for GitHub Personal Access Tokens
  - Private repository by default
  - No external analytics or tracking
  - All data stored locally or in user-controlled repositories

- **Data Management**
  - Import from legacy projects
  - Clear all learnings command
  - Export to portable JSON format
  - Data structure designed for local AI model integration

### Commands
- `View Learning Repository` - Browse stored learnings
- `Export Learnings` - Export to JSON file
- `Clear All Learnings` - Delete all stored data
- `Inject Learning Context` - Add context to new projects
- `Import from Legacy Project` - Import existing learnings
- `Capture AI Chat Interaction` - Manual capture trigger
- `Configure Settings` - Open settings UI
- `Setup Private GitHub Repository` - Interactive GitHub setup
- `Check GitHub Status` - Verify GitHub configuration
- `Sync to GitHub` - Manual git push
- `Pull Latest Learnings` - Manual git pull

### Technical
- Built with TypeScript 5.3.3
- VS Code API 1.95.0+
- GitHub REST API v3 integration
- Secure token management with platform-specific encryption
- Portable JSON data format for maximum compatibility

## [Unreleased]
- Future: Support for additional AI tools
- Future: Advanced analytics and insights
- Future: Team sharing capabilities
- Future: Integration with more version control systems
