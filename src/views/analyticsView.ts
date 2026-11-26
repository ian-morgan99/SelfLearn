import * as vscode from "vscode";
import { Learning } from "../managers/learningManager";

export class AnalyticsView implements vscode.WebviewViewProvider {
  public static readonly viewType = "ai-learning-repo.analyticsView";

  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private getLearnings: () => Promise<Learning[]>,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "refresh":
          await this.refresh();
          break;
      }
    });

    this.refresh();
  }

  public async refresh() {
    if (this._view) {
      const learnings = await this.getLearnings();
      const analytics = this._generateAnalytics(learnings);
      this._view.webview.postMessage({ type: "update", analytics });
    }
  }

  private _generateAnalytics(learnings: Learning[]) {
    // Group learnings by date
    const byDate: { [date: string]: number } = {};
    const byProject: { [project: string]: number } = {};
    const byLanguage: { [language: string]: number } = {};

    learnings.forEach((learning) => {
      // By date (daily)
      const date = new Date(learning.timestamp).toISOString().split("T")[0];
      byDate[date] = (byDate[date] || 0) + 1;

      // By project
      const project = learning.projectName || "Unknown";
      byProject[project] = (byProject[project] || 0) + 1;

      // By language
      const language = learning.language || "unknown";
      byLanguage[language] = (byLanguage[language] || 0) + 1;
    });

    // Sort dates
    const sortedDates = Object.keys(byDate).sort();

    // Calculate cumulative learnings
    const cumulative: { [date: string]: number } = {};
    let total = 0;
    sortedDates.forEach((date) => {
      total += byDate[date];
      cumulative[date] = total;
    });

    // Get recent activity (last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentLearnings = learnings.filter(
      (l) => l.timestamp >= thirtyDaysAgo,
    );

    return {
      total: learnings.length,
      byDate,
      byProject,
      byLanguage,
      cumulative,
      recentCount: recentLearnings.length,
      sortedDates,
    };
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Learning Analytics</title>
  <style>
    body {
      padding: 10px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    
    h2 {
      font-size: 16px;
      margin: 10px 0;
      color: var(--vscode-foreground);
    }
    
    .stat-card {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 12px;
      margin: 10px 0;
    }
    
    .stat-label {
      font-size: 11px;
      opacity: 0.7;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      margin: 5px 0;
    }
    
    .chart {
      margin: 15px 0;
      padding: 10px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
    }
    
    .bar-chart {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .bar-item {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .bar-label {
      min-width: 120px;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .bar-container {
      flex: 1;
      height: 20px;
      background: var(--vscode-input-background);
      border-radius: 3px;
      position: relative;
    }
    
    .bar-fill {
      height: 100%;
      background: var(--vscode-button-background);
      border-radius: 3px;
      transition: width 0.3s ease;
    }
    
    .bar-value {
      min-width: 30px;
      text-align: right;
      font-size: 11px;
      opacity: 0.8;
    }
    
    .timeline-chart {
      position: relative;
      height: 200px;
      margin: 20px 0;
    }
    
    .timeline-svg {
      width: 100%;
      height: 100%;
    }
    
    .timeline-line {
      fill: none;
      stroke: var(--vscode-charts-blue);
      stroke-width: 2;
    }
    
    .timeline-area {
      fill: var(--vscode-charts-blue);
      fill-opacity: 0.2;
    }
    
    .timeline-point {
      fill: var(--vscode-charts-blue);
      stroke: var(--vscode-editor-background);
      stroke-width: 2;
    }
    
    .axis-label {
      font-size: 10px;
      fill: var(--vscode-foreground);
      opacity: 0.6;
    }
    
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 14px;
      border-radius: 2px;
      cursor: pointer;
      font-size: 12px;
      margin: 10px 0;
    }
    
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <h2>📊 Learning Analytics</h2>
  
  <div class="stat-card">
    <div class="stat-label">Total Learnings</div>
    <div class="stat-value" id="totalLearnings">0</div>
  </div>
  
  <div class="stat-card">
    <div class="stat-label">Last 30 Days</div>
    <div class="stat-value" id="recentLearnings">0</div>
  </div>
  
  <button onclick="refresh()">🔄 Refresh</button>
  
  <h2>📈 Learnings Over Time</h2>
  <div class="chart">
    <div class="timeline-chart">
      <svg class="timeline-svg" id="timelineSvg"></svg>
    </div>
  </div>
  
  <h2>📁 Learnings by Project</h2>
  <div class="chart">
    <div class="bar-chart" id="projectChart"></div>
  </div>
  
  <h2>💻 Learnings by Language</h2>
  <div class="chart">
    <div class="bar-chart" id="languageChart"></div>
  </div>
  
  <script>
    const vscode = acquireVsCodeApi();
    
    function refresh() {
      vscode.postMessage({ type: 'refresh' });
    }
    
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'update') {
        updateAnalytics(message.analytics);
      }
    });
    
    function updateAnalytics(analytics) {
      document.getElementById('totalLearnings').textContent = analytics.total;
      document.getElementById('recentLearnings').textContent = analytics.recentCount;
      
      renderTimeline(analytics);
      renderBarChart('projectChart', analytics.byProject);
      renderBarChart('languageChart', analytics.byLanguage);
    }
    
    function renderTimeline(analytics) {
      const svg = document.getElementById('timelineSvg');
      const width = svg.clientWidth || 300;
      const height = 200;
      const padding = { top: 10, right: 10, bottom: 30, left: 40 };
      
      const dates = analytics.sortedDates || [];
      if (dates.length === 0) {
        svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" class="axis-label">No data available</text>';
        return;
      }
      
      const values = dates.map(d => analytics.cumulative[d]);
      const maxValue = Math.max(...values);
      
      const xScale = (i) => padding.left + (i / (dates.length - 1 || 1)) * (width - padding.left - padding.right);
      const yScale = (val) => height - padding.bottom - ((val / maxValue) * (height - padding.top - padding.bottom));
      
      // Generate path for line
      let pathD = '';
      let areaD = '';
      dates.forEach((date, i) => {
        const x = xScale(i);
        const y = yScale(values[i]);
        
        if (i === 0) {
          pathD = \`M \${x} \${y}\`;
          areaD = \`M \${x} \${height - padding.bottom}\`;
        } else {
          pathD += \` L \${x} \${y}\`;
        }
        areaD += \` L \${x} \${y}\`;
      });
      areaD += \` L \${xScale(dates.length - 1)} \${height - padding.bottom} Z\`;
      
      let svgContent = \`
        <path d="\${areaD}" class="timeline-area"/>
        <path d="\${pathD}" class="timeline-line"/>
      \`;
      
      // Add points
      dates.forEach((date, i) => {
        const x = xScale(i);
        const y = yScale(values[i]);
        svgContent += \`<circle cx="\${x}" cy="\${y}" r="3" class="timeline-point"/>\`;
      });
      
      // Add axes
      svgContent += \`
        <line x1="\${padding.left}" y1="\${height - padding.bottom}" 
              x2="\${width - padding.right}" y2="\${height - padding.bottom}" 
              stroke="currentColor" stroke-opacity="0.2"/>
        <line x1="\${padding.left}" y1="\${padding.top}" 
              x2="\${padding.left}" y2="\${height - padding.bottom}" 
              stroke="currentColor" stroke-opacity="0.2"/>
      \`;
      
      // Add labels
      const labelStep = Math.max(1, Math.floor(dates.length / 5));
      dates.forEach((date, i) => {
        if (i % labelStep === 0 || i === dates.length - 1) {
          const x = xScale(i);
          const shortDate = date.substring(5); // MM-DD
          svgContent += \`
            <text x="\${x}" y="\${height - 10}" 
                  text-anchor="middle" class="axis-label">\${shortDate}</text>
          \`;
        }
      });
      
      // Add value labels
      const yStep = Math.ceil(maxValue / 4);
      for (let i = 0; i <= 4; i++) {
        const value = i * yStep;
        const y = yScale(value);
        svgContent += \`
          <text x="\${padding.left - 5}" y="\${y + 3}" 
                text-anchor="end" class="axis-label">\${value}</text>
        \`;
      }
      
      svg.innerHTML = svgContent;
    }
    
    function renderBarChart(elementId, data) {
      const container = document.getElementById(elementId);
      const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
      const maxValue = Math.max(...entries.map(e => e[1]));
      
      if (entries.length === 0) {
        container.innerHTML = '<div style="padding: 10px; opacity: 0.6;">No data available</div>';
        return;
      }
      
      container.innerHTML = entries.map(([label, value]) => {
        const percentage = (value / maxValue) * 100;
        return \`
          <div class="bar-item">
            <div class="bar-label" title="\${label}">\${label}</div>
            <div class="bar-container">
              <div class="bar-fill" style="width: \${percentage}%"></div>
            </div>
            <div class="bar-value">\${value}</div>
          </div>
        \`;
      }).join('');
    }
    
    // Request initial data
    refresh();
  </script>
</body>
</html>`;
  }
}
