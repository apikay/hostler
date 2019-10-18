const fs = require('fs');
const once = require('once');
const split2 = require('split2');
const through2 = require('through2');
const net = require('net');

const WINDOWS = process.platform === 'win32';
const EOL = WINDOWS ? '\r\n' : '\n';

const HOSTS = WINDOWS ? 'C:/Windows/System32/drivers/etc/hosts' : '/etc/hosts';

// weak function to determine if is a string, as I'm not using arrays
// const isString = item => item.length || item.length === 0;
const isString = item => typeof item === 'string' || item instanceof String;
/**
 * Get a list of the lines that make up the filePath. If the
 * `preserveFormatting` parameter is true, then include comments, blank lines
 * and other non-host entries in the result.
 *
 * @param  {boolean}   preserveFormatting
 * @param  {function(err, lines)=} cb
 */
const getFile = (filePath, preserveFormatting, cb) => {
  let lines = [];
  const online = function(chunk, enc, callback) {
    const line = isString(chunk) ? chunk : chunk.toString();
    const matches = /^((\s*(?<ip>[0-9.:]+)\s+)(?<host>[\w.\s-]+))?(\s+)?(# (?<comment>.*))?$/.exec(
      line,
    );
    if (matches && matches.groups.ip) {
      lines.push({ ...matches.groups }); // Found a hosts entry
    } else {
      if (preserveFormatting) {
        lines.push(line); // Found a comment, blank line, or something else
      }
    }
    if (typeof cb === 'function') {
      callback();
    }
  };

  if (typeof cb !== 'function') {
    fs.readFileSync(filePath, { encoding: 'utf8' })
      .split(/\r?\n/)
      .forEach(online);
    return lines;
  }
  
  cb = once(cb);
  try {
    const rs = fs.createReadStream(filePath, { encoding: 'utf8' });
    rs.on('close', () => {
      cb(null, lines);
    });
    rs.on('error', err => {
      cb(err);
    });
    rs.pipe(split2()).pipe(through2({ encoding: 'utf8' }, online));
  } catch (e) {
    console.log(e);
  }
};

/**
 * Wrapper of `getFile` for getting a list of lines in the Host file
 *
 * @param  {boolean}   preserveFormatting
 * @param  {function(err, lines)=} cb
 */
const get = (preserveFormatting, cb) => {
  return getFile(HOSTS, preserveFormatting, cb);
};

/**
 * Add a rule to /etc/hosts. If the rule already exists, then this does nothing.
 *
 * @param  {string}   ip
 * @param  {string}   host
 * @param  {function(Error)=} cb
 */
const set = (/* { ip, host, comment } */ newLine, cb) => {
  let didUpdate = false;

  const _set = lines => {
    // Try to update entry, if host already exists in file
    lines = lines.map(mapFunc);

    // If entry did not exist, let's add it
    if (!didUpdate) {
      // If the last line is empty, or just whitespace, then insert the new entry
      // right before it
      const lastLine = lines[lines.length - 1];
      if (typeof lastLine === 'string' && /\s*/.test(lastLine)) {
        lines.splice(lines.length - 1, 0, newLine);
      } else {
        lines.push(newLine);
      }
    }

    !didUpdate && writeFile(lines, cb);
    didUpdate && (typeof cb === 'function') && cb();
    return didUpdate ? 0 : 1;
  };

  const mapFunc = line => {
    // replace a line if both hostname and ip version of the address matches
    if (
      !isString(line) &&
      line.host === newLine.host &&
      net.isIP(line.ip) === net.isIP(newLine.ip)
    ) {
      line.ip = newLine.ip;
      didUpdate = true;
    }
    return line;
  };

  if (typeof cb !== 'function') {
    return _set(get(true));
  }

  get(true, (err, lines) => {
    if (err) return cb(err);
    _set(lines);
  });

  return didUpdate ? 0 : 1;
};

/**
 * Remove a rule from /etc/hosts. If the rule does not exist, then this does
 * nothing.
 *
 * @param  {string}   ip
 * @param  {string}   host
 * @param  {function(Error)=} cb
 */
const remove = ({ ip, host }, cb) => {
  const _remove = lines => {
    // Try to remove entry, if it exists
    const results = lines.filter(filterFunc);
    return results.length !== lines.length && writeFile(results, cb);
  };

  const filterFunc = line => {
    return !(!isString(line) && line.ip === ip && line.host === host);
  };

  if (typeof cb !== 'function') {
    return _remove(get(true));
  }

  get(true, (err, lines) => {
    if (err) return cb(err);
    _remove(lines);
  });
};

/**
 * Return a timestamp with the format "m/d/yy h:MM:ss TT"
 * @type {Date}
 */

const timeStamp = () => {
  // Create a date object with the current time
  var now = new Date();

  // Create an array with the current month, day and time
  var date = [now.getFullYear(), now.getMonth() + 1, now.getDate()];

  // Create an array with the current hour, minute and second
  var time = [now.getHours(), now.getMinutes(), now.getSeconds()];

  // If seconds and minutes are less than 10, add a zero
  for (var i = 1; i < 3; i++) {
    if (time[i] < 10) {
      time[i] = '0' + time[i];
    }
  }

  // Return the formatted string
  return date.join('_') + '_' + time.join('_');
};

const makeBackup = () => {
  const rs = fs.createReadStream(HOSTS, { encoding: 'utf8' });
  const target = `${HOSTS}.${timeStamp()}`;
  var ws = fs.createWriteStream(target);
  rs.pipe(ws);
};
/**
 * Write out an array of lines to the host file. Assumes that they're in the
 * format that `get` returns.
 *
 * @param  {Array.<string|Array.<string>>} lines
 * @param  {function(Error)=} cb
 */
const writeFile = (lines, cb) => {
  lines = lines.map((line, lineNum) => {
    if (!isString(line)) {
      const { host, ip, comment } = line;
      line = `${ip} ${host}${comment ? ` # ${comment}` : ''}`;
    }
    return `${line}${lineNum === lines.length - 1 ? '' : EOL}`;
  });

  makeBackup();

  if (typeof cb !== 'function') {
    const stat = fs.statSync(HOSTS);
    fs.writeFileSync(HOSTS, lines.join(''), { mode: stat.mode });
    return true;
  }

  cb = once(cb);
  fs.stat(HOSTS, (err, stat) => {
    if (err) {
      return cb(err);
    }
    const s = fs.createWriteStream(HOSTS, { mode: stat.mode });
    s.on('close', cb);
    s.on('error', cb);

    lines.forEach(data => {
      s.write(data);
    });
    s.end();
  });
};

module.exports = {
  HOSTS,
  getFile,
  get,
  set,
  remove,
  writeFile,
};
