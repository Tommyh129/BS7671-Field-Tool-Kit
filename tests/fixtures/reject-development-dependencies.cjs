const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (['vite', 'tsx', 'typescript'].includes(id) || id.startsWith('@vitejs/') || id.startsWith('@tailwindcss/')) {
    throw new Error('Production attempted to load a development dependency: ' + id);
  }
  return Reflect.apply(originalLoad, this, [id, ...args]);
};
