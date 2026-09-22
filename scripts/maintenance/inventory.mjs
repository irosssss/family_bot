/** Read-only inventory of source dependencies; writes reports only. */
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import ts from 'typescript';
const root=process.cwd();
const names=new Set(cp.execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{maxBuffer:20*1024*1024}).toString().split('\0').filter(Boolean));
for(const dir of ['dist','dist-wardrobe-pilot'])if(fs.existsSync(dir))for(const p of fs.readdirSync(dir,{recursive:true}))if(fs.statSync(path.join(dir,p)).isFile())names.add(`${dir}/${p}`);
const code=[...names].filter(p=>/^(src|scripts|tests)\//.test(p)&&/\.[cm]?[jt]sx?$/.test(p)||p==='server.ts');
const graph=new Map(),incoming=new Map();
for(const p of code){if(!fs.existsSync(p))continue;const s=fs.readFileSync(p,'utf8');const tree=ts.createSourceFile(p,s,ts.ScriptTarget.Latest,true);const refs=[];
 const visit=n=>{let spec;if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))spec=n.moduleSpecifier.text;
 if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||n.expression.getText(tree)==='require')&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))spec=n.arguments[0].text;
 if(spec?.startsWith('.')){const r=ts.resolveModuleName(spec,path.resolve(p),{moduleResolution:ts.ModuleResolutionKind.Bundler,allowJs:true,resolveJsonModule:true},ts.sys).resolvedModule;let q=r&&path.relative(root,r.resolvedFileName);if(!q){const candidate=path.normalize(path.join(path.dirname(p),spec));if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile())q=candidate;}if(q&&!q.startsWith('node_modules')){refs.push(q);if(!incoming.has(q))incoming.set(q,[]);incoming.get(q).push(p);}}
 ts.forEachChild(n,visit);};visit(tree);graph.set(p,[...new Set(refs)]);
}
function closure(seeds){const seen=new Set();function walk(p){if(seen.has(p))return;seen.add(p);for(const q of graph.get(p)||[])walk(q);}seeds.forEach(walk);return seen;}
const v3=closure(['src/v3/V3App.tsx']);const main=closure(['src/main.tsx','server.ts']);
const target=closure(code.filter(p=>p.startsWith('scripts/target/')));const preview=closure(['src/preview/wardrobePilot/main.tsx']);
const rows=[];
for(const p of [...names].sort()){
 if(!fs.existsSync(p)||(p.startsWith('docs/reviews/repository/')||p.startsWith('work/repository-audit/')))continue;
 let category,basis,review=false;
 if(/^(dist\/|dist-wardrobe-pilot\/|work\/target-build\/)/.test(p)){category='cleanup_candidate';basis='Generated output; rebuild command recorded; not deleted';}
 else if(p.startsWith('docs/archive/')){category='archived';basis='Historical document, superseded by V3 baseline';}
 else if(v3.has(p)||p.startsWith('content-source/v3/')||/^public\/assets\/game\/(v3-ui|wardrobe-pilot\/v3)\//.test(p)){category='active';basis='Current V3 dependency or registered V3 runtime content';}
 else if(main.has(p)){category='active';basis='Single V3 entry or static preview server dependency';}
 else if(p.startsWith('src/target/')||p.startsWith('src/v3-server/')||p.startsWith('src/v3-shared/')||p.startsWith('src/v3/model/')||p.startsWith('src/v3/assets/')||target.has(p)||p.startsWith('migrations/target/')||p.startsWith('tests/target/')||p.startsWith('src/v3/access/')){category='prepared';basis='Target backend/content/access foundation; not fully connected to V3 UI';}
 else if(preview.has(p)||p==='wardrobe-pilot.html'||p==='vite.wardrobe.config.ts'){category='prepared';basis='Independent wardrobe preview and validation tooling';}
 else if(p.startsWith('public/')){category='active';basis='Included in public build asset pool; actual rendering may use dynamic paths, retained pending review';review=true;}
 else if(p.startsWith('work/')||p.startsWith('output/')){category='prepared';basis='Retained source/reference/QA evidence; not proven disposable';review=true;}
 else if(p.startsWith('src/')){category='prepared';basis='Not reached by selected static roots; requires dynamic/runtime review before archive';review=true;}
 else {category='active';basis='Project tooling, tests, contracts, plans or instructions retained';}
 rows.push({path:p,category,basis,review_required:review,imported_by:(incoming.get(p)||[]).join(' | ')});
}
const out='docs/reviews/repository';fs.mkdirSync(out,{recursive:true});
const quote=x=>'"'+String(x).replaceAll('"','""')+'"';
fs.mkdirSync('work/repository-audit',{recursive:true});
fs.writeFileSync('work/repository-audit/files.csv',['path,category,basis,review_required,imported_by',...rows.map(r=>Object.values(r).map(quote).join(','))].join('\n')+'\n');
fs.writeFileSync(`${out}/source-files.csv`,['path,category,basis,review_required,imported_by',...rows.filter(r=>! /^(public|dist|dist-wardrobe-pilot|work|output)\//.test(r.path)).map(r=>Object.values(r).map(quote).join(','))].join('\n')+'\n');
const summary={counts:Object.fromEntries(['active','prepared','archived','cleanup_candidate'].map(c=>[c,rows.filter(r=>r.category===c).length])),reviewRequired:rows.filter(r=>r.review_required).length,v3Dependencies:[...v3].sort(),sharedV3Dependencies:[...v3].filter(p=>!p.startsWith('src/v3/')&&!p.startsWith('content-source/')).sort(),limitations:['Static imports, exports, literal dynamic imports and require only; dynamic filenames and external callers not proven','Prepared with review_required means retained pending review, not confirmed roadmap scope','Legacy files removed after dependency review; only V3 catalog assets remain in public'],};fs.writeFileSync(`${out}/summary.json`,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
