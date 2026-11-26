# AI Learning Repository

[![Version](https://img.shields.io/badge/version-1.0.21-blue.svg)](https://github.com/ian-morgan99/SelfLearn)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A powerful VS Code extension that **automatically captures your AI coding interactions** and builds a personal knowledge base to accelerate your future projects. Works with **GitHub Copilot, Continue, Codex, Microsoft AI Toolkit, and AI Foundry**!

## 🎯 NEW: Multi-AI Tool Integration

Use **`@learnings`** across multiple AI assistants!

### Supported AI Tools:
- ✅ **GitHub Copilot Chat** - Native `@learnings` participant
- ✅ **Continue** - Context provider integration
- ✅ **OpenAI Codex** - Copy context to clipboard
- ✅ **Microsoft AI Toolkit** - Direct API integration  
- ✅ **Microsoft Foundry/AI Foundry** - Context source registration

```
You: @learnings how to handle async errors in TypeScript
AI Learning Repo: Found 3 relevant learnings (85% confidence)...
```

Works seamlessly across all your AI tools!

The extension automatically surfaces:
- ✅ Relevant past solutions with confidence scores
- ✅ Similar questions you've asked before
- ✅ Related learnings by language/framework
- ✅ Context analysis and pattern detection

### How It Works with Each Tool:

**GitHub Copilot Chat**: Type `@learnings <query>` in chat  
**Continue**: Use slash command `/learnings` or context provider  
**Codex**: Copy context to clipboard with command  
**AI Toolkit**: Automatic context provider registration  
**Foundry**: Registered as context source

## 🚀 Why This Extension?

Ever solved a complex problem with AI assistance, only to forget the solution weeks later? This extension:

- 📝 **Captures** every AI interaction automatically
- 🧠 **Learns** from your successful solutions
- 💬 **Integrates** with 5+ AI tools
- 🎯 **Injects** relevant context into new projects
- 🔐 **Protects** your intellectual property with private GitHub repos
- ☁️ **Syncs** across all your devices securely

## ✨ Key Features

### Multi-AI Tool Integration
- **Native chat participant** - Works with GitHub Copilot Chat  
- **Continue extension** - Context provider + slash command
- **OpenAI Codex** - Copy context for prompts
- **Microsoft AI Toolkit** - Direct API integration
- **Microsoft Foundry** - Registered context source
- **Universal support** - Works across all your AI assistants

### Chat Participant (`@learnings`)
- **Native chat integration** - Works seamlessly with supported tools
- **Instant context retrieval** - Type `@learnings <query>` to search
- **Smart relevance scoring** - Shows confidence percentage for each result
- **Rich context display** - Previews solutions, tags, and metadata
- **Non-invasive** - Only activates when you explicitly invoke it

### Automatic Learning Capture
- Tracks AI chat interactions, code completions, and context
- Captures prompts, solutions, and outcomes
- Records what worked and what didn't
- Zero manual effort required

### Intelligent Context Injection
- Analyzes new project structure and requirements
- Retrieves relevant learnings from your history
- Injects proven solutions automatically
- Suggests patterns that worked before

### Secure Storage Options
- **Local**: VS Code global storage (default)
- **Cloud Sync**: OneDrive, Google Drive, Dropbox support
- **Private GitHub**: Encrypted credential storage, auto-sync
- Your data, your control - no external servers

### GitHub Integration
- Create private repositories automatically
- Secure token storage with platform encryption
- Auto-commit and push on every learning
- Cross-device synchronization
- Full version history of your learnings

### Tree View Browser
- Browse learnings by language/framework
- Filter by technology stack
- View learning details and metadata
- Quick export and management

The learnings tree and analytics view now activate when you open them, which avoids intermittent "No view is registered" errors during window startup.

## 📸 Screenshots

### Tree View
Browse your learnings organized by language and framework:
```
📚 Learnings Repository
  ├─ 📁 TypeScript (24 learnings)
  ├─ 📁 Python (18 learnings)
  ├─ 📁 JavaScript (15 learnings)
  └─ 📁 React (12 learnings)
```

### Configuration UI
Easy-to-use settings interface for all features:
- Toggle auto-capture
- Configure storage location
- Setup GitHub private repository
- Manage sync settings

## 🎯 Quick Start

### Basic Usage

1. **Install** the extension from the marketplace
2. **Open** any project in VS Code
3. Start coding with your AI assistant (Copilot, Continue, Codex, etc.)
4. **View** your learnings: `Ctrl+Shift+P` → "View Learning Repository"

### Using with Different AI Tools

#### GitHub Copilot Chat
1. Open chat (`Ctrl+Alt+I` or click the chat icon)
2. Type `@learnings` followed by your question
3. Examples:
   - `@learnings async error handling in TypeScript`
   - `@learnings React state management patterns`

#### Continue Extension
1. Open Continue sidebar
2. Use slash command: `/learnings <your question>`
3. Or the extension automatically provides context when available

#### OpenAI Codex
1. Select code or text you want context for
2. Run command: `Ctrl+Shift+P` → "Copy Context for Codex/OpenAI"
3. Paste the context into your Codex prompt

#### Microsoft AI Toolkit
- Context automatically provided when available
- Or use command: `Ctrl+Shift+P` → "Query Learnings"

#### Microsoft Foundry/AI Foundry
- Registered as automatic context source
- Extension provides context when relevant

### Optional: Setup GitHub Sync

1. Open Configuration: `Ctrl+Shift+P` → "Configure AI Learning Settings"
2. Enable "Private GitHub Repository"
3. Click "Setup Private Repository"
4. Enter your GitHub Personal Access Token
5. Done! Your learnings sync automatically across devices

## 📋 Commands

| Command | Description |
|---------|-------------|
| `@learnings <query>` | **NEW**: Query learnings in Copilot Chat |
| `/learnings <query>` | **NEW**: Query learnings in Continue |
| `Query Learnings (Continue)` | **NEW**: Interactive query for Continue |
| `Copy Context for Codex` | **NEW**: Copy context to clipboard for Codex |
| `View Learning Repository` | Open the learnings tree view |
| `Export Learnings` | Export all learnings to JSON |
| `Import from Legacy Project` | Import existing learnings |
| `Inject Learning Context` | Manually inject context into a file |
| `Capture AI Chat Interaction` | Manual capture trigger |
| `Configure Settings` | Open settings UI |
| `Enable Test License Override` | Temporarily unlock Pro features for local testing |
| `Setup Private GitHub Repository` | Interactive GitHub setup |
| `Sync to GitHub` | Manual push to remote |
| `Pull Latest Learnings` | Manual pull from remote |

### Testing Pro Features Locally

If you are validating Pro-gated features before the licensing backend is ready, run `Enable Test License Override` from the Command Palette. The temporary test unlock is now stored by the extension itself, so it does not depend on writing a registered user setting.

- In development mode, it uses the built-in development override automatically.
- In an installed extension, it prompts for a temporary override key and unlocks Pro features for that local install.

## ⚙️ Configuration

### Basic Settings
- `ai-learning-repo.autoCapture` - Enable automatic capture (default: true)
- `ai-learning-repo.captureComments` - Include comments (default: true)
- `ai-learning-repo.maxStorageSize` - Max storage in MB (default: 1000)

### Context Injection Settings
- `ai-learning-repo.enableContextInjection` - Auto-inject context (default: true)
- `ai-learning-repo.minContextConfidenceThreshold` - Minimum confidence % to show results (default: 60)
- `ai-learning-repo.maxContextResultsPerSearch` - Max results per `@learnings` query (default: 10)
- `ai-learning-repo.contextSensitivity` - How aggressive injection should be: low/medium/high (default: medium)

### Storage Settings
- `ai-learning-repo.customStorageLocation` - Custom path for learnings

### GitHub Settings
- `ai-learning-repo.enableGitHubSync` - Enable GitHub sync
- `ai-learning-repo.gitHubAutoCommit` - Auto-commit on save
- `ai-learning-repo.gitHubAutoPush` - Auto-push to remote
- `ai-learning-repo.enablePrivateGitHubRepo` - Use private repository
- `ai-learning-repo.gitHubRepoUrl` - Repository URL
- `ai-learning-repo.gitHubAutoCreateRepo` - Auto-create repo via API

## 🔐 Security & Privacy

- **Local First**: All data stored locally by default
- **Encrypted Credentials**: GitHub tokens stored with platform-specific encryption (Windows Credential Manager, macOS Keychain, Linux Secret Service)
- **Private by Default**: GitHub repos created as private
- **No Tracking**: Zero external analytics or telemetry
- **Your IP**: Your learnings are YOUR intellectual property
- **Portable Format**: Standard JSON for easy migration to other tools

See [SECURITY_AND_PORTABILITY.md](SECURITY_AND_PORTABILITY.md) for detailed security architecture.

## 🛠️ Use Cases

### For Individual Developers
- **Instant Context Retrieval**: Use `@learnings` in chat to find past solutions in seconds
- Build a personal knowledge base of AI solutions
- Never lose track of working solutions
- Speed up similar projects with proven patterns
- Learn from your own history

### For AI-Assisted Development
- **Smart Context Injection**: Automatically surface relevant learnings during AI chats
- Get confidence-scored suggestions from your own experience
- See similar problems you've solved before
- Leverage your accumulated knowledge alongside AI suggestions

### For Local AI Models
- Export learnings as training data
- Portable JSON format for any tool
- Build custom AI assistants with your knowledge
- Fine-tune models on your coding patterns

### For Teams (Future)
- Share knowledge bases across team members
- Standardize solutions and patterns
- Onboard new developers faster
- Build institutional knowledge

## 📦 Requirements

- VS Code 1.95.0 or higher
- Git (for GitHub sync features)
- GitHub account (optional, for private repo sync)

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines and submit pull requests to our repository.

## 📄 License

This extension is licensed under the [MIT License](LICENSE).

## 🐛 Issues & Feedback

Found a bug or have a feature request? Please open an issue on our [GitHub repository](https://github.com/ian-morgan99/SelfLearn/issues).

## 🔗 Links

- [GitHub Repository](https://github.com/ian-morgan99/SelfLearn)
- [Issue Tracker](https://github.com/ian-morgan99/SelfLearn/issues)
- [Change Log](CHANGELOG.md)
- [Security Documentation](SECURITY_AND_PORTABILITY.md)

---

**Made with ❤️ for developers who learn from AI**
