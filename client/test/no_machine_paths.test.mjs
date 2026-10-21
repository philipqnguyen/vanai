// No file in the repository may point at one machine's home directory or
// Homebrew prefix: a script with one runs only on the machine that wrote it,
// and a doc with one sends a reader somewhere they do not have. Tools find
// their programs on PATH (or an env override) and the repo from their own
// location; docs name `blender`, `basisu`, the repo-relative path.
// Covers tracked files and new, not-ignored ones, so a hit shows before commit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

// built from parts so this file does not match itself
const PATTERNS=['/'+'Users/','/'+'opt/homebrew'];

// Generated files whose paths are data, not instructions.
const ALLOW=new Set([
  'client/src/asset-index.json', // written by npm run assets:import from the maker's index
]);
const LOCKFILE=/(^|\/)(package-lock\.json|Gemfile\.lock|yarn\.lock|pnpm-lock\.yaml)$/;

test('no tracked file names a machine-specific path',()=>{
  const files=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8',maxBuffer:64<<20})
    .split('\0').filter(Boolean);
  const hits=[];
  for(const rel of new Set(files)){
    if(ALLOW.has(rel)||LOCKFILE.test(rel))continue;
    let buf;try{buf=fs.readFileSync(path.join(root,rel));}catch{continue;} // deleted in the working tree
    if(buf.subarray(0,8000).includes(0))continue; // binary
    const text=buf.toString('utf8');
    if(!PATTERNS.some(p=>text.includes(p)))continue;
    text.split('\n').forEach((line,i)=>{if(PATTERNS.some(p=>line.includes(p)))hits.push(`${rel}:${i+1}: ${line.trim().slice(0,160)}`);});
  }
  assert.deepEqual(hits,[],`${hits.length} line(s) name a machine-specific path; use PATH, an env override or a repo-relative path`);
});
