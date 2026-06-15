#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import fs from 'fs';
import {
  createSolanaRpc,
  address,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  AccountRole,
  createKeyPairFromBytes,
  createSignerFromKeyPair,
} from '@solana/web3.js';
import { createHelixClient } from '@helix-sdk/core';
import { JitoClient } from '@helix-sdk/jito';

const program = new Command();

program
  .name('helix-diag')
  .description('Helix Reliability SDK Diagnostics CLI')
  .version('0.1.0');

// 1. check <endpoint>
program
  .command('check')
  .description('Ping a single RPC endpoint to assess health and latency')
  .argument('<endpoint>', 'RPC URL to check')
  .option('-c, --count <number>', 'number of pings to send', '10')
  .option('-t, --timeout <number>', 'request timeout in ms', '2000')
  .action(async (endpoint, options) => {
    const count = parseInt(options.count);
    const timeoutMs = parseInt(options.timeout);

    console.log(chalk.bold(`\n─────────────────────────────────────────────────────`));
    console.log(chalk.bold(`  HELIX DIAGNOSTICS · Endpoint Health Check`));
    console.log(chalk.bold(`─────────────────────────────────────────────────────`));
    console.log(`  Endpoint: ${chalk.cyan(endpoint)}`);
    console.log(`  Checks:   ${count} requests`);

    const spinner = ora('Pinging endpoint...').start();
    const rpc = createSolanaRpc(endpoint);

    const latencies: number[] = [];
    let successes = 0;

    for (let i = 0; i < count; i++) {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        
        await rpc.getSlot().send({ abortSignal: controller.signal });
        
        clearTimeout(id);
        const elapsed = Date.now() - start;
        latencies.push(elapsed);
        successes++;
      } catch (err) {
        // Failed request
      }
    }

    spinner.stop();

    if (successes === 0) {
      console.log(chalk.red('\n  Status: ● UNHEALTHY (100% packet loss)'));
      console.log(chalk.red('  Recommendation: Do not use this endpoint in production.'));
      process.exit(1);
    }

    latencies.sort((a, b) => a - b);
    const min = latencies[0]!;
    const max = latencies[latencies.length - 1]!;
    const p50 = latencies[Math.floor(latencies.length * 0.5)]!;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || max;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || max;

    const table = new Table({
      head: [chalk.bold('Metric'), chalk.bold('Value'), chalk.bold('Rating')],
      colWidths: [15, 12, 30],
    });

    const getRating = (ms: number) => {
      if (ms < 100) return chalk.green('████████████████ FAST');
      if (ms < 300) return chalk.green('████████████░░░░ GOOD');
      if (ms < 1000) return chalk.yellow('████████░░░░░░░░ OK');
      return chalk.red('████░░░░░░░░░░░░ SLOW');
    };

    table.push(
      ['Min', `${min}ms`, getRating(min)],
      ['P50', `${p50}ms`, getRating(p50)],
      ['P95', `${p95}ms`, getRating(p95)],
      ['P99', `${p99}ms`, getRating(p99)],
      ['Max', `${max}ms`, getRating(max)],
      ['Errors', `${count - successes}/${count}`, successes === count ? chalk.green('●●●● CLEAN') : chalk.yellow('⚠ WARNING')]
    );

    console.log(table.toString());
    const isHealthy = p50 < 300 && successes === count;
    console.log(`\n  Status: ${isHealthy ? chalk.green('● HEALTHY') : chalk.yellow('⚠ DEGRADED')}`);
    console.log(`  Recommendation: ${isHealthy ? 'Ready for production use.' : 'Use as low-priority fallback only.'}`);
    console.log(chalk.bold(`─────────────────────────────────────────────────────\n`));
  });

// 2. pool <endpoints...>
program
  .command('pool')
  .description('Test a local RPC pool balance and health')
  .argument('<endpoints...>', 'space-separated list of RPC URLs')
  .option('--simulate-failures', 'simulate server failure rotation')
  .action(async (endpoints) => {
    console.log(chalk.bold(`\n─────────────────────────────────────────────────────`));
    console.log(chalk.bold(`  HELIX DIAGNOSTICS · RPC Pool Check`));
    console.log(chalk.bold(`─────────────────────────────────────────────────────`));
    
    const client = createHelixClient({
      endpoints: endpoints.map((url: string) => ({ url })),
    });

    const spinner = ora('Checking pool health...').start();
    // Allow health checks to run at least once
    await new Promise((r) => setTimeout(r, 2000));
    spinner.stop();

    const metrics = client.getMetrics();
    const table = new Table({
      head: [chalk.bold('Endpoint'), chalk.bold('Status'), chalk.bold('Latency (P50)')],
    });

    for (const ep of metrics.endpoints) {
      const statusColor = ep.status === 'healthy' ? chalk.green : ep.status === 'degraded' ? chalk.yellow : chalk.red;
      table.push([
        ep.url,
        statusColor(ep.status.toUpperCase()),
        `${ep.latencyP50Ms}ms`,
      ]);
    }

    console.log(table.toString());
    console.log(`\n  Pool Summary: ${metrics.healthyNodes}/${endpoints.length} healthy nodes`);
    console.log(chalk.bold(`─────────────────────────────────────────────────────\n`));
    await client.destroy();
  });

