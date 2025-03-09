# GitHub Workflow Debugger MCP
[![smithery badge](https://smithery.ai/badge/@Maxteabag/githubworkflowmcp)](https://smithery.ai/server/@Maxteabag/githubworkflowmcp)

A Multi-Choice Prompt (MCP) utility for diagnosing and fixing GitHub Actions workflow failures using the GitHub API.

## Overview

This tool helps users diagnose and fix GitHub Actions workflow failures through a structured decision tree. It uses the GitHub API to fetch workflow run information, analyze failures, and provide actionable solutions.

## Features

- Fetch recent failed workflow runs for a repository
- Analyze workflow run jobs and steps
- Identify common failure patterns
- Suggest specific fixes for common issues
- View and update workflow files

## Installation

### Installing via Smithery

To install githubworkflowmcp for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@Maxteabag/githubworkflowmcp):

```bash
npx -y @smithery/cli install @Maxteabag/githubworkflowmcp --client claude
```

### Manual Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/github-workflow-debugger-mcp.git
cd github-workflow-debugger-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Link the binary for local use
npm link
```

## Usage

The GitHub Workflow Debugger MCP is designed to be used with AI assistants that support the Model Context Protocol (MCP). It provides several tools that can be used to diagnose and fix GitHub Actions workflow failures.

### Required Permissions

To use this tool, you'll need a GitHub Personal Access Token (PAT) with the following permissions:
- `repo` - Full control of private repositories
- `workflow` - Update GitHub Action workflows

You must set this token as an environment variable named `GITHUB_PERSONAL_ACCESS_TOKEN`.

### Configuration

When using this tool with an MCP-compatible client, you can configure it as follows:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-github"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>"
      }
    }
  }
}
```

Replace `<YOUR_TOKEN>` with your GitHub Personal Access Token.

### Available Tools

1. **get-failed-workflow-runs** - Fetches recent failed workflow runs for a repository
2. **get-workflow-run-jobs** - Gets jobs for a specific workflow run
3. **get-workflow-file** - Retrieves the content of a workflow file
4. **update-workflow-file** - Updates a workflow file with fixes
5. **analyze-workflow-failure** - Analyzes a failed workflow run and suggests fixes

### Example Usage

Here's an example of how to use the GitHub Workflow Debugger MCP with an AI assistant:

1. First, get recent failed workflow runs:
   ```
   I need to check recent failed workflow runs for my repository "username/repo".
   ```

2. Analyze a specific failed run:
   ```
   Can you analyze workflow run #123456 and suggest fixes?
   ```

3. View the workflow file:
   ```
   Show me the content of the workflow file at .github/workflows/main.yml
   ```

4. Update the workflow file with fixes:
   ```
   Update the workflow file with the suggested fixes.
   ```

## Development

### Prerequisites

- Node.js 16 or higher
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

### Project Structure

- `src/index.ts` - Main entry point for the MCP server
- `build/` - Compiled JavaScript files

## License

ISC 