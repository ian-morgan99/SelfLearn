# AI Learning Repository - Security & Portability Guide

## Overview

Your learnings are your intellectual property (IP). This guide explains how SelfLearn protects your data while ensuring it remains portable across multiple AI assistant products and local models.

## 🔒 Security Architecture

### Credential Storage

All sensitive credentials are stored using **VS Code's SecretStorage API**, which provides:

- ✅ **Encrypted at Rest**: Windows Credential Manager, macOS Keychain, or Linux Secret Service
- ✅ **Never Logged**: Credentials never appear in console output or debug logs
- ✅ **Per-User**: Credentials isolated per user account per machine
- ✅ **Automatic Cleanup**: Credentials removed when extension is uninstalled

### GitHub Personal Access Tokens

When you set up private GitHub sync:

1. **Token Input**: You provide a GitHub Personal Access Token (PAT)
2. **Secure Storage**: Token is encrypted and stored in VS Code's secret storage
3. **Minimal Permissions**: Use tokens with minimal required scopes:
   - `repo` (full control of private repositories) - if accessing private repos
   - Or `public_repo` (access to public repositories only) - if using public repos
4. **Automatic Rotation**: Consider rotating PATs regularly
5. **No Logs**: Token is never logged or displayed in any output

#### Creating a GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token"
3. Give it a descriptive name: `ai-learnings-sync`
4. Select **minimum** required scopes:
   - For private repos: `repo`
   - For public repos: `public_repo`
5. Set an expiration (90 days recommended)
6. Copy and save it securely
7. **Never share this token** - it provides repository access

### Data Encryption

