import * as vscode from 'vscode';
import { LearningManager } from '../managers/learningManager';

export class InteractionTracker {
	private learningManager: LearningManager;
	private context: vscode.ExtensionContext;
	private autoCapture: boolean = true;
	private captureComments: boolean = true;
	private recentChanges: Map<string, { content: string; timestamp: number }> = new Map();

	constructor(learningManager: LearningManager, context: vscode.ExtensionContext) {
		this.learningManager = learningManager;
		this.context = context;
		this.updateConfig();
	}

	public updateConfig(): void {
		const config = vscode.workspace.getConfiguration('ai-learning-repo');
		this.autoCapture = config.get('autoCapture', true);
		this.captureComments = config.get('captureComments', true);
	}

	public onDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
		if (!this.autoCapture) {
			return;
		}

		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.uri !== event.document.uri) {
			return;
		}

		const language = event.document.languageId;
		
		// Track changes
		event.contentChanges.forEach(change => {
			const content = change.text;
			
			// Detect AI-generated patterns in code
			if (language !== 'markdown' && this.isLikelyAIGenerated(content)) {
				this.captureInteraction(content, language, 'code_completion');
			}

			// Capture significant markdown changes
			if (language === 'markdown' && content.length > 100) {
				this.captureMarkdownChange(content, event.document);
			}

			// Capture comments if enabled
			if (this.captureComments && content.includes('//')) {
				this.extractAndCaptureComments(content, language);
			}
		});

		// Store in recent changes
		this.recentChanges.set(event.document.uri.fsPath, {
			content: event.document.getText(),
			timestamp: Date.now()
		});
	}

	public async onFilesCreated(event: vscode.FileCreateEvent): Promise<void> {
		if (!this.autoCapture) {
			return;
		}

		// Capture file creation events as they might indicate AI-generated content
		for (const file of event.files) {
			console.log(`File created (potential AI generation): ${file.fsPath}`);
			
			// Check if it's a markdown file
			if (file.fsPath.endsWith('.md')) {
				await this.captureMarkdownFile(file);
			}
		}
	}

	private async captureMarkdownFile(file: vscode.Uri): Promise<void> {
		try {
			// Read the file content
			const content = await vscode.workspace.fs.readFile(file);
			const text = new TextDecoder().decode(content);
			
			// Check if it appears to be AI-generated (has structure, headings, etc.)
			if (this.isLikelyAIGeneratedMarkdown(text)) {
				const fileName = file.fsPath.split(/[\\\/]/).pop() || 'document';
				const title = this.extractMarkdownTitle(text) || fileName;
				
				await this.learningManager.addLearning(
					`Documentation: ${title}`,
					text.substring(0, 5000), // Capture first 5000 chars
					'markdown',
					['documentation', 'ai-generated', 'markdown'],
					`AI-generated markdown document: ${fileName}`,
					'unknown',
					`Full content captured from ${file.fsPath}`
				);
				
				console.log(`[InteractionTracker] Captured AI-generated markdown: ${fileName}`);
			}
		} catch (error) {
			console.error(`Failed to capture markdown file: ${error}`);
		}
	}

	private isLikelyAIGeneratedMarkdown(content: string): boolean {
		// Heuristics for AI-generated markdown
		const indicators = [
			/^#\s+.+$/m, // Has headings
			/^##\s+.+$/m, // Has subheadings
			/\*\*.*\*\*/m, // Has bold text
			/^-\s+/m, // Has lists
			/^###\s+/m, // Has multiple levels
			/^```/m, // Has code blocks
		];
		
		// Must have at least 3 indicators and be substantial (>200 chars)
		const matches = indicators.filter(pattern => pattern.test(content)).length;
		return matches >= 3 && content.length > 200;
	}

	private extractMarkdownTitle(content: string): string | null {
		// Try to extract the first # heading
		const match = content.match(/^#\s+(.+)$/m);
		return match ? match[1].trim() : null;
	}

	private markdownCaptureThrottle: Map<string, number> = new Map();

	private captureMarkdownChange(content: string, document: vscode.TextDocument): void {
		const filePath = document.uri.fsPath;
		const now = Date.now();
		const lastCapture = this.markdownCaptureThrottle.get(filePath) || 0;
		
		// Throttle: only capture once per 5 minutes for the same file
		if (now - lastCapture < 5 * 60 * 1000) {
			return;
		}

		// Check if the full document looks AI-generated
		const fullText = document.getText();
		if (this.isLikelyAIGeneratedMarkdown(fullText)) {
			this.markdownCaptureThrottle.set(filePath, now);
			
			const fileName = filePath.split(/[\\\/]/).pop() || 'document';
			const title = this.extractMarkdownTitle(fullText) || fileName;
			
			this.captureInteraction(
				fullText.substring(0, 5000),
				'markdown',
				'documentation',
				['ai-generated', 'markdown', 'documentation']
			);
		}
	}

	private isLikelyAIGenerated(content: string): boolean {
		// Heuristics to detect AI-generated content
		const patterns = [
			/\/\/ TODO:|\/\/ FIXME:|\/\/ NOTE:/i,
			/function\s+\w+\s*\(/,
			/class\s+\w+/,
			/interface\s+\w+/,
			/export\s+(default\s+)?(function|class|interface|const)/,
			/import\s+.*\s+from\s+['"`]/,
			/const\s+\w+\s*=\s*(async\s+)?\(/
		];

		return patterns.some(pattern => pattern.test(content)) && content.length > 20;
	}

	private extractAndCaptureComments(content: string, language: string): void {
		const commentPatterns: { [key: string]: RegExp } = {
			javascript: /\/\/\s*(.+?)$/gm,
			typescript: /\/\/\s*(.+?)$/gm,
			python: /#\s*(.+?)$/gm,
			csharp: /\/\/\s*(.+?)$/gm,
			java: /\/\/\s*(.+?)$/gm,
			cpp: /\/\/\s*(.+?)$/gm,
			c: /\/\*\s*(.+?)\s*\*\//gs
		};

		const pattern = commentPatterns[language];
		if (pattern) {
			let match;
			const pattern_exec = new RegExp(pattern.source, pattern.flags);
			while ((match = pattern_exec.exec(content)) !== null) {
				const comment = match[1].trim();
				if (comment.length > 10) {
					this.captureInteraction(
						comment,
						language,
						'comment',
						['documentation', 'explanation']
					);
				}
			}
		}
	}

	private async captureInteraction(
		content: string,
		language: string,
		interactionType: string,
		tags: string[] = []
	): Promise<void> {
		try {
			await this.learningManager.addLearning(
				`${interactionType}: ${content.substring(0, 100)}`,
				content,
				language,
				[interactionType, ...tags],
				`Automatically captured from ${interactionType}`,
				'unknown',
				`Interaction type: ${interactionType}`
			);
		} catch (error) {
			console.error('Failed to capture interaction:', error);
		}
	}

	public getRecentChanges(): Array<{ path: string; content: string; timestamp: number }> {
		return Array.from(this.recentChanges.entries()).map(([path, data]) => ({
			path,
			...data
		}));
	}

	public clearRecentChanges(): void {
		this.recentChanges.clear();
	}
}
