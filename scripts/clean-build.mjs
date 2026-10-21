import { lstat, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const target=resolve(root,'dist')
if(dirname(target)!==root)throw new Error('Invalid build output directory')
try{if((await lstat(target)).isSymbolicLink())throw new Error('Build output must not be a link')}catch(error){if(error.code!=='ENOENT')throw error}
await rm(target,{recursive:true,force:true})