Learnings are stored as plain JSON but can be:
- Encrypted at the GitHub repository level (using GitHub's encryption)
- Stored in encrypted cloud folders (OneDrive with Device Encryption, Google Drive with encryption, etc.)
- Backed up to encrypted local drives

## 📦 Data Portability

### Learnings Format

All learnings are stored in a standardized JSON format:

```json
{
  "id": "uuid",
  "timestamp": 1707139200000,
  "question": "How do I...?",
  "solution": "...",
  "language": "typescript",
  "frameworks": ["react", "next.js"],
  "outcome": "success",
  "reliability": 85,
  "...": "other metadata"
}
```

This format is:
- ✅ **Self-contained**: No external dependencies
- ✅ **Version-agnostic**: Works with any JSON parser
- ✅ **Portable**: Easy to import into other tools
- ✅ **Extensible**: Additional fields can be added without breaking compatibility

### Export & Import

**Export learnings:**
1. Command: `ai-learning-repo.exportLearnings`
2. Saves to: `learnings-export-TIMESTAMP.json`
3. Contains: All learnings in standard format

**Import learnings:**
1. Command: `ai-learning-repo.importLearnings`
2. Accepts: Any valid learnings JSON file
3. Merges: Adds to existing learnings, avoiding duplicates by ID

### Migration Path

To move learnings to another tool:

1. **Export**: Use `exportLearnings` to get JSON
2. **Transform**: Write a converter for your target tool's format
3. **Import**: Import the transformed data into your new tool

Example: Python script to extract learnings for a local LLM:

```python
import json

with open('learnings-export.json') as f:
    learnings = json.load(f)

# Filter and format for your local model
relevant = [l for l in learnings if l['outcome'] == 'success']
for learning in relevant:
    print(f"Q: {learning['question']}")
    print(f"A: {learning['solution']}")
    print("---")
```

## 🔐 Private GitHub Repository

### Setup

1. **Create Personal Access Token**:
   - GitHub Settings → Developer settings → Personal access tokens
   - Scopes: `repo` (private) or `public_repo` (public)
   - Store securely

2. **Configure in SelfLearn**:
   - Command: `ai-learning-repo.setupPrivateGitHub`
   - Enter your PAT when prompted
   - Optionally auto-create private repository

3. **Enable Syncing**:
   - Setting: `enablePrivateGitHubRepo`
   - Setting: `gitHubAutoCommit`
   - Setting: `gitHubAutoPush` (optional, requires push access)

### Repository Privacy

- **Always Private**: Repositories are created as private by default
- **Access Control**: Only you have access by default
- **Collaborators**: Add collaborators through GitHub Settings if needed
- **No Public**: Never accidentally expose your learnings publicly

### Sync Workflow

```
Local Changes
    ↓
Detect learnings.json change
    ↓
Create git commit with timestamp
    ↓
Push to GitHub (optional)
    ↓
Access from any device with repo clone
```

## 💾 Storage Options

### Option 1: VS Code Global Storage (Default)
- Location: Platform-specific (Windows: `%APPDATA%\Code\User\globalStorage`)
- Security: Encrypted by VS Code
- Portability: Low (tied to VS Code installation)
- **Best for**: Single device, local development

### Option 2: Cloud-Synced Folder
- Location: OneDrive, Google Drive, Dropbox, etc.
- Configuration: `customStorageLocation` setting
- Security: Cloud provider's encryption
- Portability: High (automatic sync across devices)
- **Best for**: Multiple devices, cloud-native workflow

### Option 3: Private GitHub Repository
- Location: GitHub.com (or GitHub Enterprise)
- Configuration: `enablePrivateGitHubRepo` setting
- Security: Token-based auth + GitHub's encryption
- Portability: High (clone anywhere with credentials)
- **Best for**: Version control, collaboration, backup

### Recommended Combination

For maximum security and portability:

```
┌─────────────────────────────┐
│  Local Working Directory    │
│   (learnings.json)          │
└──────────────┬──────────────┘
               │
        ┌──────┴──────┐
        │             │
        ▼             ▼
   ┌────────┐    ┌───────────────────┐
   │OneDrive│    │Private GitHub Repo│
   │(Backup)│    │  (Version Control)│
   └────────┘    └───────────────────┘
```

This provides:
- Redundancy (backup in multiple locations)
- Access across devices (OneDrive + GitHub clone)
- Version history (Git commits)
- Portability (export anytime)

## 🛡️ Best Practices

### Authentication

- ✅ Use Personal Access Tokens, not passwords
- ✅ Create tokens with minimal scopes
- ✅ Set expiration dates (90 days)
- ✅ Rotate tokens regularly
- ✅ Never commit tokens to git repositories
- ✅ Revoke tokens when no longer needed

### Data Management

- ✅ Regularly review learnings for accuracy
- ✅ Delete obsolete or incorrect learnings
- ✅ Keep backups in multiple locations
- ✅ Test exports/imports periodically
- ✅ Monitor storage growth (use `maxStorageSize` config)

### Privacy

- ✅ Keep GitHub repositories private
- ✅ Don't share PATs with anyone
- ✅ Review repository collaborators
- ✅ Check GitHub Actions logs for token exposure
- ✅ Use private browsing for GitHub if on shared computer

## 🔄 Data Recovery

### If You Lose Access

**Local learnings lost?**
- Restore from cloud backup (OneDrive, Google Drive, etc.)
- Clone from GitHub: `git clone <repo-url>`
- Restore from recent backup

**GitHub Repository Lost?**
- You can restore if you have local copy
- Cloud backups provide redundancy
- Consider archiving important learnings to JSON export

**Token Compromised?**
- Revoke immediately in GitHub Settings
- Create new token
- Update in VS Code: `ai-learning-repo.setupPrivateGitHub`
- Old token automatically replaced

## 📊 What Gets Synced

### Included in Sync

- ✅ All learnings (questions, solutions, metadata)
- ✅ Language and framework information
- ✅ Outcome and reliability scores
- ✅ Timestamp and source data
- ✅ Tags and categorization
- ✅ Related learnings links

### Not Synced

- ❌ Credentials (stored in VS Code SecretStorage)
- ❌ Extension settings (stored locally in VS Code)
- ❌ Personal file paths (normalized on sync)
- ❌ Machine-specific data

## 🚀 Advanced: Using with Local Models

### Export for Local LLM

```bash
# Export learnings
ai-learning-repo.exportLearnings

# Convert to format for local model
python convert_for_ollama.py learnings-export.json

# Load into local model context
ollama --system @learnings_summary.txt
```

### Sync Workflow with Offline Access

1. Clone private repo on laptop
2. Export learnings
3. Include in local model context
4. Sync changes back when online
5. Push to GitHub on next connection

## 📚 References

- [GitHub Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [VS Code SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage)
- [Git Security](https://git-scm.com/book/en/v2/Git-Tools-Credential-Storage)

---

**Questions?** Check the main README.md for support and community resources.
