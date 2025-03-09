import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const GITHUB_API_BASE = "https://api.github.com";
const USER_AGENT = "github-workflow-debugger/1.0";

// Create server instance
const server = new McpServer({
  name: "github-workflow-debugger",
  version: "1.0.0",
});

// Helper function for making GitHub API requests
async function makeGitHubRequest<T>(
  url: string, 
  method: string = "GET", 
  body?: object
): Promise<T | null> {
  // Use environment variable for GitHub token
  const githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  
  if (!githubToken) {
    console.error("GitHub token not provided. Set GITHUB_PERSONAL_ACCESS_TOKEN environment variable.");
    return null;
  }

  const headers = {
    "User-Agent": USER_AGENT,
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${githubToken}`,
    "X-GitHub-Api-Version": "2022-11-28"
  };

  try {
    const options: RequestInit = { 
      method, 
      headers 
    };
    
    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      console.error(`GitHub API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    // Check if the response is empty
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      return data as T;
    } else {
      console.error("Response is not JSON");
      return null;
    }
  } catch (error) {
    console.error("Error making GitHub API request:", error);
    return null;
  }
}

// Helper function to fetch logs for a workflow run
async function fetchWorkflowRunLogs(owner: string, repo: string, runId: number): Promise<string | null> {
  const logsUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/runs/${runId}/logs`;
  
  try {
    // Use environment variable for GitHub token
    const githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    
    if (!githubToken) {
      console.error("GitHub token not provided. Set GITHUB_PERSONAL_ACCESS_TOKEN environment variable.");
      return null;
    }
    
    const headers = {
      "User-Agent": USER_AGENT,
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28"
    };
    
    const response = await fetch(logsUrl, { headers });
    
    if (!response.ok) {
      console.error(`GitHub API error fetching logs: ${response.status} ${response.statusText}`);
      return null;
    }
    
    // Logs are returned as a zip file, which we can't easily process in this environment
    // Instead, we'll return the URL to download the logs
    return logsUrl;
  } catch (error) {
    console.error("Error fetching workflow run logs:", error);
    return null;
  }
}

// Interfaces for GitHub API responses
interface WorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  status: string;
  conclusion: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  jobs_url: string;
  logs_url: string;
}

interface WorkflowRunsResponse {
  total_count: number;
  workflow_runs: WorkflowRun[];
}

interface Job {
  id: number;
  name: string;
  status: string;
  conclusion: string;
  started_at: string;
  completed_at: string;
  steps: JobStep[];
  html_url: string;
  head_sha: string;
}

interface JobStep {
  name: string;
  status: string;
  conclusion: string;
  number: number;
  started_at: string;
  completed_at: string;
  output?: string;
}

interface JobsResponse {
  total_count: number;
  jobs: Job[];
}

interface WorkflowFile {
  name: string;
  path: string;
  sha: string;
  content: string;
  encoding: string;
}

interface CommonWorkflowIssue {
  type: string;
  description: string;
  solution: string;
}

interface Annotation {
  path: string;
  start_line: number;
  end_line: number;
  start_column?: number;
  end_column?: number;
  annotation_level: string;
  message: string;
  title?: string;
  raw_details?: string;
}

interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string;
  output: {
    title: string;
    summary: string;
    text?: string;
    annotations_count: number;
    annotations_url: string;
  };
}

interface CheckRunsResponse {
  total_count: number;
  check_runs: CheckRun[];
}

interface AnnotationsResponse {
  annotations: Annotation[];
}

// Common workflow issues and their solutions
const commonWorkflowIssues: CommonWorkflowIssue[] = [
  {
    type: "node-setup-failure",
    description: "Node.js setup step is failing",
    solution: "Check the Node.js version specified in your workflow file. Make sure it's a valid version and the syntax is correct."
  },
  {
    type: "checkout-failure",
    description: "Checkout action is failing",
    solution: "Ensure you're using the correct checkout action version and that your repository has the necessary permissions."
  },
  {
    type: "dependency-installation-failure",
    description: "Dependency installation is failing",
    solution: "Check your package.json for invalid dependencies or version conflicts. Make sure your package-lock.json is committed."
  },
  {
    type: "build-failure",
    description: "Build step is failing",
    solution: "Review build logs for compilation errors. Check if your build command is correct and all required environment variables are set."
  },
  {
    type: "test-failure",
    description: "Tests are failing",
    solution: "Review test logs to identify which tests are failing and why. Fix the failing tests or update expected test results."
  },
  {
    type: "permission-denied",
    description: "Permission denied errors",
    solution: "Check if your workflow has the necessary permissions. You might need to update the 'permissions' section in your workflow file."
  },
  {
    type: "resource-limit-exceeded",
    description: "Resource limits exceeded",
    solution: "Your workflow might be hitting GitHub Actions resource limits. Consider optimizing your workflow or splitting it into smaller jobs."
  },
  {
    type: "invalid-workflow-syntax",
    description: "Invalid workflow syntax",
    solution: "Check your workflow file for syntax errors. Make sure indentation is correct and all required fields are present."
  }
];

// Register GitHub workflow debugging tools
server.tool(
  "get-failed-workflow-runs",
  "Get recent failed workflow runs for a GitHub repository",
  {
    owner: z.string().describe("GitHub repository owner (username or organization)"),
    repo: z.string().describe("GitHub repository name"),
  },
  async ({ owner, repo }) => {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/runs?status=failure&per_page=5`;
    const runsData = await makeGitHubRequest<WorkflowRunsResponse>(url);

    if (!runsData || runsData.total_count === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No failed workflow runs found for this repository.",
          },
        ],
      };
    }

    const formattedRuns = await Promise.all(runsData.workflow_runs.map(async (run) => {
      // Get logs URL for this run
      const logsUrl = await fetchWorkflowRunLogs(owner, repo, run.id);
      
      let logsText = "";
      if (logsUrl) {
        logsText = `Logs: ${logsUrl}\n`;
      }
      
      return `Run ID: ${run.id}\nWorkflow: ${run.name}\nBranch: ${run.head_branch}\nStatus: ${run.status}\nConclusion: ${run.conclusion}\nCreated: ${run.created_at}\nURL: ${run.html_url}\n${logsText}---`;
    }));

    return {
      content: [
        {
          type: "text",
          text: `Recent failed workflow runs for ${owner}/${repo}:\n\n${formattedRuns.join("\n")}`,
        },
      ],
    };
  },
);

