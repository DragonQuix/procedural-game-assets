#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { unblindReview } from './review.mjs';
const [keyFile, reviewFile, taskFile, hostEventsFile] = process.argv.slice(2);
if (!keyFile || !reviewFile || !taskFile) throw new Error('Usage: node tools/benchmark/unblind.mjs KEY REVIEW TASK_CONTRACT [HOST_EVENTS]');
const read = async (file) => JSON.parse(await readFile(file, 'utf8'));
const task = await read(taskFile);
console.log(JSON.stringify(unblindReview(await read(keyFile), await read(reviewFile), { ...task, hostEvents: hostEventsFile ? await read(hostEventsFile) : [] }), null, 2));
