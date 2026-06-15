import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('Diagnostics CLI integration', () => {
  it('should display help menu when --help is passed', () => {
    const cliPath = path.resolve(__dirname, '../src/cli.ts');
    
    // We can execute Node with ts-node/esm or similar since it's TypeScript.
    // Or we can test that the file compiles and parses by checking its command configuration.
    const output = execSync(`npx tsx ${cliPath} --help`, { encoding: 'utf8' });
    expect(output).toContain('Usage: helix-diag');
    expect(output).toContain('Commands:');
    expect(output).toContain('check');
    expect(output).toContain('pool');
    expect(output).toContain('tx');
    expect(output).toContain('jito');
    expect(output).toContain('metrics');
  });

  it('should run metrics command with default table format', () => {
    const cliPath = path.resolve(__dirname, '../src/cli.ts');
    const output = execSync(`npx tsx ${cliPath} metrics`, { encoding: 'utf8' });
    expect(output).toContain('Total Requests');
    expect(output).toContain('Healthy Nodes');
  });

  it('should run metrics command with JSON format', () => {
    const cliPath = path.resolve(__dirname, '../src/cli.ts');
    const output = execSync(`npx tsx ${cliPath} metrics --format json`, { encoding: 'utf8' });
    const parsed = JSON.parse(output);
    expect(parsed.totalRequests).toBe(1420);
    expect(parsed.healthyNodes).toBe(1);
  });

  it('should run metrics command with prometheus format', () => {
    const cliPath = path.resolve(__dirname, '../src/cli.ts');
    const output = execSync(`npx tsx ${cliPath} metrics --format prometheus`, { encoding: 'utf8' });
    expect(output).toContain('helix_pool_healthy_nodes');
    expect(output).toContain('helix_rpc_requests_total');
  });
});