server.tool(
  "get-workflow-run-jobs",
  "Get jobs for a specific workflow run",
  {
    owner: z.string().describe("GitHub repository owner (username or organization)"),
    repo: z.string().describe("GitHub repository name"),
    runId: z.number().describe("Workflow run ID"),
  },
  async ({ owner, repo, runId }) => {
    // Get jobs for this run
    const jobsUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/runs/${runId}/jobs`;
    const jobsData = await makeGitHubRequest<JobsResponse>(jobsUrl);

    if (!jobsData || jobsData.total_count === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No jobs found for this workflow run.",
          },
        ],
      };
    }

    // Get check runs for this workflow run
    const checkRunsUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${jobsData.jobs[0].head_sha}/check-runs`;
    const checkRunsData = await makeGitHubRequest<CheckRunsResponse>(checkRunsUrl);

    // Get logs URL for this run
    const logsUrl = await fetchWorkflowRunLogs(owner, repo, runId);

    // Process each job
    const formattedJobs = await Promise.all(jobsData.jobs.map(async (job) => {
      // Get annotations for failed steps
      let annotations: Annotation[] = [];
      
      if (checkRunsData && checkRunsData.total_count > 0) {
        // Find the check run that corresponds to this job
        const jobCheckRun = checkRunsData.check_runs.find(cr => cr.name === job.name);
        
        if (jobCheckRun && jobCheckRun.output.annotations_count > 0) {
          // Fetch annotations for this check run
          const annotationsUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/check-runs/${jobCheckRun.id}/annotations`;
          const annotationsData = await makeGitHubRequest<Annotation[]>(annotationsUrl);
          
          if (annotationsData) {
            annotations = annotationsData;
          }
        }
      }

      // Format steps with their status
      const steps = job.steps.map((step) => {
        return `  - Step ${step.number}: ${step.name} (${step.conclusion || step.status})`;
      }).join("\n");

      // Format annotations if any
      let annotationsText = "";
      if (annotations.length > 0) {
        annotationsText = "\nAnnotations:\n" + annotations.map(a => {
          return `  - [${a.annotation_level.toUpperCase()}] ${a.path}:${a.start_line}-${a.end_line}: ${a.message}`;
        }).join("\n");
      }

      // Add logs URL if available
      let logsText = "";
      if (logsUrl) {
        logsText = `\nLogs: ${logsUrl}`;
      }

      return `Job: ${job.name}\nStatus: ${job.status}\nConclusion: ${job.conclusion}\nURL: ${job.html_url}${logsText}\nSteps:\n${steps}${annotationsText}\n---`;
    }));

    return {
      content: [
        {
          type: "text",
          text: `Jobs for workflow run ${runId}:\n\n${formattedJobs.join("\n")}`,
        },
      ],
    };
  },
);

server.tool(
  "get-workflow-file",
  "Get the content of a workflow file",
  {
    owner: z.string().describe("GitHub repository owner (username or organization)"),
    repo: z.string().describe("GitHub repository name"),
    path: z.string().describe("Path to the workflow file (e.g., .github/workflows/main.yml)"),
  },
  async ({ owner, repo, path }) => {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`;
    const fileData = await makeGitHubRequest<WorkflowFile>(url);

    if (!fileData || !fileData.content) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to retrieve workflow file or file not found.",
          },
        ],
      };
    }

    // GitHub API returns content as base64 encoded
    const decodedContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

    return {
      content: [
        {
          type: "text",
          text: `Workflow file ${path}:\n\n\`\`\`yaml\n${decodedContent}\n\`\`\``,
        },
      ],
    };
  },
);

server.tool(
  "analyze-workflow-failure",
  "Analyze a failed workflow run and suggest fixes",
  {
    owner: z.string().describe("GitHub repository owner (username or organization)"),
    repo: z.string().describe("GitHub repository name"),
    runId: z.number().describe("Workflow run ID"),
  },
  async ({ owner, repo, runId }) => {
    // Get workflow run details
    const runUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/runs/${runId}`;
    const runData = await makeGitHubRequest<WorkflowRun>(runUrl);

    if (!runData) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to retrieve workflow run details.",
          },
        ],
      };
    }

    // Get jobs for this run
    const jobsUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/runs/${runId}/jobs`;
    const jobsData = await makeGitHubRequest<JobsResponse>(jobsUrl);

    if (!jobsData || jobsData.total_count === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No jobs found for this workflow run.",
          },
        ],
      };
    }

    // Find failed jobs and steps
    const failedJobs = jobsData.jobs.filter(job => job.conclusion === "failure");
    
    if (failedJobs.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No failed jobs found in this workflow run.",
          },
        ],
      };
    }

    // Get check runs for this workflow run
    const checkRunsUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${runData.head_sha}/check-runs`;
    const checkRunsData = await makeGitHubRequest<CheckRunsResponse>(checkRunsUrl);

    // Get logs URL for this run
    const logsUrl = await fetchWorkflowRunLogs(owner, repo, runId);

    // Analyze failures and suggest fixes
    const analysisResults = await Promise.all(failedJobs.map(async job => {
      const failedSteps = job.steps.filter(step => step.conclusion === "failure");
      
      // Get annotations for this job
      let jobAnnotations: Annotation[] = [];
      
      if (checkRunsData && checkRunsData.total_count > 0) {
        // Find the check run that corresponds to this job
        const jobCheckRun = checkRunsData.check_runs.find(cr => cr.name === job.name);
        
        if (jobCheckRun && jobCheckRun.output.annotations_count > 0) {
          // Fetch annotations for this check run
          const annotationsUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/check-runs/${jobCheckRun.id}/annotations`;
          const annotationsData = await makeGitHubRequest<Annotation[]>(annotationsUrl);
          
          if (annotationsData) {
            jobAnnotations = annotationsData;
          }
        }
      }
      
      // Match failed steps with common issues
      const possibleIssues = failedSteps.map(step => {
        let matchedIssues: CommonWorkflowIssue[] = [];
        
        // Simple pattern matching based on step names
        if (step.name.toLowerCase().includes("node") || step.name.toLowerCase().includes("setup-node")) {
          matchedIssues.push(commonWorkflowIssues.find(issue => issue.type === "node-setup-failure")!);
        } else if (step.name.toLowerCase().includes("checkout")) {
          matchedIssues.push(commonWorkflowIssues.find(issue => issue.type === "checkout-failure")!);
        } else if (step.name.toLowerCase().includes("install") || step.name.toLowerCase().includes("npm") || step.name.toLowerCase().includes("yarn")) {
          matchedIssues.push(commonWorkflowIssues.find(issue => issue.type === "dependency-installation-failure")!);
        } else if (step.name.toLowerCase().includes("build")) {
          matchedIssues.push(commonWorkflowIssues.find(issue => issue.type === "build-failure")!);
        } else if (step.name.toLowerCase().includes("test")) {
          matchedIssues.push(commonWorkflowIssues.find(issue => issue.type === "test-failure")!);
        }
        
        // If no specific match, suggest general issues
        if (matchedIssues.length === 0) {
          matchedIssues = [
            commonWorkflowIssues.find(issue => issue.type === "invalid-workflow-syntax")!,
            commonWorkflowIssues.find(issue => issue.type === "permission-denied")!
          ];
        }
        
        return {
          step: step.name,
          possibleIssues: matchedIssues
        };
      });
      
      return {
        jobName: job.name,
        jobUrl: job.html_url,
        failedSteps: failedSteps.map(s => s.name),
        annotations: jobAnnotations,
        analysis: possibleIssues
      };
    }));
    
    // Format the analysis results
    const formattedAnalysis = analysisResults.map(result => {
      // Format annotations if any
      let annotationsText = "";
      if (result.annotations && result.annotations.length > 0) {
        annotationsText = "\nAnnotations:\n" + result.annotations.map(a => {
          return `  - [${a.annotation_level.toUpperCase()}] ${a.path}:${a.start_line}-${a.end_line}: ${a.message}`;
        }).join("\n");
      }
      
      const stepsAnalysis = result.analysis.map(stepAnalysis => {
        const issues = stepAnalysis.possibleIssues.map(issue => `   - Issue: ${issue.description}\n     Solution: ${issue.solution}`).join("\n");
        return `  Step: ${stepAnalysis.step}\n  Possible issues:\n${issues}`;
      }).join("\n\n");
      
      return `Job: ${result.jobName}\nURL: ${result.jobUrl}\nFailed Steps: ${result.failedSteps.join(", ")}${annotationsText}\n\nAnalysis:\n${stepsAnalysis}`;
    }).join("\n\n---\n\n");
    
    // Add logs URL if available
    let logsSection = "";
    if (logsUrl) {
      logsSection = `\nWorkflow Logs: ${logsUrl}\n`;
    }
    
    // Add general recommendations
    const generalRecommendations = `
General Recommendations:
1. Check your workflow file for syntax errors
2. Ensure all required secrets and environment variables are set
3. Verify that your workflow has the necessary permissions
4. Check if you're using the latest versions of actions
5. Consider adding debugging steps to your workflow

Example workflow fix for common Node.js setup issues:
\`\`\`yaml
- name: Setup Node.js
  uses: actions/setup-node@v3  # Make sure to use a recent version
  with:
    node-version: '16'  # Specify a valid Node.js version
    cache: 'npm'        # Enable caching for faster installations
\`\`\`
`;

    return {
      content: [
        {
          type: "text",
          text: `Analysis of workflow run ${runId} for ${owner}/${repo}:${logsSection}\n${formattedAnalysis}\n\n${generalRecommendations}`,
        },
      ],
    };
  },
);

async function main() {
  // Check if GitHub token is provided
  if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
    console.error("Error: GITHUB_PERSONAL_ACCESS_TOKEN environment variable is not set.");
    console.error("Please set it to a valid GitHub Personal Access Token with appropriate permissions.");
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitHub Workflow Debugger MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});