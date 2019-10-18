#!/usr/bin/env node

const chalk = require('chalk');
const hostile = require('../');
const minimist = require('minimist');
const net = require('net');

const argv = minimist(process.argv.slice(2));

/**
 * Print help message
 */
const help = () => {
  console.log(`
Usage: hostile [command]

Commands:
  list [all]                List all current domain records in hosts file
  set [ip] [host] [comment] Set a domain in the hosts file
  remove [domain]           Remove a domain from the hosts file
  load [file]               Load a set of host entries from a file
  unload [file]             Remove a set of host entries from a file
  `);
};

/**
 * Display all current ip records
 */
const list = full => {
  let lines;
  try {
    lines = hostile.get(full || false);
  } catch (err) {
    return error(err);
  }
  lines.forEach(item => {
    if (item.length || item.length === 0) {
      console.log(item);
    } else {
      const { ip, host, comment } = item;
      console.log(`${ip} ${chalk.green(host)}${comment ? ` # ${chalk.blue(comment)}` : ''}`);
    }
  });
};

/**
 * Set a new host
 * @param {string} ip
 * @param {string} host
 */
const set = (ip, host, comment) => {
  if (!ip || !host) {
    return error('Invalid syntax: hostile set <ip> <host> [<comment>]');
  }

  if (ip === 'local' || ip === 'localhost') {
    ip = '127.0.0.1';
  } else if (!net.isIP(ip)) {
    return error('Invalid IP address');
  }

  let inserted = 0;
  try {
    inserted = hostile.set({ ip, host, comment });
  } catch (err) {
    return error(`Error: ${err.message}. Are you running as root?`);
  }
  if (inserted === 0) {
    console.log(chalk.yellow(`Not added: ${host}`));
  } else {
    console.log(chalk.green(`Added: ${host}`));
  }

  return inserted;
};

/**
 * Remove a host
 * @param {string} host
 */
const remove = host => {
  let lines;
  try {
    lines = hostile.get(false);
  } catch (err) {
    return error(err);
  }
  let found = 0;
  lines.forEach(item => {
    if (item.host === host) {
      found++;
      try {
        hostile.remove({ ip: item.ip, host });
      } catch (err) {
        return error(`Error: ${err.message}. Are you running as root?`);
      }
      console.log(chalk.green(`Removed: ${host}`));
    }
  });
  if (found === 0) {
    console.log(chalk.yellow(`Not found: ${host}`));
  }
  return found;
};

/**
 * Load hosts given a file
 * @param {string} filePath
 */
const load = filePath => {
  const lines = parseFile(filePath);
  let inserted = 0;
  lines.forEach(({ ip, host, comment }) => {
    inserted += set(ip, host, comment);
  });
  console.log(chalk.green('\nAdded %d hosts!'), inserted);
};

/**
 * Remove hosts given a file
 * @param {string} filePath
 */
const unload = filePath => {
  const lines = parseFile(filePath);
  let removed = 0;
  lines.forEach(({ host }) => {
    removed += remove(host);
  });
  console.log(chalk.green('Removed %d hosts!'), removed);
};

/**
 * Get all the lines of the file as array of arrays [[IP, host]]
 * @param {string} filePath
 */
const parseFile = filePath => {
  let lines;
  try {
    lines = hostile.getFile(filePath, false);
  } catch (err) {
    return error(err);
  }
  return lines;
};

/**
 * Print an error and exit the program
 * @param {string} message
 */
const error = err => {
  console.error(chalk.red(err.message || err));
  process.exit(-1);
};

const command = argv._[0];

if (command === 'list' || command === 'ls') list(argv._[1]);
if (command === 'set') set(argv._[1], argv._[2], argv._[3]);
if (command === 'remove') remove(argv._[1]);
if (command === 'load') load(argv._[1]);
if (command === 'unload') unload(argv._[1]);
if (!command) help();
