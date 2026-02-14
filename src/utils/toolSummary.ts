/**
 * Tool Summary Generator
 *
 * Converts technical tool calls to user-friendly descriptions
 * Supports specialized parsing for Bash, Grep, Edit, etc.
 */

import i18n from '../i18n';
import type { ToolStatus } from '../types';
import {
  extractFilePath,
  extractCommand,
  extractSearchQuery,
} from './toolInputExtractor';

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, { ns: 'tools', ...options });

const TOOL_NAME_MAP: Record<string, string> = {
  'str_replace_editor': 'names.editFile',
  'Edit': 'names.editFile',
  'ReadFile': 'names.readFile',
  'read_file': 'names.readFile',
  'BashCommand': 'names.executeCommand',
  'run_command': 'names.executeCommand',
  'WriteFile': 'names.writeFile',
  'write_file': 'names.writeFile',
  'ListFiles': 'names.listFiles',
  'list_files': 'names.listFiles',
  'SearchFiles': 'names.searchFiles',
  'search_files': 'names.searchFiles',
  'GitCommand': 'names.gitOperation',
  'git_command': 'names.gitOperation',
  'DatabaseQuery': 'names.databaseQuery',
  'database_query': 'names.databaseQuery',
  'APICall': 'names.apiRequest',
  'api_call': 'names.apiRequest',
  'WebSearch': 'names.webSearch',
  'web_search': 'names.webSearch',
  'FileBrowser': 'names.browseFiles',
  'file_browser': 'names.browseFiles',
  'CreateFile': 'names.createFile',
  'create_file': 'names.createFile',
  'DeleteFile': 'names.deleteFile',
  'delete_file': 'names.deleteFile',
  'MoveFile': 'names.moveFile',
  'move_file': 'names.moveFile',
  'CopyFile': 'names.copyFile',
  'copy_file': 'names.copyFile',
};

function getToolFriendlyName(toolName: string): string {
  const key = TOOL_NAME_MAP[toolName];
  return key ? t(key) : toolName;
}

export function generateToolSummary(
  toolName: string,
  input?: Record<string, unknown>,
  status: ToolStatus = 'running'
): string {
  const friendlyName = getToolFriendlyName(toolName);
  const filePath = extractFilePath(input);
  const command = extractCommand(input);
  const query = extractSearchQuery(input);

  const isRunning = status === 'running';

  switch (toolName) {
    case 'str_replace_editor':
    case 'Edit':
      if (filePath) {
        return isRunning ? `${t('actions.editing')} ${filePath}` : `${filePath} ${t('actions.edited')}`;
      }
      return isRunning ? `${t('actions.editing')} ${friendlyName}` : friendlyName;

    case 'ReadFile':
    case 'read_file':
      if (filePath) {
        return isRunning ? `${t('actions.reading')} ${filePath}` : `${filePath} ${t('actions.read')}`;
      }
      return isRunning ? `${t('actions.reading')} ${friendlyName}` : friendlyName;

    case 'WriteFile':
    case 'write_file':
    case 'CreateFile':
    case 'create_file':
      if (filePath) {
        return isRunning ? `${t('actions.creating')} ${filePath}` : `${filePath} ${t('actions.created')}`;
      }
      return isRunning ? `${t('actions.creating')} ${friendlyName}` : friendlyName;

    case 'DeleteFile':
    case 'delete_file':
      if (filePath) {
        return isRunning ? `${t('actions.deleting')} ${filePath}` : `${filePath} ${t('actions.deleted')}`;
      }
      return isRunning ? `${t('actions.deleting')} ${friendlyName}` : friendlyName;

    case 'BashCommand':
    case 'run_command':
      if (command) {
        return isRunning ? `${t('actions.executing')}: ${command}` : `${t('actions.executed')}: ${command}`;
      }
      return isRunning ? `${t('actions.executing')} ${friendlyName}` : friendlyName;

    case 'SearchFiles':
    case 'search_files':
    case 'WebSearch':
    case 'web_search':
      if (query) {
        return isRunning ? `${t('actions.searching')}: ${query}` : `${t('actions.searched')}: ${query}`;
      }
      return isRunning ? `${t('actions.searching')} ${friendlyName}` : friendlyName;

    case 'ListFiles':
    case 'list_files':
      if (filePath) {
        return isRunning ? `${t('actions.listing')} ${filePath}` : `${t('actions.listed')} ${filePath}`;
      }
      return isRunning ? `${t('actions.listing')} ${friendlyName}` : friendlyName;

    case 'GitCommand':
    case 'git_command':
      if (command) {
        return isRunning ? `${t('actions.gitExecuting')}: ${command}` : `${t('actions.gitExecuted')}: ${command}`;
      }
      return isRunning ? `${t('actions.gitExecuting')} ${friendlyName}` : friendlyName;

    default:
      if (filePath) {
        return isRunning ? `${t('actions.executing')} ${friendlyName}: ${filePath}` : `${friendlyName}: ${filePath}`;
      }
      if (command) {
        return isRunning ? `${t('actions.executing')}: ${command}` : command;
      }
      return isRunning ? `${t('actions.executing')} ${friendlyName}` : friendlyName;
  }
}

