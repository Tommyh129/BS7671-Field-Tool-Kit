import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import ts from 'typescript';

// The application uses bundler-style extensionless imports. Resolve those for
// Node's test runner without installing a second compiler or changing app imports.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL) {
    const url = new URL(specifier, context.parentURL);
    for (const suffix of ['', '.ts', '.tsx']) {
      const candidate = new URL(url.href + suffix);
      if (/\.tsx?$/.test(candidate.pathname) && existsSync(candidate)) return { url: candidate.href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (/\.tsx?$/.test(new URL(url).pathname)) {
    const source = await readFile(new URL(url), 'utf8');
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      fileName: new URL(url).pathname,
    }).outputText };
  }
  return nextLoad(url, context);
}