// 3. tx
program
  .command('tx')
  .description('Send a test self-transfer transaction on devnet to check confirmation latency')
  .requiredOption('--rpc <url>', 'RPC endpoint URL')
  .requiredOption('--keypair <path>', 'path to keypair.json file')
  .option('--network <type>', 'network type', 'devnet')
  .action(async (options) => {
    const spinner = ora('Loading keypair and preparing self-transfer...').start();
    let signer: any;
    try {
      const keypairBytes = JSON.parse(fs.readFileSync(options.keypair, 'utf8'));
      const keyPair = await createKeyPairFromBytes(new Uint8Array(keypairBytes));
      signer = await createSignerFromKeyPair(keyPair);
    } catch (err: any) {
      spinner.fail(`Failed to load keypair: ${err.message}`);
      process.exit(1);
    }

    const rpc = createSolanaRpc(options.rpc);
    
    try {
      const { value: blockhash } = await rpc.getLatestBlockhash().send();
      const feePayer = signer.address;

      const data = new Uint8Array(12);
      const view = new DataView(data.buffer);
      view.setUint32(0, 2, true); // SystemProgram.transfer index
      view.setBigUint64(4, 1000n, true); // 1000 lamports

      const transferInstruction = {
        programAddress: address('11111111111111111111111111111111'),
        accounts: [
          { address: feePayer, role: AccountRole.WRITABLE_SIGNER },
          { address: feePayer, role: AccountRole.WRITABLE },
        ],
        data,
      };

      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayerSigner(signer, tx),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
        (tx) => appendTransactionMessageInstruction(transferInstruction, tx)
      );

      const signedTx = await signTransactionMessageWithSigners(message);
      const wireTx = getBase64EncodedWireTransaction(signedTx);

      spinner.text = 'Sending transaction...';
      const start = Date.now();
      const signature = await rpc.sendTransaction(wireTx).send();
      spinner.text = `Transaction sent: ${signature}. Waiting for confirmation...`;

      // Simple confirmation poll
      let confirmed = false;
      for (let i = 0; i < 30; i++) {
        const status = await rpc.getSignatureStatuses([signature]).send();
        const info = status.value[0];
        if (info && (info.confirmationStatus === 'confirmed' || info.confirmationStatus === 'finalized')) {
          confirmed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      const elapsed = Date.now() - start;

      if (confirmed) {
        spinner.succeed(`Transaction landed successfully!`);
        console.log(`\n  Signature: ${chalk.green(signature)}`);
        console.log(`  Landed In: ${elapsed}ms`);
      } else {
        spinner.fail(`Transaction failed to confirm within 30s.`);
      }
    } catch (err: any) {
      spinner.fail(`Transaction failed: ${err.message}`);
    }
  });

// 4. jito
program
  .command('jito')
  .description('Query Jito tip accounts and simulate tip recommendations')
  .option('--endpoint <region>', 'Jito block engine region', 'mainnet')
  .action(async (options) => {
    const spinner = ora('Connecting to Jito block engine...').start();
    const jito = new JitoClient({ endpoint: options.endpoint });
    
    try {
      const tipAccounts = await jito.getTipAccounts();
      const tipLamports = await jito.getTipAmount();
      
      spinner.stop();
      console.log(chalk.bold(`\n─────────────────────────────────────────────────────`));
      console.log(chalk.bold(`  HELIX DIAGNOSTICS · Jito Block Engine Check`));
      console.log(chalk.bold(`─────────────────────────────────────────────────────`));
      console.log(`  Region:   ${chalk.cyan(options.endpoint)}`);
      console.log(`  Tip Accounts:\n    - ${tipAccounts.join('\n    - ')}`);
      console.log(`  Recommended tip: ${chalk.green(tipLamports.toString())} lamports`);
      console.log(chalk.bold(`─────────────────────────────────────────────────────\n`));
    } catch (err: any) {
      spinner.fail(`Jito fetch failed: ${err.message}`);
    }
  });

// 5. metrics
program
  .command('metrics')
  .description('Print a snapshot of currently collected metrics')
  .option('--format <type>', 'metrics display format: table, json, prometheus', 'table')
  .action(async (options) => {
    // Basic mock pool metrics snapshot for demo
    const snapshot = {
      timestamp: Date.now(),
      endpoints: [
        { url: 'https://api.mainnet-beta.solana.com', status: 'healthy', latencyP50Ms: 45 },
      ],
      healthyNodes: 1,
      degradedNodes: 0,
      unhealthyNodes: 0,
      totalRequests: 1420,
      totalErrors: 12,
    };

    if (options.format === 'json') {
      console.log(JSON.stringify(snapshot, null, 2));
    } else if (options.format === 'prometheus') {
      console.log(`# HELP helix_pool_healthy_nodes Count of healthy pool nodes`);
      console.log(`# TYPE helix_pool_healthy_nodes gauge`);
      console.log(`helix_pool_healthy_nodes ${snapshot.healthyNodes}`);
      console.log(`# HELP helix_rpc_requests_total Total RPC calls`);
      console.log(`# TYPE helix_rpc_requests_total counter`);
      console.log(`helix_rpc_requests_total ${snapshot.totalRequests}`);
    } else {
      const table = new Table({
        head: [chalk.bold('Metric Name'), chalk.bold('Value')],
      });
      table.push(
        ['Total Requests', snapshot.totalRequests],
        ['Total Errors', snapshot.totalErrors],
        ['Healthy Nodes', snapshot.healthyNodes],
        ['Degraded Nodes', snapshot.degradedNodes],
        ['Unhealthy Nodes', snapshot.unhealthyNodes]
      );
      console.log(table.toString());
    }
  });

program.parse(process.argv);
