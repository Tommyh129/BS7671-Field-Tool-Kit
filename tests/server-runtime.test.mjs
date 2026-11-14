import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

test('compiled production server starts without Vite or other development dependencies', {timeout:60000}, async () => {
  const root = fileURLToPath(new URL('../',import.meta.url));
  const child = spawn(process.execPath, [
    '--require',path.join(root,'tests/fixtures/reject-development-dependencies.cjs'),
    path.join(root,'build/server/server.cjs'),
  ], {cwd:root,env:{...process.env,NODE_ENV:'production',PORT:'0',STRIPE_SECRET_KEY:''},stdio:['ignore','pipe','pipe']});
  let started = false;
  let output = '';
  await new Promise((resolve,reject) => {
    const timer = setTimeout(() => child.kill(),45000);
    child.stdout.on('data',chunk => {
      output += chunk.toString();
      if (output.includes('Server running on http://localhost:')) {
        started = true;
        child.kill();
      }
    });
    // Drain stderr without copying arbitrary environment or credential errors.
    child.stderr.resume();
    child.on('error',() => {clearTimeout(timer);reject(Error('Production server could not be launched.'));});
    child.on('close',() => {clearTimeout(timer);resolve();});
  });
  assert.equal(started,true,'Production server failed to start without development dependencies.');
});