export function generateToolGroupSummary(
  toolCount: number,
  status: ToolStatus,
  completedCount = 0
): string {
  if (status === 'running') {
    if (toolCount === 1) {
      return t('group.executingOne');
    }
    return t('group.executingMany', { count: toolCount });
  }

  if (status === 'completed') {
    return t('group.completed', { count: toolCount });
  }

  if (status === 'failed') {
    return t('group.failed', { count: toolCount });
  }

  if (status === 'partial') {
    return t('group.partial', { completed: completedCount, total: toolCount });
  }

  return t('group.operations', { count: toolCount });
}

export function calculateToolGroupStatus(
  tools: Array<{ status: ToolStatus }>
): ToolStatus {
  if (tools.length === 0) return 'running';

  const allCompleted = tools.every(t => t.status === 'completed');
  const anyFailed = tools.some(t => t.status === 'failed');
  const allRunning = tools.every(t => t.status === 'running' || t.status === 'pending');
  const someCompleted = tools.some(t => t.status === 'completed');

  if (allCompleted) return 'completed';
  if (anyFailed && !someCompleted) return 'failed';
  if (anyFailed) return 'partial';
  if (allRunning) return 'running';
  return 'partial';
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m${seconds}s`;
}

export function calculateDuration(startedAt: string, completedAt?: string): number | undefined {
  if (!completedAt) return undefined;
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  return end - start;
}

export function stripAnsiCodes(text: string): string {
  const ansiRegex = /\x1b\[[0-9;]*m/g;
  return text.replace(ansiRegex, '');
}

export type OutputSummaryType =
  | 'matchCount'
  | 'fileCount'
  | 'lineCount'
  | 'exitStatus'
  | 'resultCount'
  | 'todoProgress'
  | 'urlFetch'
  | 'diffSummary'
  | 'plain';

export interface OutputSummary {
  type: OutputSummaryType;
  summary: string;
  fullOutput?: string;
  expandable?: boolean;
}

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

export interface GrepOutputData {
  matches: GrepMatch[];
  query: string;
  total: number;
}

export function parseGrepMatches(output: string, input?: Record<string, unknown>): GrepOutputData | null {
  const lines = output.trim().split('\n');
  const matches: GrepMatch[] = [];
  const query = extractSearchQuery(input) || '';

  for (const line of lines) {
    if (!line.trim()) continue;

    const match = line.match(/^([^:]+):(\d+)(?::(\d+))?:?(.*)$/);
    if (match) {
      const [, file, lineNum, , content] = match;
      if (content.trim()) {
        matches.push({
          file,
          line: parseInt(lineNum, 10),
          content: content.trim(),
        });
      }
    } else {
      matches.push({
        file: '',
        line: 0,
        content: line.trim(),
      });
    }
  }

  if (matches.length === 0) return null;

  return { matches, query, total: matches.length };
}

function parseGrepOutput(output: string): OutputSummary | null {
  const lines = output.trim().split('\n');
  const matchCount = lines.filter(line => line.trim()).length;

  if (matchCount === 0) {
    return { type: 'matchCount', summary: t('output.noMatches'), fullOutput: output };
  }

  return {
    type: 'matchCount',
    summary: t('output.foundMatches', { count: matchCount }),
    fullOutput: output,
    expandable: true,
  };
}

function parseGlobOutput(output: string): OutputSummary | null {
  if (!output.trim()) {
    return { type: 'fileCount', summary: t('output.noFiles') };
  }

  const files = output.trim().split('\n').filter(f => f.trim());
  return {
    type: 'fileCount',
    summary: t('output.foundFiles', { count: files.length }),
    fullOutput: output,
    expandable: files.length > 0,
  };
}

const ERROR_KEYWORDS = [
  'error:', 'error ', 'Error:', 'Error ', 'ERROR:',
  'fail', 'Fail', 'FAIL', 'failed', 'Failed', 'FAILED',
  'exception', 'Exception', 'EXCEPTION',
  'cannot', 'Cannot', 'CANNOT',
  'unable', 'Unable', 'UNABLE',
  'denied', 'Denied', 'DENIED',
  'not found', 'Not Found', 'NOT FOUND',
  'no such', 'No such', 'NO SUCH',
];

function parseBashOutput(output: string): OutputSummary | null {
  if (!output.trim()) {
    return { type: 'exitStatus', summary: t('output.commandExecuted') };
  }

  const cleanOutput = stripAnsiCodes(output);
  const lines = cleanOutput.trim().split('\n').filter(l => l.trim());

  if (lines.length === 0) {
    return { type: 'exitStatus', summary: t('output.commandNoOutput') };
  }

  const errorLine = lines.find(line =>
    ERROR_KEYWORDS.some(kw =>
      line.toLowerCase().includes(kw.toLowerCase())
    )
  );

  if (errorLine) {
    const cleanError = errorLine.trim().slice(0, 50);
    return {
      type: 'exitStatus',
      summary: t('output.error', { message: cleanError + (errorLine.length > 50 ? '...' : '') }),
      fullOutput: cleanOutput,
      expandable: true,
    };
  }

  const exitCodeMatch = cleanOutput.match(/exit\s+code:\s*(\d+)/i);
  if (exitCodeMatch) {
    const code = parseInt(exitCodeMatch[1], 10);
    if (code !== 0) {
      return {
        type: 'exitStatus',
        summary: t('output.exitCode', { code }),
        fullOutput: cleanOutput,
        expandable: true,
      };
    }
  }

  const npmErrorMatch = cleanOutput.match(/npm\s+err!\s+(.+)/i);
  if (npmErrorMatch) {
    return {
      type: 'exitStatus',
      summary: `npm: ${npmErrorMatch[1].trim().slice(0, 40)}...`,
      fullOutput: cleanOutput,
      expandable: true,
    };
  }

  const firstLine = lines[0].trim();
  return {
    type: 'exitStatus',
    summary: firstLine.slice(0, 50) + (firstLine.length > 50 ? '...' : ''),
    fullOutput: cleanOutput,
    expandable: lines.length > 1,
  };
}

function parseWebSearchOutput(output: string): OutputSummary | null {
  const countMatch = output.match(/found?\s*(\d+)\s*result/i);
  if (countMatch) {
    return {
      type: 'resultCount',
      summary: t('output.foundResults', { count: countMatch[1] }),
      fullOutput: output,
      expandable: true,
    };
  }

  return {
    type: 'resultCount',
    summary: t('output.searchCompleted'),
    fullOutput: output,
    expandable: true,
  };
}

function parseReadOutput(output: string): OutputSummary | null {
  if (!output.trim()) {
    return { type: 'lineCount', summary: t('output.noFiles') };
  }

  const lines = output.split('\n').length;
  const chars = output.length;
  const sizeKB = (chars / 1024).toFixed(1);

  return {
    type: 'lineCount',
    summary: `${lines} ${t('output.writtenLines', { count: lines }).split(' ')[1] || 'lines'} (${sizeKB} KB)`,
    fullOutput: output,
    expandable: true,
  };
}

function parseWriteOutput(output: string): OutputSummary | null {
  if (output.toLowerCase().includes('success') || output.toLowerCase().includes('written')) {
    const linesMatch = output.match(/(\d+)\s*line/);
    if (linesMatch) {
      return { type: 'lineCount', summary: t('output.writtenLines', { count: linesMatch[1] }) };
    }
    return { type: 'lineCount', summary: t('output.writeSuccess') };
  }

  return {
    type: 'lineCount',
    summary: t('output.writeComplete'),
    fullOutput: output,
  };
}

function parseEditOutput(output: string, input?: Record<string, unknown>): OutputSummary | null {
  const filePath = input?.path as string || '';
  const fileName = filePath.split('/').pop() || '';

  if (output.toLowerCase().includes('success') ||
      output.toLowerCase().includes('edited') ||
      output.toLowerCase().includes('updated') ||
      output.toLowerCase().includes('complete')) {
    return {
      type: 'diffSummary',
      summary: fileName ? t('output.modified', { name: fileName }) : t('output.modifySuccess'),
      fullOutput: output,
    };
  }

  if (output.toLowerCase().includes('fail') ||
      output.toLowerCase().includes('error')) {
    return {
      type: 'diffSummary',
      summary: fileName ? t('output.modifyFailed', { name: fileName }) : t('output.modifyFailedShort'),
      fullOutput: output,
      expandable: true,
    };
  }

  return null;
}

export function generateOutputSummary(
  toolName: string,
  output: string,
  status: ToolStatus = 'completed',
  input?: Record<string, unknown>
): OutputSummary | null {
  if (!output || status === 'running' || status === 'pending') {
    return null;
  }

  const normalizedToolName = toolName.toLowerCase();

  if (normalizedToolName.includes('grep')) {
    return parseGrepOutput(output);
  }

  if (normalizedToolName.includes('glob')) {
    return parseGlobOutput(output);
  }

  if (
    normalizedToolName.includes('bash') ||
    normalizedToolName.includes('command') ||
    normalizedToolName.includes('execute')
  ) {
    return parseBashOutput(output);
  }

  if (
    normalizedToolName.includes('edit') ||
    normalizedToolName.includes('str_replace')
  ) {
    const editResult = parseEditOutput(output, input);
    if (editResult) return editResult;
  }

  if (normalizedToolName.includes('search') || normalizedToolName.includes('web_search')) {
    return parseWebSearchOutput(output);
  }

  if (normalizedToolName.includes('read') || normalizedToolName.includes('read_file')) {
    return parseReadOutput(output);
  }

  if (
    normalizedToolName.includes('write') ||
    normalizedToolName.includes('write_file') ||
    normalizedToolName.includes('create')
  ) {
    return parseWriteOutput(output);
  }

  const preview = output.slice(0, 50);
  return {
    type: 'plain',
    summary: preview + (output.length > 50 ? '...' : ''),
    fullOutput: output,
    expandable: output.length > 50,
  };
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
