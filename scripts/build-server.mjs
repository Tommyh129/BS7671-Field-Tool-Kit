import {build} from 'esbuild';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
// Resolve only local source with Node: native esbuild cannot traverse protected Windows ancestors.
await build({
  absWorkingDir:root,entryPoints:[path.resolve(root,'server.ts')],bundle:true,
  platform:'node',format:'cjs',sourcemap:true,outfile:path.resolve(root,'build/server/server.cjs'),
  plugins:[{name:'workspace-server-source',setup(builder){
    builder.onResolve({filter:/.*/},async args=>{
      if(args.kind!=='entry-point'&&!args.path.startsWith('.'))return {path:args.path,external:true};
      const target=path.resolve(args.importer?path.dirname(args.importer):root,args.path);
      if(path.relative(root,target).startsWith('..'))throw Error('Server source must stay within the workspace.');
      for(const file of [target,target+'.ts',target+'.tsx',target+'.js',target+'.json',path.join(target,'index.ts')]){
        if(await stat(file).then(s=>s.isFile()).catch(()=>false))return {path:file,namespace:'workspace-source'};
      }
      throw Error(`Server source not found: ${args.path}`);
    });
    builder.onLoad({filter:/.*/,namespace:'workspace-source'},async args=>({contents:await readFile(args.path,'utf8'),loader:args.path.endsWith('.json')?'json':args.path.endsWith('.tsx')?'tsx':'ts'}));
  }}],
});
console.log('Production server bundle built.');
